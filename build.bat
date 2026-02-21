@echo off
setlocal enabledelayedexpansion

REM Build Alchemist (Windows) using PyInstaller
REM - creates/uses venv at backend\.venv
REM - installs deps + pyinstaller
REM - builds dist\Alchemist\Alchemist.exe

set "ROOT_DIR=%~dp0"
REM strip trailing backslash
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "BACKEND_DIR=%ROOT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"

where python >nul 2>nul
if errorlevel 1 (
  echo Python not found. Please install Python 3 and ensure it's on PATH.
  exit /b 1
)

if not exist "%VENV_DIR%" (
  python -m venv "%VENV_DIR%"
  if errorlevel 1 exit /b 1
)

call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 exit /b 1

python -m pip install --upgrade pip
if errorlevel 1 exit /b 1

python -m pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 exit /b 1

python -m pip install pyinstaller
if errorlevel 1 exit /b 1

if exist "%ROOT_DIR%\dist" rmdir /s /q "%ROOT_DIR%\dist"
if exist "%ROOT_DIR%\build" rmdir /s /q "%ROOT_DIR%\build"

pyinstaller --noconfirm --clean ^
  --name Alchemist ^
  --add-data "%ROOT_DIR%\frontend;frontend" ^
  "%BACKEND_DIR%\app.py"

if errorlevel 1 exit /b 1

echo.
echo Build complete.
echo Run: %ROOT_DIR%\dist\Alchemist\Alchemist.exe
endlocal
