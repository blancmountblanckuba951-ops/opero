# OPERO - budowa programu i instalatora z zrodel, na Windows, bez zadnych
# narzedzi do zainstalowania z gory. Skrypt sciaga tylko silnik Electron
# (oficjalne wydanie z GitHuba) i sprawdza jego sume kontrolna.
#
# Kolejnosc: zrodla -> app.asar -> folder programu -> instalator -> instalacja.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'   # bez tego Invoke-WebRequest zwalnia kilkukrotnie

# Wersja pochodzi z app\package.json, zeby numer byl w JEDNYM miejscu
# i nie rozjechal sie miedzy programem, instalatorem a workflow na GitHubie.
$WERSJA   = try { (Get-Content (Join-Path (Split-Path -Parent $PSScriptRoot) 'app\package.json') -Raw | ConvertFrom-Json).version } catch { '1.24.0' }
$ELEKTRON = '43.5.0'
$SUMA_EL  = '1fc131e62cafa02f0c94b5ec730c4eb1e8ce75e5f5b84f3c52a3443d86058184'
$SUMA_7ZR = '27cbe3d5804ad09e90bbcaa916da0d5c3b0be9462d0e0fb6cb54be5ed9030875'
$SUMA_NSIS= 'a2ec86beacc2f3141be3906e1eee288476916f70f1f2df8900b487365a578199'

# Tryb „tylko zbuduj": uzywa go GitHub Actions i kazdy, kto chce sam plik .exe
# bez instalowania programu u siebie. Zadnych pytan, zadnego uruchamiania.
$TYLKO_BUDUJ = ($env:OPERO_TYLKO_BUDUJ -eq '1')
# Skrypt mieszka w narzedzia\, zeby w glownym folderze stal TYLKO jeden plik
# do klikniecia. Korzen paczki jest wiec pietro wyzej.
$ZR   = Split-Path -Parent $PSScriptRoot
$BAZA = Join-Path $env:LOCALAPPDATA 'OPERO-budowa'
$CACHE= Join-Path $BAZA 'pobrane'
$OUT  = Join-Path $BAZA "OPERO-$WERSJA"
$CEL  = Join-Path $env:LOCALAPPDATA 'Programs\OPERO'

# ---------------------------------------------------------------- zapis plikow
# Windows PowerShell 5.1 przy `Set-Content -Encoding UTF8` dopisuje na poczatku
# pliku ZNACZNIK KOLEJNOSCI BAJTOW (BOM) - trzy niewidoczne bajty. Czlowiek ich
# nie zobaczy, ale `JSON.parse` w Node i w samym programie przewraca sie na nich
# z komunikatem „Unexpected token". Tak wlasnie posypal sie manifest modelu, a
# gorzej: ten sam BOM siedzial w plikach, ktore program czyta juz U KLIENTA.
# Dlatego kazdy plik tekstowy piszemy TUTAJ, bez znacznika.
function ZapiszTekst($sciezka, $tekst) {
  $bezZnacznika = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($sciezka, [string]$tekst, $bezZnacznika)
}

