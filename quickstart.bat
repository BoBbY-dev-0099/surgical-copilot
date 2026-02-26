@echo off
REM Surgical Copilot Quick Start Script for Windows

echo ======================================
echo Surgical Copilot - Quick Start
echo ======================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed
    exit /b 1
)

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed
    exit /b 1
)

echo Setting up backend...
cd backend

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing backend dependencies...
pip install -q -r requirements.txt

REM Copy environment file if it doesn't exist
if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
)

REM Start backend
echo Starting backend server...
set DEMO_MODE=true
start /b python app\main.py

REM Wait for backend to start
timeout /t 5 /nobreak >nul

REM Setup frontend
cd ..\frontend
echo Setting up frontend...

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
)

REM Start frontend
echo Starting frontend...
start npm run dev

echo.
echo ======================================
echo Application started successfully!
echo ======================================
echo.
echo Backend running at: http://localhost:8000
echo Frontend running at: http://localhost:5173
echo.
echo Close this window to stop the servers
echo.
pause