@echo off
setlocal EnableExtensions EnableDelayedExpansion
title OPERO - budowa instalatora dla klientow
cd /d "%~dp0"

rem ===========================================================================
rem  JEDYNY plik, ktory trzeba tu uruchomic.
rem
rem  Co robi, po kolei:
rem    1. sklada kod programu,
rem    2. pobiera silnik PER (kilkadziesiat MB) i zapisuje ADRES modelu,
rem    3. buduje jeden instalator dla klienta,
rem    4. pyta, czy zainstalowac program u Ciebie, zeby sprawdzic na zywo.
rem
rem  Modelu sztucznej inteligencji (ponad 6 GB) tu nie ma i byc nie moze:
rem  Windows nie uruchamia plikow .exe wiekszych niz okolo 4 GB. Klient dostaje
rem  jeden instalator, a po zainstalowaniu klika PER w gornym pasku i widzi
rem  kolorem, czy model jest:
rem    czerwony     - nie ma, jest przycisk Pobierz model
rem    pomaranczowy - jest, ale wyszedl nowszy
rem    zielony      - wgrany i aktualny
rem  Model pobiera sie wtedy wprost z Hugging Face, ze sprawdzeniem sumy.
rem ===========================================================================

echo.
echo   ========================================================
echo     OPERO - budowa instalatora dla klientow
echo   ========================================================
echo.

if not exist "narzedzia\buduj.ps1" (
  echo   BLAD: brakuje narzedzia\buduj.ps1
  echo   Rozpakuj cala paczke jeszcze raz, razem z podfolderami.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo   BLAD: nie widze Node.js, a bez niego nie zloze kodu programu.
  echo   Zainstaluj Node.js 22 ze strony nodejs.org ^(wersja LTS^) i uruchom
  echo   ten plik jeszcze raz.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "narzedzia\buduj.ps1"
set KOD=%ERRORLEVEL%

if not "%KOD%"=="0" (
  echo.
  echo   ========================================================
  echo     Budowa przerwana. Przewin wyzej, zeby zobaczyc na czym.
  echo   ========================================================
  echo.
  pause
  exit /b %KOD%
)

echo.
echo   ========================================================
echo     Gotowe.
echo   ========================================================
echo.
echo   DLA KLIENTA (jeden plik, to jest calosc):
for %%P in ("OPERO-Setup-*.exe") do echo     %%~nxP
echo.
echo   Po instalacji klient klika PER w gornym pasku programu:
echo     czerwona kropka     - modelu nie ma, jest przycisk Pobierz model
echo     pomaranczowa kropka - model jest, ale wyszedl nowszy
echo     zielona kropka      - model wgrany i aktualny
echo.
pause
exit /b 0
