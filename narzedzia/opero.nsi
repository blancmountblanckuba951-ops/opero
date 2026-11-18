; Instalator OPERO - budowany przez buduj.ps1. Sciezki podstawia skrypt.
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!define NAZWA "OPERO"
!define WERSJA "@WERSJA@"
!define WYDAWCA "OPERO"
!define KLUCZ "Software\Microsoft\Windows\CurrentVersion\Uninstall\OPERO"

Name "${NAZWA} ${WERSJA}"
OutFile "@WYJSCIE@"
InstallDir "$LOCALAPPDATA\Programs\OPERO"
InstallDirRegKey HKCU "Software\OPERO" "InstallDir"
RequestExecutionLevel user
ShowInstDetails hide
ShowUninstDetails hide
BrandingText "${NAZWA} ${WERSJA}"

VIProductVersion "@WERSJA@.0"
VIAddVersionKey /LANG=1045 "ProductName" "OPERO"
VIAddVersionKey /LANG=1045 "FileDescription" "OPERO - system operatow szacunkowych"
VIAddVersionKey /LANG=1045 "FileVersion" "@WERSJA@"
VIAddVersionKey /LANG=1045 "ProductVersion" "@WERSJA@"
VIAddVersionKey /LANG=1045 "LegalCopyright" "OPERO"

!include "MUI2.nsh"
!define MUI_ICON "@IKONA@"
!define MUI_UNICON "@IKONA@"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\OPERO.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Uruchom OPERO"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Polish"

; Przed instalacja trzeba zamknac WSZYSTKO, co trzyma pliki programu otwarte.
; Samo OPERO.exe nie wystarcza: serwer modelu llama-server.exe to osobny proces,
; ktory zyje dalej po ubiciu programu - i to wlasnie on blokowal nadpisanie
; pliku, przez co instalator pytal „Przerwij / Ponow probe / Ignoruj".
; Nazwy sa dwie, bo starsze wydania llama.cpp mialy serwer pod nazwa server.exe.
!macro ZamknijOPERO
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM OPERO.exe /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM llama-server.exe /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM server.exe /T'
  Pop $0
  ; System zwalnia uchwyt do pliku chwile po zakonczeniu procesu, nie od razu.
  Sleep 1200
!macroend

; ---------------------------------------------------------------------------
; ZWOLNIENIE ZAJETEGO PLIKU - bez pytania czlowieka, co ma z tym zrobic.
;
; Zabicie procesu NIE WYSTARCZA i to jest sedno sprawy: plik .exe albo .dll
; potrafi zostac zajety jeszcze przez chwile po zakonczeniu procesu (robi tak
; m.in. skaner antywirusowy i indeksator Windows), a wtedy instalator staje
; z pytaniem „Przerwij / Ponow probe / Ignoruj", na ktore nikt nie zna dobrej
; odpowiedzi.
;
; Windows nie pozwala NADPISAC pliku w uzyciu, ale pozwala go PRZEMIANOWAC.
; Z tego korzystaja wszystkie porzadne aktualizatory i z tego korzystamy tutaj:
; stary plik odsuwamy na bok pod inna nazwa, nowy wchodzi na puste miejsce,
; a resztke kasujemy albo zostawiamy systemowi do sprzatniecia przy restarcie.
; ---------------------------------------------------------------------------
!macro ZwolnijPlik SCIEZKA
  IfFileExists "${SCIEZKA}" 0 +9
    ClearErrors
    Delete "${SCIEZKA}"
    IfErrors 0 +6
      ; Nie dalo sie skasowac - odsuwamy na bok. Na to Windows pozwala nawet
      ; wtedy, gdy plik jest wlasnie wykonywany.
      Delete "${SCIEZKA}.stare"
      ClearErrors
      Rename "${SCIEZKA}" "${SCIEZKA}.stare"
      ; Jesli i to nie wyszlo, niech system usunie plik przy restarcie.
      Delete /REBOOTOK "${SCIEZKA}"
      Delete /REBOOTOK "${SCIEZKA}.stare"
!macroend

; Cala zawartosc folderu silnika - serwer i jego biblioteki. Nazw nie wyliczamy
; recznie, bo llama.cpp zmienia zestaw plikow .dll z wydania na wydanie.
;
; Przebieg robimy DWA RAZY. Kasowanie i przemianowywanie plikow w trakcie
; przegladania tego samego folderu potrafi pominac pojedyncze pozycje - system
; przestawia wtedy wskaznik listy. Drugi przebieg konczy to, co pierwszy
; przeoczyl, i nic nie kosztuje, bo zwolnionych plikow juz tam nie ma.
Function ZwolnijSilnik
  Call ZwolnijSilnikRaz
  Call ZwolnijSilnikRaz