function Krok($n, $t) { Write-Host ""; Write-Host "  [$n/6] $t" -ForegroundColor Cyan }
function Info($t)     { Write-Host "        $t" -ForegroundColor DarkGray }
function Blad($t)     { Write-Host ""; Write-Host "  BLAD: $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  OPERO $WERSJA - budowa ze zrodel" -ForegroundColor Yellow
Write-Host "  =================================="
Info "zrodla:      $ZR"
Info "budowa:      $OUT"
Info "instalacja:  $CEL"

New-Item -ItemType Directory -Force -Path $CACHE | Out-Null

# ------------------------------------------------- 0b. repozytorium aktualizacji
# Program musi wiedziec, GDZIE sprawdzac nowsza wersje siebie i nowszy model.
# Zamiast kazac to wpisywac recznie, bierzemy nazwe repozytorium wprost z gita
# albo z GitHub CLI - i tak jedno i drugie jest potrzebne do wyslania kodu.
# Wpis robimy tylko wtedy, gdy pole jest puste: recznie wpisana wartosc wygrywa.
$plikUstawien = Join-Path $ZR 'app\config.production.json'
if (Test-Path $plikUstawien) {
  try {
    $ust = Get-Content $plikUstawien -Raw | ConvertFrom-Json
    if (-not $ust.aktualizacjeRepo) {
      $repo = ''
      $zdalny = (& git -C $ZR remote get-url origin 2>$null)
      if ($zdalny -match 'github\.com[:/]+([^/]+)/([^/.]+)') { $repo = "$($Matches[1])/$($Matches[2])" }
      if (-not $repo) {
        $kto = (& gh api user --jq .login 2>$null)
        if ($kto) { $repo = "$kto/OPERO" }
      }
      if ($repo) {
        $ust.aktualizacjeRepo = $repo
        ZapiszTekst $plikUstawien ($ust | ConvertTo-Json -Depth 5)
        Write-Host ""
        Write-Host "  [0b] Repozytorium aktualizacji: $repo" -ForegroundColor Cyan
        Write-Host "        wpisane do app\config.production.json - stad program czyta" -ForegroundColor DarkGray
        Write-Host "        nowsza wersje siebie ORAZ model.json z nowszym modelem" -ForegroundColor DarkGray
      }
    }
  } catch { }
}

# ---------------------------------------------------------------- 1. app.asar
Krok 1 'Pakowanie kodu programu (app.asar)'
# Node.js jest wymagany i nie ma od tego wyjatku. Wczesniej lezal tu gotowy
# app.asar „na wypadek braku Node" - i to byl zly pomysl: archiwum z poprzedniej
# budowy potrafi byc STARSZE niz zrodla obok, a wtedy budowa cicho wypuszcza
# nieaktualny program. Lepiej raz poprosic o zainstalowanie Node niz wydac
# instalator z kodem sprzed dwoch poprawek.
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Blad 'Nie znalazlem Node.js, a bez niego nie zloze kodu programu.'
  Blad 'Zainstaluj Node.js 22 (nodejs.org, wersja LTS) i uruchom budowe ponownie.'
  exit 1
}
if (-not (Test-Path (Join-Path $ZR 'app'))) { Blad "Nie widze katalogu ze zrodlami: $(Join-Path $ZR 'app')"; exit 1 }
Info "Node.js $(& node -v) - skladam z katalogu app\"
# KLUCZ PUBLICZNY LICENCJI. OPERO sprawdza klucze klientow kluczem publicznym
# wpisanym w program. Bierzemy go z generatora kluczy na TYM komputerze (plik
# klucz-publiczny.txt w folderze budowy) albo ze zmiennej OPERO_KLUCZ_PUBLICZNY
# (budowa na GitHubie). Dzieki temu program i generator zawsze uzywaja tej samej
# pary - nikt nie musi niczego przepisywac recznie. Zrodel w app\ nie ruszamy:
# podmiana idzie na kopii, z ktorej pakujemy app.asar.
$WZOR_KLUCZA = '^MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=$'
$kluczPub = ''; $skad = ''
if ($env:OPERO_KLUCZ_PUBLICZNY) { $kluczPub = $env:OPERO_KLUCZ_PUBLICZNY.Trim(); $skad = 'zmienna OPERO_KLUCZ_PUBLICZNY' }
elseif (Test-Path (Join-Path $BAZA 'klucz-publiczny.txt')) { $kluczPub = (Get-Content (Join-Path $BAZA 'klucz-publiczny.txt') -Raw).Trim().TrimStart([char]0xFEFF); $skad = Join-Path $BAZA 'klucz-publiczny.txt' }
$doSpakowania = Join-Path $ZR 'app'
if ($kluczPub) {
  if ($kluczPub -notmatch $WZOR_KLUCZA) { Blad "Klucz publiczny z $skad ma zly format. Utworz go jeszcze raz w generatorze kluczy."; exit 1 }
  $kopiaApp = Join-Path $BAZA 'app-zrodla'
  if (Test-Path $kopiaApp) { Remove-Item $kopiaApp -Recurse -Force }
  Copy-Item (Join-Path $ZR 'app') $kopiaApp -Recurse -Force
  $plikLic = Join-Path $kopiaApp 'licencja-offline.js'
  $tresc = [System.IO.File]::ReadAllText($plikLic)
  $nowa = [regex]::Replace($tresc, "const KLUCZ_PUBLICZNY = '[^']*';", "const KLUCZ_PUBLICZNY = '$kluczPub';")
  if ($nowa -notmatch [regex]::Escape("const KLUCZ_PUBLICZNY = '$kluczPub';")) { Blad 'Nie udalo sie wpisac klucza publicznego do programu.'; exit 1 }
  ZapiszTekst $plikLic $nowa
  $doSpakowania = $kopiaApp
  Info "klucz licencji: $($kluczPub.Substring(16,12))... (z: $skad)"
} else {
  Write-Host ''
  Write-Host '  UWAGA: nie znalazlem klucza publicznego z generatora kluczy.' -ForegroundColor Yellow
  Write-Host '  Program dostanie klucz wbudowany w zrodla. Jesli jego klucz prywatny zaginal,' -ForegroundColor Yellow
  Write-Host '  NIKT nie wyda do tej wersji nowej licencji. Utworz klucz w generatorze' -ForegroundColor Yellow
  Write-Host '  (przycisk "Nie mam pliku - utworz nowy klucz") i zbuduj ponownie.' -ForegroundColor Yellow
  Write-Host ''
}
$asar = Join-Path $BAZA 'app.asar'
& node (Join-Path $PSScriptRoot 'asar_tool.js') pack $doSpakowania $asar | ForEach-Object { Info $_ }
if ($LASTEXITCODE -ne 0) { Blad 'Nie udalo sie spakowac kodu programu.'; exit 1 }

