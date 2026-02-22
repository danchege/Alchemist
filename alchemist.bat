@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"

set "PYTHON_BIN=python"

if "%1"=="" (
    set "MODE=run"
) else (
    set "MODE=%1"
)

if /i not "%MODE%"=="run" if /i not "%MODE%"=="build" (
    echo Usage: %0 [run^|build]
    echo   run   - create/use venv, install deps, start server
    echo   build - create/use venv, install deps, build PyInstaller executable
    exit /b 1
)

if not exist "%VENV_DIR%" (
    echo Creating virtual environment...
    %PYTHON_BIN% -m venv "%VENV_DIR%"
)

echo Activating virtual environment...
call "%VENV_DIR%\Scripts\activate.bat"

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing requirements...
python -m pip install -r "%BACKEND_DIR%\requirements.txt"

echo Installing PyInstaller...
python -m pip install pyinstaller

if /i "%MODE%"=="run" (
    echo Starting Alchemist server...
    python "%BACKEND_DIR%\app.py"
) else (
    echo Building executable...
    python -m PyInstaller --onefile --name Alchemist --add-data "%BACKEND_DIR%\frontend;frontend" "%BACKEND_DIR%\app.py"
    echo Build complete! Executable is in dist\Alchemist.exe
)

endlocal
