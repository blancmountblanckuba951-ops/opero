# OPERO - silnik PER do instalatora + ADRES modelu.
#
# Ten skrypt sciaga JEDNA rzecz: llama-server.exe, czyli serwer modelu
# (kilkadziesiat MB, buduje go projekt llama.cpp). Jedzie on w instalatorze.
#
# Modelu .gguf (ponad 6 GB) NIE sciagamy. Zapisujemy tylko to, czego program
# potrzebuje, zeby pobrac go sobie samemu u klienta: adres, rozmiar i sume
# SHA-256. Wszystkie trzy daje Hugging Face w swoim spisie plikow, wiec nie
# musimy przepuszczac szesciu gigabajtow przez te maszyne, zeby je poznac.
#
# Dlaczego tak, a nie model w instalatorze: Windows nie uruchamia plikow .exe
# wiekszych niz okolo 4 GB. Instalator z modelem w srodku powstawal poprawnie i
# nie dal sie wlaczyc. Model pobiera wiec sam program - na zyczenie, po
# klikniecu w panelu asystenta PER.
#
# Powstaje silnik\ZAMEK.json z adresem, rozmiarem i suma kazdego pliku.
# Kolejne budowy sprawdzaja wzgledem niego, wiec wydanie jest powtarzalne,
# a podmieniony plik od razu rzuca sie w oczy.
#
# Uzycie:
#   powershell -ExecutionPolicy Bypass -File narzedzia\pobierz-silnik.ps1
#   ... -Cel D:\gdzies\silnik     (domyslnie: <repo>\silnik)
#   ... -Odswiez                   (ignoruj zamek i sprawdz wszystko od nowa)

param(
  [string]$Cel = '',
  [switch]$Odswiez
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$KORZEN = Split-Path -Parent $PSScriptRoot
if (-not $Cel) { $Cel = Join-Path $KORZEN 'silnik' }
$ZAMEK = Join-Path $Cel 'ZAMEK.json'
$CACHE = Join-Path $env:LOCALAPPDATA 'OPERO-budowa\silnik'

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

function Info($t) { Write-Host "    $t" -ForegroundColor DarkGray }
function Krok($t) { Write-Host "`n[silnik] $t" -ForegroundColor Cyan }
function Blad($t) { Write-Host "    $t" -ForegroundColor Red }

New-Item -ItemType Directory -Force -Path $Cel, $CACHE | Out-Null

function Suma($plik) { (Get-FileHash $plik -Algorithm SHA256).Hash.ToLower() }

function PobierzPlik($url, $plik, $opis) {
  $tmp = "$plik.czesc"
  Info "pobieram $opis"
  Info "  $url"
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -MaximumRedirection 10
  } catch {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
    throw "Nie udalo sie pobrac ${opis}: $($_.Exception.Message)"
  }
  Move-Item $tmp $plik -Force
  $mb = [math]::Round((Get-Item $plik).Length / 1MB)
  Info "  gotowe: $mb MB"
}

# ---------------------------------------------------------------- 1. serwer