# --------------------------------------------------------------- 2. Electron
Krok 2 "Silnik Electron $ELEKTRON"
$zip = Join-Path $CACHE "electron-v$ELEKTRON-win32-x64.zip"
if (Test-Path $zip) {
  Info 'juz pobrany - sprawdzam sume'
} else {
  Info 'pobieram ~110 MB z github.com/electron/electron ...'
  Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$ELEKTRON/electron-v$ELEKTRON-win32-x64.zip" -OutFile $zip
}
$s = (Get-FileHash $zip -Algorithm SHA256).Hash
if ($s -ne $SUMA_EL.ToUpper()) {
  Remove-Item $zip -Force
  Blad "Pobrany Electron ma zla sume kontrolna. Plik skasowany - uruchom skrypt jeszcze raz."
  exit 1
}
Info 'suma kontrolna zgodna'

# ------------------------------------------------------- 3. folder programu
Krok 3 'Skladanie folderu programu'
if (Test-Path $OUT) { Remove-Item $OUT -Recurse -Force }
New-Item -ItemType Directory -Force -Path $OUT | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($zip, $OUT)

Rename-Item (Join-Path $OUT 'electron.exe') 'OPERO.exe'
Remove-Item (Join-Path $OUT 'resources\default_app.asar') -Force -ErrorAction SilentlyContinue
Copy-Item $asar (Join-Path $OUT 'resources\app.asar') -Force
Copy-Item (Join-Path $PSScriptRoot 'opero.ico') $OUT -Force


# Silnik PER, czyli llama-server.exe - kilkadziesiat MB, jedzie w instalatorze.
# Modelu (ponad 6 GB) tu NIE MA i byc nie moze: Windows nie uruchamia plikow
# .exe wiekszych niz okolo 4 GB. Pobiera go sam program, u klienta, po klikniecu
# w panelu asystenta PER. Budowa zdobywa tylko adres, rozmiar i sume SHA-256 -
# wszystko trzy daje spis plikow Hugging Face, bez sciagania czegokolwiek.
$SILNIK = Join-Path $ZR 'silnik'
function SilnikGotowy {
  if (-not (Test-Path (Join-Path $SILNIK 'llama-server.exe'))) { return $false }
  if (-not (Test-Path (Join-Path $SILNIK 'ZAMEK.json'))) { return $false }
  try {
    $z = Get-Content (Join-Path $SILNIK 'ZAMEK.json') -Raw | ConvertFrom-Json
    return [bool]($z.model.url -and $z.model.suma)
  } catch { return $false }
}
$silnikJest = SilnikGotowy
if (-not $silnikJest -and -not $env:OPERO_BEZ_MODELU) {
  Krok '3b' 'Silnik PER i adres modelu'
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'pobierz-silnik.ps1')
  if ($LASTEXITCODE -ne 0) { Blad 'Nie udalo sie przygotowac silnika PER.'; exit 1 }
  $silnikJest = SilnikGotowy
}
if ($silnikJest) {
  $mb = [math]::Round(((Get-ChildItem $SILNIK -Recurse -File | Measure-Object Length -Sum).Sum/1MB))
  Info "silnik PER gotowy: $mb MB (model pobierze sam program)"
} else {
  Info 'buduje BEZ silnika - PER nie bedzie mial czego uruchomic'
}