FunctionEnd

Function ZwolnijSilnikRaz
  ; Rejestry odkladamy i oddajemy nietkniete - instalator uzywa ich tez gdzie
  ; indziej, a cicha podmiana wartosci to blad, ktorego potem nikt nie znajdzie.
  Push $0
  Push $1
  Push $2
  FindFirst $0 $1 "$INSTDIR\resources\silnik\*.*"
  silnik_petla:
    StrCmp $1 "" silnik_koniec
    StrCmp $1 "." silnik_dalej
    StrCmp $1 ".." silnik_dalej
    ; Plikow juz odsunietych na bok nie odsuwamy po raz drugi - inaczej
    ; powstalby lancuch nazw .stare.stare.stare.
    StrCpy $2 $1 6 -6
    StrCmp $2 ".stare" silnik_dalej
    !insertmacro ZwolnijPlik "$INSTDIR\resources\silnik\$1"
  silnik_dalej:
    FindNext $0 $1
    Goto silnik_petla
  silnik_koniec:
  FindClose $0
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function .onInit
  !insertmacro ZamknijOPERO
FunctionEnd

Section "OPERO" SEK01
  SetOutPath "$INSTDIR"
  ; Najpierw jeszcze raz zamykamy program - od `.onInit` uplynelo tyle czasu,
  ; ile czlowiek klikal przez okna instalatora, a w miedzyczasie OPERO moglo
  ; zostac uruchomione ponownie.
  !insertmacro ZamknijOPERO
  ; Potem odsuwamy na bok wszystko, czego nie da sie nadpisac.
  Call ZwolnijSilnik
  !insertmacro ZwolnijPlik "$INSTDIR\OPERO.exe"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  ; Pakujemy WSZYSTKO, co przygotowal buduj.ps1 - razem z resources\silnik,
  ; czyli serwerem modelu i licencjami (kilkadziesiat MB).
  ;
  ; Sam MODEL (kilka GB) tu nie wchodzi i wchodzic nie moze: instalator NSIS ma
  ; twardy limit 2 GB, a Windows nie uruchamia plikow .exe wiekszych niz okolo
  ; 4 GB. Model pobiera rzeczoznawca - jednym klikniecem w panelu asystenta PER,
  ; wprost z Hugging Face, ze sprawdzeniem sumy SHA-256.
  File /r "@ZRODLO@\*.*"

  WriteRegStr HKCU "Software\OPERO" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${KLUCZ}" "DisplayName" "OPERO"
  WriteRegStr HKCU "${KLUCZ}" "DisplayVersion" "${WERSJA}"
  WriteRegStr HKCU "${KLUCZ}" "Publisher" "${WYDAWCA}"
  WriteRegStr HKCU "${KLUCZ}" "DisplayIcon" "$INSTDIR\opero.ico"
  WriteRegStr HKCU "${KLUCZ}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${KLUCZ}" "UninstallString" '"$INSTDIR\Odinstaluj OPERO.exe"'
  WriteRegDWORD HKCU "${KLUCZ}" "NoModify" 1
  WriteRegDWORD HKCU "${KLUCZ}" "NoRepair" 1

  CreateDirectory "$SMPROGRAMS\OPERO"
  CreateShortCut "$SMPROGRAMS\OPERO\OPERO.lnk" "$INSTDIR\OPERO.exe" "" "$INSTDIR\opero.ico" 0
  CreateShortCut "$SMPROGRAMS\OPERO\Odinstaluj OPERO.lnk" "$INSTDIR\Odinstaluj OPERO.exe"
  CreateShortCut "$DESKTOP\OPERO.lnk" "$INSTDIR\OPERO.exe" "" "$INSTDIR\opero.ico" 0

  WriteUninstaller "$INSTDIR\Odinstaluj OPERO.exe"
SectionEnd

Section "Uninstall"
  !insertmacro ZamknijOPERO
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM OPERO.exe'
  Pop $0
  Sleep 400
  Delete "$DESKTOP\OPERO.lnk"
  RMDir /r "$SMPROGRAMS\OPERO"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${KLUCZ}"
  DeleteRegKey HKCU "Software\OPERO"
SectionEnd