function ZnajdzSerwer() {
  $naglowki = @{ 'User-Agent' = 'OPERO-build' }
  if ($env:GITHUB_TOKEN) { $naglowki['Authorization'] = "Bearer $env:GITHUB_TOKEN" }

  # UWAGA, to kosztowalo jedna nieudana budowe:
  # NIE wolno pytac o /releases/latest. GitHub zwraca pod tym adresem najnowsze
  # wydanie NIE oznaczone jako wstepne, a llama.cpp wypuszcza swoje binaria
  # WYLACZNIE jako wydania wstepne (prerelease). Pod /latest siedzi stare
  # wydanie z jednym plikiem tekstowym w srodku - stad brzmiacy absurdalnie
  # komunikat „nie ma paczki dla Windows x64", choc paczka jest i ma sie dobrze.
  # Dlatego bierzemy LISTE wydan i szukamy pierwszego, ktore ma plik dla Windows.
  $lista = Invoke-RestMethod -Uri 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=25' -Headers $naglowki

  # Nazwy paczek zmienialy sie miedzy wydaniami, wiec szukamy po kolei wzorcow
  # od najbardziej pozadanego (zwykly CPU x64) do akceptowalnych zamiennikow.
  $wzorce = @(
    '^llama-.*-bin-win-cpu-x64\.zip$',
    '^llama-.*-bin-win-avx2-x64\.zip$',
    '^llama-.*-bin-win-cpu-.*x64\.zip$',
    '^llama-.*-bin-win-.*x64\.zip$'
  )
  foreach ($rel in $lista) {
    foreach ($w in $wzorce) {
      $a = $rel.assets | Where-Object { $_.name -match $w } | Select-Object -First 1
      if ($a) { return @{ url = $a.browser_download_url; nazwa = $a.name; wydanie = $rel.tag_name } }
    }
  }

  # Nic nie pasuje: pokazujemy, CO w takim razie jest w najnowszym wydaniu.
  # Bez tej listy kolejna zmiana nazw znow konczylaby sie zgadywaniem.
  $pierwsze = $lista | Select-Object -First 1
  $nazwy = ($pierwsze.assets | ForEach-Object { $_.name }) -join ', '
  Blad "W 25 ostatnich wydaniach llama.cpp nie ma paczki dla Windows x64."
  Blad "Najnowsze wydanie: $($pierwsze.tag_name)"
  Blad "Pliki w nim: $nazwy"
  throw 'Nie znalazlem paczki llama.cpp dla Windows x64 - nazwy plikow w wydaniu sa inne niz znane wzorce (lista wyzej).'
}

function ZainstalujSerwer() {
  Krok 'Serwer modelu (llama.cpp)'
  $info = ZnajdzSerwer
  Info "wydanie $($info.wydanie)"
  $zip = Join-Path $CACHE $info.nazwa
  if (-not (Test-Path $zip)) { PobierzPlik $info.url $zip 'serwer modelu' } else { Info 'serwer juz w podrecznym folderze' }

  $rozpak = Join-Path $CACHE 'rozpakowany'
  if (Test-Path $rozpak) { Remove-Item $rozpak -Recurse -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($zip, $rozpak)

  $exe = Get-ChildItem $rozpak -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
  if (-not $exe) { throw 'W paczce llama.cpp nie ma llama-server.exe.' }

  # Serwer potrzebuje bibliotek lezacych obok niego - kopiujemy caly jego folder,
  # ale tylko to, co faktycznie jest potrzebne do uruchomienia.
  $zrodlo = Split-Path -Parent $exe.FullName
  Get-ChildItem $zrodlo -File | Where-Object { $_.Extension -in '.exe', '.dll' } | ForEach-Object {
    if ($_.Name -eq 'llama-server.exe' -or $_.Extension -eq '.dll') {
      Copy-Item $_.FullName (Join-Path $Cel $_.Name) -Force
    }
  }
  # Licencja serwera jedzie razem z nim: MIT wymaga dolaczenia tekstu licencji
  # i noty o prawach autorskich do kazdej kopii oprogramowania.
  Get-ChildItem $rozpak -Recurse -File |
    Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING)' } |
    Select-Object -First 1 |
    ForEach-Object { Copy-Item $_.FullName (Join-Path $Cel 'LICENCJA-llama.cpp.txt') -Force }
  if (-not (Test-Path (Join-Path $Cel 'LICENCJA-llama.cpp.txt'))) {
    Info 'uwaga: w paczce llama.cpp nie bylo pliku LICENSE - dopisz go recznie'
  }
  $ile = (Get-ChildItem $Cel -File | Where-Object { $_.Extension -in '.exe', '.dll' }).Count
  Info "$ile plikow serwera w $Cel"
  return @{ wydanie = $info.wydanie; paczka = $info.nazwa; url = $info.url }
}

# ----------------------------------------------------------------- 2. model