# Manifest modelu dla programu: silnik\model.json. Dzieki niemu program WIE,
# co pobrac i czym to sprawdzic, zanim w ogole zapyta sieci - a rzeczoznawca ma
# w panelu PER gotowy przycisk zamiast pola na adres. Nikt niczego nie musi
# nigdzie wrzucac ani wpisywac.
# Robimy to DWOMA drogami, bo to jedna z tych rzeczy, ktore nie moga nie wyjsc:
# manifestem z ZAMEK.json (ponizej) i wbudowanym zrodlem modelu (dalej). Wystarczy
# jedna z nich, wiec nieudana pierwsza NIE jest awaria - i nie wolno jej tak
# nazywac, bo to tylko straszy bez powodu. Prawdziwy alarm jest tylko wtedy, gdy
# zawioda obie; sprawdzamy to na koncu kroku.
$manifestOk = $false
$zrodloOk  = $false
if ($node -and (Test-Path (Join-Path $SILNIK 'ZAMEK.json'))) {
  & node (Join-Path $PSScriptRoot 'zapisz-manifest.js') $SILNIK
  $manifestOk = ($LASTEXITCODE -eq 0)
  if (-not $manifestOk) { Info 'manifest z ZAMEK.json nie powstal - probuje druga droga (powod wyzej)' }
}

