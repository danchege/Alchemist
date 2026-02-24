@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM Build Alchemist (Windows) using PyInstaller
REM - creates/uses venv at backend\.venv
REM - installs deps + pyinstaller
REM - builds dist\Alchemist\Alchemist.exe
REM ============================================================

REM Resolve project root (folder containing this script)
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "BACKEND_DIR=%ROOT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"

echo [*] Project root: %ROOT_DIR%
echo [*] Backend dir : %BACKEND_DIR%
echo [*] Venv dir    : %VENV_DIR%
echo.

REM -----------------------------------------------------------------
REM 1) Ensure Python is available
REM -----------------------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3 and ensure it is on PATH.
    exit /b 1
)

if not exist "%BACKEND_DIR%" (
    echo [ERROR] Backend directory not found: %BACKEND_DIR%
    exit /b 1
)

REM -----------------------------------------------------------------
REM 2) Create / reuse virtual environment
REM -----------------------------------------------------------------
echo [1/4] Creating virtual environment (if needed)...
if not exist "%VENV_DIR%\Scripts\python.exe" (
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        exit /b 1
    )
)

set "PYTHON_VENV=%VENV_DIR%\Scripts\python.exe"
if not exist "%PYTHON_VENV%" (
    echo [ERROR] Virtual environment Python not found at: %PYTHON_VENV%
    exit /b 1
)

REM -----------------------------------------------------------------
REM 3) Install dependencies + PyInstaller
REM -----------------------------------------------------------------
echo [2/4] Upgrading pip...
"%PYTHON_VENV%" -m pip install --upgrade pip
if errorlevel 1 (
    echo [ERROR] Failed to upgrade pip.
    exit /b 1
)

echo [3/4] Installing backend requirements...
if exist "%BACKEND_DIR%\requirements.txt" (
    "%PYTHON_VENV%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 (
        echo [ERROR] Failed to install backend requirements.
        exit /b 1
    )
) else (
    echo [WARN] requirements.txt not found in %BACKEND_DIR%. Skipping dependency install.
)

echo [3.5/4] Installing PyInstaller...
"%PYTHON_VENV%" -m pip install pyinstaller
if errorlevel 1 (
    echo [ERROR] Failed to install PyInstaller.
    exit /b 1
)

REM -----------------------------------------------------------------
REM 4) Clean previous build artifacts and run PyInstaller
REM -----------------------------------------------------------------
echo [4/4] Cleaning previous build output...
if exist "%ROOT_DIR%\dist"  rmdir /s /q "%ROOT_DIR%\dist"
if exist "%ROOT_DIR%\build" rmdir /s /q "%ROOT_DIR%\build"

echo [4/4] Building Alchemist executable with PyInstaller...
pushd "%ROOT_DIR%"
REM Use the correct module name: PyInstaller (not pyinstaller)
"%PYTHON_VENV%" -m PyInstaller --version
if errorlevel 1 (
    echo [ERROR] PyInstaller is not available in the venv.
    exit /b 1
)

"%PYTHON_VENV%" -m PyInstaller --noconfirm --clean ^
  --name Alchemist ^
  --add-data "frontend;frontend" ^
  "backend\app.py"
set "BUILD_ERROR=%ERRORLEVEL%"
popd

if not "%BUILD_ERROR%"=="0" (
    echo.
    echo [ERROR] PyInstaller build failed with exit code %BUILD_ERROR%.
    exit /b %BUILD_ERROR%
)

echo.
echo [OK] Build complete.
echo [OK] You can run the app with:
echo      "%ROOT_DIR%\dist\Alchemist\Alchemist.exe"

endlocal