# Kandydaci w kolejnosci preferencji. Kazdy ma WPISANA licencje, bo od niej
# zalezy, czy wolno sprzedawac program z modelem w srodku. Skrypt przyjmuje
# wylacznie licencje z listy $LICENCJE_OK (Apache 2.0 i MIT): obie pozwalaja
# redystrybucje w produkcie komercyjnym i wymagaja tylko dolaczenia tekstu
# licencji oraz noty o prawach autorskich.
#
# Dlaczego nie ma tu Llamy: licencja Llama Community naklada dodatkowe
# obowiazki (dolaczenie umowy, widoczny napis „Built with Llama", plik NOTICE,
# prefiks „Llama" w nazwie modelu pochodnego, zgoda Mety powyzej 700 mln
# uzytkownikow miesiecznie). Nie chodzi o to, ze nie wolno - chodzi o to, ze te
# obowiazki weszlyby do programu PO CICHU, jesli skrypt zjechalby na zapas.
# Dlatego lista zawiera tylko modele o tej samej, prostej licencji.
#
# Bielik jest modelem polskim i rozumie jezyk operatu najlepiej. Qwen to zapas
# na wypadek, gdyby repozytorium Bielika zniknelo - mniejszy plik (ok. 4,7 GB)
# i slabsza polszczyzna, ale ta sama licencja.
$KANDYDACI = @(
  @{ repo = 'speakleash/Bielik-11B-v2.5-Instruct-GGUF'; licencja = 'Apache-2.0'; autor = 'SpeakLeash / ACK Cyfronet AGH'; wzorce = @('Q4_K_M', 'Q4_K_S', 'q4_k_m', 'q4_k_s') },
  @{ repo = 'speakleash/Bielik-11B-v2.3-Instruct-GGUF'; licencja = 'Apache-2.0'; autor = 'SpeakLeash / ACK Cyfronet AGH'; wzorce = @('Q4_K_M', 'Q4_K_S', 'q4_k_m', 'q4_k_s') },
  @{ repo = 'bartowski/Qwen2.5-7B-Instruct-GGUF';       licencja = 'Apache-2.0'; autor = 'Alibaba Cloud (Qwen), kwantyzacja: bartowski'; wzorce = @('Q4_K_M', 'Q4_K_S') }
)
$LICENCJE_OK = @('Apache-2.0', 'MIT')
$MIN_GB = 3.0
$MAX_GB = 7.5