# Silnik PER (llama-server.exe + biblioteki + licencje) JEDZIE w instalatorze.
# Wazy kilkadziesiat MB, wiec miesci sie bez problemu. Osobno pobiera sie tylko
# sam model (kilka GB) - i tylko on.
#
# Tu byl blad, przez ktory program u klienta mowil „to wersja lekka": gdy
# zrezygnowalem z wielkiej paczki, silnik wypadl z instalatora RAZEM z modelem,
# choc powinien byl zostac. Bez niego nie ma czego uruchomic, nawet gdy model
# juz lezy na dysku. Kopiujemy TU, a nie wyzej, bo wyzej silnika moze jeszcze
# nie byc - pobiera sie dopiero w kroku 3b.
if (Test-Path (Join-Path $SILNIK 'llama-server.exe')) {
  # SILNIK JEDZIE JAKO PACZKA .ZIP, A NIE JAKO GOTOWY .EXE.
  #
  # Tu jest sedno bledu, ktory wracal przy kazdej instalacji: Windows nie
  # pozwala nadpisac pliku .exe, ktory jest uruchomiony albo ktory system
  # trzyma jeszcze przez chwile po zamknieciu (robi tak antywirus i indeksator).
  # Instalator stawal wtedy z pytaniem „Przerwij / Ponow probe / Ignoruj".
  # Zamykanie procesow tego nie rozwiazuje na pewno - rozwiazuje to dopiero
  # ZABRANIE INSTALATOROWI tego pliku. W instalatorze jest wiec zwykla paczka
  # danych, ktorej nikt nigdy nie uruchamia, a program rozpakowuje ja sobie sam
  # do swojego folderu danych, przy pierwszym starcie albo przyciskiem „Napraw".
  $doProgramu = Join-Path $OUT 'resources'
  New-Item -ItemType Directory -Force -Path $doProgramu | Out-Null
  $paczka = Join-Path $doProgramu 'silnik.zip'
  if (Test-Path $paczka) { Remove-Item $paczka -Force }
  # Pakujemy wszystko OPROCZ folderu model\ - to w nim leza te kilka gigabajtow.
  # Liste plikow budujemy wprost, bez wzorca: wzorzec „*.*" wciagnalby takze
  # podfoldery z kropka w nazwie, a tego akurat nie chcemy.
  $plikiSilnika = @(Get-ChildItem $SILNIK -File | Select-Object -ExpandProperty FullName)
  if (-not $plikiSilnika) { Blad 'Folder silnika jest pusty - nie ma czego spakowac.'; exit 1 }
  Compress-Archive -Path $plikiSilnika -DestinationPath $paczka -CompressionLevel Optimal
  $mbSilnika = [math]::Round(((Get-Item $paczka).Length/1MB))
  Info "paczka silnika w instalatorze: $mbSilnika MB (rozpakuje ja sam program)"

  # Pliki opisowe jada OBOK paczki, luzem. To zwykly tekst, ktorego nikt nie
  # uruchamia, wiec instalator moze je nadpisywac bez ryzyka - a program wie
  # dzieki nim, skad pobrac model, jeszcze zanim cokolwiek rozpakuje.
  $doProgramu = Join-Path $OUT 'resources\silnik'
  New-Item -ItemType Directory -Force -Path $doProgramu | Out-Null
  Get-ChildItem (Join-Path $SILNIK '*') -Include *.json, *.txt -File |
    ForEach-Object { Copy-Item $_.FullName $doProgramu -Force }

  # WBUDOWANE ZRODLO MODELU.
  # Program musi wiedziec, skad wziac model, NIE PYTAJAC o nic czlowieka. Adres,
  # rozmiar i suma SHA-256 sa juz znane - zapisal je pobierz-silnik.ps1 w
  # ZAMEK.json, gdy sciagal model do budowy. Przepisujemy je do programu jako
  # zrodlo domyslne (prosto z Hugging Face, bez posrednikow). Dzieki temu swiezo
  # zainstalowany OPERO zaczyna pobierac model sam, zanim ktokolwiek cokolwiek
  # skonfiguruje.
  try {
    $z = Get-Content (Join-Path $SILNIK 'ZAMEK.json') -Raw | ConvertFrom-Json
    # Nazwa pliku stoi w adresie, wiec gdy zamek jej nie ma (starszy format),
    # bierzemy ja stamtad. Puste pole „nazwa" unieruchomiloby pobieranie, choc
    # program znalby adres - a to najglupszy mozliwy powod awarii.
    $nazwaModelu = "$($z.model.plik)"
    if (-not $nazwaModelu -and $z.model.url) {
      $nazwaModelu = [uri]::UnescapeDataString((([uri]"$($z.model.url)").Segments[-1]).TrimEnd('/'))
    }
    if ($z.model.url -and $z.model.suma -and $nazwaModelu) {
      $zrodlo = [ordered]@{
        nazwa   = $nazwaModelu
        rozmiar = $z.model.rozmiar
        suma    = $z.model.suma
        opis    = "Model $nazwaModelu ($($z.model.licencja), $($z.model.autor))."
        url     = $z.model.url
        repoHf  = $z.model.repo
      }
      ZapiszTekst (Join-Path $doProgramu 'model-domyslny.json') ($zrodlo | ConvertTo-Json -Depth 4)
      Info "wbudowane zrodlo modelu: $($z.model.repo)"
      $zrodloOk = $true

      # Gdy manifest nie powstal wyzej (np. starszy ZAMEK.json bez nazwy pliku),
      # a tu dane sa kompletne - dopisujemy model.json z tego samego zrodla, zeby
      # program mial oba pliki, tak jak przy udanej budowie.
      if (-not $manifestOk -and $nazwaModelu) {
        $mf = [ordered]@{
          nazwa = $nazwaModelu; rozmiar = $z.model.rozmiar; suma = "$($z.model.suma)".ToLower()
          url = $z.model.url; repo = $z.model.repo; licencja = $z.model.licencja
          autor = $z.model.autor; opis = "Model $nazwaModelu."; czesci = @()
        }
        ZapiszTekst (Join-Path $doProgramu 'model.json') ($mf | ConvertTo-Json -Depth 4)
        Info 'manifest modelu zapisany z ZAMEK.json bez Node'
        $manifestOk = $true
      }
    } else {
      Blad 'ZAMEK.json nie ma adresu, sumy albo nazwy modelu - probuje inna droga.'
    }
  } catch {
    Blad "Nie udalo sie zapisac wbudowanego zrodla modelu: $($_.Exception.Message)"
  }

  # Dopiero TERAZ wiadomo, czy jest problem. Jedna droga wystarczy.
  if ($manifestOk -or $zrodloOk) {
    Info 'program wie, skad pobrac model - klient pobierze go przyciskiem w panelu PER'
  } else {
    Blad 'Program NIE BEDZIE wiedzial, skad pobrac model - zadna z dwoch drog nie wyszla.'
    Blad 'Uruchom narzedzia\pobierz-silnik.ps1 -Odswiez i zbuduj ponownie.'
  }
} else {
  Blad 'W instalatorze NIE BEDZIE silnika PER - asystent nie ruszy u klienta.'
  Blad 'Uruchom budowe ponownie z dostepem do internetu.'
}