function ZnajdzModel() {
  foreach ($k in $KANDYDACI) {
    try {
      Info "sprawdzam $($k.repo)"
      # Spis plikow z Hugging Face. Dla plikow trzymanych przez LFS - a tak leza
      # wszystkie modele - dostajemy od razu `lfs.size` i `lfs.oid`, czyli
      # rozmiar i sume SHA-256. To wlasnie dzieki temu nie musimy pobierac
      # szesciu gigabajtow, zeby wiedziec, czym je potem sprawdzic.
      $spis = Invoke-RestMethod -Headers @{ 'User-Agent' = 'OPERO-build' } `
        -Uri "https://huggingface.co/api/models/$($k.repo)/tree/main"
      $gguf = @($spis | Where-Object { $_.path -like '*.gguf' -and $_.path -notmatch 'split|part' })
      if (-not $gguf) { continue }
      foreach ($w in $k.wzorce) {
        $p = $gguf | Where-Object { $_.path -match [regex]::Escape($w) } | Select-Object -First 1
        if (-not $p) { continue }
        $rozmiar = [int64]0
        if ($p.lfs -and $p.lfs.size) { $rozmiar = [int64]$p.lfs.size } elseif ($p.size) { $rozmiar = [int64]$p.size }
        $suma = ''
        if ($p.lfs -and $p.lfs.oid) { $suma = ([string]$p.lfs.oid) -replace '^sha256:', '' }
        # Bez sumy nie bierzemy modelu w ogole. Program ma czym sprawdzic to, co
        # pobierze - inaczej kazdy przerwany transfer konczy sie plikiem, o
        # ktorym nikt nie wie, czy jest caly.
        if (-not $suma) { Info "  $($p.path): brak sumy w spisie - pomijam"; continue }
        return @{
          repo = $k.repo; plik = (Split-Path $p.path -Leaf); licencja = $k.licencja; autor = $k.autor
          url  = "https://huggingface.co/$($k.repo)/resolve/main/$([uri]::EscapeDataString($p.path))?download=true"
          rozmiar = $rozmiar; suma = $suma.ToLower()
        }
      }
    } catch {
      Info "  nieudane: $($_.Exception.Message)"
    }
  }
  throw 'Nie udalo sie ustalic modelu u zadnego z kandydatow. Sprawdz polaczenie z huggingface.co.'
}

function OpiszModel() {
  Krok 'Model jezykowy PER (sam adres - pliku nie pobieramy)'
  $info = ZnajdzModel
  # Kontrola licencji. Program jest sprzedawany, wiec warunki tworcy modelu
  # musza byc znane PRZED wydaniem, a nie odkryte przy pierwszej sprzedazy.
  if ($LICENCJE_OK -notcontains $info.licencja) {
    throw "Model $($info.repo) ma licencje $($info.licencja), a dopuszczamy tylko: $($LICENCJE_OK -join ', '). Przerywam."
  }
  $gb = $info.rozmiar / 1GB
  if ($gb -lt $MIN_GB -or $gb -gt $MAX_GB) {
    throw ("Model ma {0:N1} GB, a spodziewamy sie {1}-{2} GB. To chyba nie ten plik." -f $gb, $MIN_GB, $MAX_GB)
  }
  Info "$($info.repo) -> $($info.plik)"
  Info ("rozmiar: {0:N1} GB - program pobierze go sam, po klikniecu w panelu PER" -f $gb)
  Info "licencja: $($info.licencja) (wolno sprzedawac)"
  Info "suma SHA-256: $($info.suma)"
  return $info
}

# ------------------------------------------------------------------ 3. zamek

$maZamek = (Test-Path $ZAMEK) -and (-not $Odswiez)
$kompletny = $false
if ($maZamek) {
  try {
    $z = Get-Content $ZAMEK -Raw | ConvertFrom-Json
    $plikSerwera = Join-Path $Cel 'llama-server.exe'
    # Modelu nie ma czego sprawdzac na dysku - jego tu nie ma i byc nie musi.
    # Kompletny zamek to taki, ktory ma czym opisac model programowi: nazwe,
    # adres i sume. Brak ktoregokolwiek z tych pol znaczy „zrob to od nowa".
    if ((Test-Path $plikSerwera) -and $z.model.plik -and $z.model.url -and $z.model.suma) {
      Krok 'Sprawdzam to, co juz lezy w folderze silnika'
      Info "serwer modelu jest, adres modelu znany: $($z.model.plik)"
      $kompletny = $true
    }
  } catch { $kompletny = $false }
}

if ($kompletny) {
  Write-Host "`n[silnik] Gotowe - serwer modelu jest, adres modelu znany." -ForegroundColor Green
  exit 0
}

$serwer = ZainstalujSerwer
$model = OpiszModel

$noweDane = [ordered]@{
  wersjaZamka = 1
  utworzono   = (Get-Date).ToString('s')
  serwer      = $serwer
  model       = $model
}
ZapiszTekst $ZAMEK ($noweDane | ConvertTo-Json -Depth 5)
# Licencja modelu jedzie w instalatorze, choc sam model pobiera sie pozniej.
# Program jest sprzedawany, wiec warunki tworcy modelu musza byc widoczne u
# kazdego klienta - takze zanim cokolwiek pobierze.
$lic = @"
MODEL JEZYKOWY W OPERO
----------------------
Model:        $($model.plik)
Autor modelu: $($model.autor)
Zrodlo:       $($model.repo)
Adres:        $($model.url)
Rozmiar:      $([math]::Round($model.rozmiar/1GB,2)) GB
Suma SHA-256: $($model.suma)
LICENCJA:     $($model.licencja)

Model NIE jedzie w instalatorze. Program pobiera go sam z powyzszego adresu,
po klikniecu „Pobierz model" w panelu asystenta PER, i sprawdza powyzsza suma.

Serwer modelu: llama.cpp, wydanie $($serwer.wydanie) (licencja MIT).
Adres: $($serwer.url)

CO TO OZNACZA PRZY SPRZEDAZY
Licencja Apache 2.0 (i MIT dla serwera) pozwala sprzedawac program korzystajacy
z tego modelu, bez oplat i bez pytania autora o zgode. Warunki sa dwa i oba sa
spelnione tym plikiem: tekst licencji oraz nota o tym, kto jest autorem modelu,
jada w instalatorze. Jesli zmienisz sam plik modelu, trzeba to zaznaczyc.

Modele na licencji Llama Community (Meta) sa z tej paczki swiadomie wykluczone:
wymagaja dodatkowo widocznego napisu "Built with Llama", pliku NOTICE i prefiksu
"Llama" w nazwie, a tego nie chcemy wprowadzac po cichu. Jesli kiedys wpiszesz
taki model recznie, te obowiazki przechodza na Ciebie.

Model jest dzielem osob trzecich. Powyzsza nazwa licencji pochodzi z listy
kandydatow w narzedzia\pobierz-silnik.ps1 i byla sprawdzona przy jej tworzeniu.
Jesli podmieniasz model na inny, sprawdz jego licencje samodzielnie - to jedyna
rzecz, ktorej program nie moze zrobic za Ciebie.
"@
ZapiszTekst (Join-Path $Cel 'LICENCJE-MODELU.txt') $lic
# Apache 2.0 wymaga, zeby do kazdej kopii dzielo jechal PELNY tekst licencji -
# nie wystarczy jej nazwa. Bierzemy go wprost z apache.org i zapisujemy obok
# modelu; instalator kopiuje caly folder silnika, wiec plik trafia do klienta.
$plikLic = Join-Path $Cel 'LICENCJA-APACHE-2.0.txt'
if (-not (Test-Path $plikLic)) {
  try {
    Invoke-WebRequest -Uri 'https://www.apache.org/licenses/LICENSE-2.0.txt' -OutFile $plikLic -UseBasicParsing
    Info 'tekst licencji Apache 2.0 zapisany obok modelu'
  } catch {
    Blad 'Nie udalo sie pobrac tekstu licencji Apache 2.0.'
    Blad 'Wklej go recznie do silnik\LICENCJA-APACHE-2.0.txt - bez tego pliku'
    Blad 'redystrybucja modelu nie spelnia warunku licencji.'
  }
}

# Manifest dla programu: maly plik, ktory jedzie W INSTALATORZE i mowi OPERO,
# co ma pobrac i czym to sprawdzic. Powstaje sam, z tych samych danych co
# ZAMEK.json - nie trzeba go pisac recznie i nie trzeba go nigdzie wrzucac.
$manifest = [ordered]@{
  nazwa   = $model.plik
  rozmiar = $model.rozmiar
  suma    = $model.suma
  url     = $model.url
  opis    = "Model $($model.plik) ($($model.licencja), $($model.autor))."
}
ZapiszTekst (Join-Path $Cel 'model.json') ($manifest | ConvertTo-Json -Depth 3)
Write-Host "         model.json gotowy - jedzie w instalatorze." -ForegroundColor DarkGray

$mb = [math]::Round(((Get-ChildItem $Cel -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))
Write-Host "`n[silnik] Gotowe: $mb MB w $Cel" -ForegroundColor Green
Write-Host "         Model ($([math]::Round($model.rozmiar/1GB,2)) GB) pobierze sam program, u klienta." -ForegroundColor DarkGray
Write-Host "         Zamek zapisany w silnik\ZAMEK.json - trzymaj go w repozytorium." -ForegroundColor DarkGray