# ------------------------------------------------------------ 4. instalator
Krok 4 'Budowa instalatora (NSIS)'

function Pobierz($url, $plik, $suma, $opis) {
  if (-not (Test-Path $plik)) { Info "pobieram $opis"; Invoke-WebRequest -Uri $url -OutFile $plik }
  $h = (Get-FileHash $plik -Algorithm SHA256).Hash
  if ($h -ne $suma.ToUpper()) { Remove-Item $plik -Force; throw "$opis ma zla sume kontrolna - plik skasowany, uruchom skrypt ponownie" }
}

# Najpierw NSIS zainstalowany w systemie, potem wlasna kopia przenosna.
$makensis = $null
foreach ($p in @(
    (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source,
    "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
    "$env:ProgramFiles\NSIS\makensis.exe",
    (Join-Path $CACHE 'nsis\Bin\makensis.exe'))) {
  if ($p -and (Test-Path $p)) { $makensis = $p; break }
}

if (-not $makensis) {
  # NSIS-a nie ma - sciagamy przenosna kopie (1,3 MB) plus maly rozpakowywacz 7z.
  # Oba z wydan GitHuba, oba sprawdzane suma kontrolna.
  $roz7z = Join-Path $CACHE '7zr.exe'
  $n7 = Join-Path $CACHE 'nsis-3.0.4.2.7z'
  Pobierz 'https://github.com/ip7z/7zip/releases/download/25.01/7zr.exe' $roz7z $SUMA_7ZR '7zr.exe (0,6 MB)'
  Pobierz 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.2/nsis-3.0.4.2.7z' $n7 $SUMA_NSIS 'NSIS 3.0.4.2 (1,3 MB)'
  $nd = Join-Path $CACHE 'nsis'
  if (Test-Path $nd) { Remove-Item $nd -Recurse -Force }
  & $roz7z x $n7 "-o$nd" -y | Out-Null
  $makensis = Join-Path $nd 'Bin\makensis.exe'
  if (-not (Test-Path $makensis)) { Blad 'Nie udalo sie rozpakowac NSIS.'; exit 1 }
  Info 'przenosny NSIS gotowy (zostaje w pamieci podrecznej)'
  # Tylko przenosna kopia potrzebuje wskazania katalogu z Include\ i Stubs\.
  # NSIS zainstalowany w systemie zna swoje miejsce sam.
  $env:NSISDIR = $nd
}
Info "kompilator: $makensis"

$setup = Join-Path $BAZA "OPERO-Setup-$WERSJA.exe"
$nsi = Join-Path $BAZA 'opero.nsi'
$trescNsi = (Get-Content (Join-Path $PSScriptRoot 'opero.nsi') -Raw).
  Replace('@WERSJA@', $WERSJA).
  Replace('@WYJSCIE@', $setup).
  Replace('@IKONA@', (Join-Path $OUT 'opero.ico')).
  Replace('@ZRODLO@', $OUT)
ZapiszTekst $nsi $trescNsi
if (Test-Path $setup) { Remove-Item $setup -Force }
Info 'kompiluje - to trwa kilka minut, pakowanych jest 360 MB'
& $makensis '/INPUTCHARSET' 'UTF8' $nsi | Select-Object -Last 3 | ForEach-Object { Info $_.Trim() }
if (-not (Test-Path $setup)) { Blad 'NSIS nie wyprodukowal pliku .exe - przewin wyzej po komunikat.'; exit 1 }
$mb = [math]::Round((Get-Item $setup).Length/1MB)
$sumaSetup = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
Info "gotowy instalator: $mb MB"

# Instalator laduje obok zrodel, zeby nie trzeba go bylo szukac.
$kopia = Join-Path $ZR "OPERO-Setup-$WERSJA.exe"
Copy-Item $setup $kopia -Force
"$sumaSetup *OPERO-Setup-$WERSJA.exe" | Set-Content (Join-Path $ZR "OPERO-Setup-$WERSJA.exe.sha256") -Encoding ASCII
Info "kopia obok tego skryptu: $kopia"

if ($TYLKO_BUDUJ) {
  Write-Host ""
  Write-Host "  Gotowe. Instalator:" -ForegroundColor Green
  Write-Host "  $kopia"
  Write-Host "  SHA-256: $sumaSetup"
  exit 0
}

# ------------------------------------------------------------ 5. instalacja
Krok 5 'Instalacja'
# Zamykamy OBA procesy. Serwer modelu (llama-server.exe) zyje osobno i po
# ubiciu samego OPERO zostaje w pamieci, trzymajac wlasny plik .exe otwarty -
# a wtedy instalator nie moze go nadpisac i pyta „Przerwij / Ponow / Ignoruj".
foreach ($nazwa in @('OPERO', 'llama-server', 'server')) {
  Get-Process $nazwa -ErrorAction SilentlyContinue | ForEach-Object {
    Info "zamykam dzialajacy proces: $($_.ProcessName)"
    try { $_.Kill() } catch { }
  }
}
Start-Sleep 2
Info 'uruchamiam zbudowany instalator'
Start-Process -FilePath $setup -Wait

# ------------------------------------------------------------ 6. sprawdzenie
Krok 6 'Sprawdzenie'
$exe = Join-Path $CEL 'OPERO.exe'
$ok = (Test-Path $exe) -and (Test-Path (Join-Path $CEL 'resources\app.asar'))
if (-not $ok) { Blad "Po instalacji brakuje plikow w $CEL"; exit 1 }
$sz = (Get-FileHash (Join-Path $CEL 'resources\app.asar') -Algorithm SHA256).Hash
Info "OPERO.exe na miejscu, app.asar $($sz.Substring(0,16))..."

Write-Host ""
Write-Host "  Gotowe. OPERO $WERSJA zainstalowane w:" -ForegroundColor Green
Write-Host "  $CEL"
Write-Host ""
Write-Host "  Instalator do wysylania i sprzedazy:" -ForegroundColor Yellow
Write-Host "  $kopia"
Write-Host "  SHA-256: $sumaSetup"
Write-Host ""
Write-Host "  To jest CALOSC - jeden plik do wyslania klientowi." -ForegroundColor DarkGray
Write-Host "  Model sztucznej inteligencji nie jest w srodku i byc nie moze" -ForegroundColor DarkGray
Write-Host "  (Windows nie uruchamia plikow .exe wiekszych niz ok. 4 GB)." -ForegroundColor DarkGray
Write-Host "  Po instalacji klient klika PER w gornym pasku i widzi kolor:" -ForegroundColor DarkGray
Write-Host "    czerwony     - modelu nie ma, jest przycisk Pobierz model" -ForegroundColor DarkGray
Write-Host "    pomaranczowy - model jest, ale wyszedl nowszy" -ForegroundColor DarkGray
Write-Host "    zielony      - model wgrany i aktualny" -ForegroundColor DarkGray
Write-Host ""
$o = Read-Host '  Uruchomic program teraz? [T/n]'
if ($o -eq '' -or $o -match '^[TtYy]') { Start-Process $exe }
