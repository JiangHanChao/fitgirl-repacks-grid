@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM ---------- 1. 检测 Python ----------
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo [错误] 未检测到 Python
    echo 请先安装 Python 3.7+：https://www.python.org/downloads/
    echo 安装时请勾选 "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

REM ---------- 2. 检测 8000 端口 ----------
netstat -ano | findstr ":8000 " >nul
if not errorlevel 1 (
    echo.
    echo [错误] 8000 端口已被占用
    echo 请先关闭占用 8000 端口的程序，或修改本脚本的端口号
    echo.
    pause
    exit /b 1
)

REM ---------- 3. 查找 Chrome / Edge ----------
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LOCALAPPDATA%"

set "BROWSER="

if exist "%PF%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LAD%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LAD%\Google\Chrome\Application\chrome.exe"

echo.
echo ========================================
echo   FitGirl Repacks 网格
echo ========================================
if defined BROWSER goto :show_browser
echo   浏览器: 未检测到 Chrome / Edge
echo   警告:   本页面需要 Chrome 86+ 或 Edge 86+
echo           将使用系统默认浏览器，可能无法使用
goto :show_url

:show_browser
echo   浏览器: %BROWSER%

:show_url
echo   地址:   http://localhost:8000/
echo   停止:   按 Ctrl+C 或关闭本窗口
echo ========================================
echo.

REM ---------- 4. 备份 games.json（覆盖式，只保留一份） ----------
if exist "games.json" (
    copy /Y "games.json" "games.json.bak" >nul
    echo [备份] games.json  ->  games.json.bak
)

REM ---------- 5. 打开浏览器 ----------
if not defined BROWSER goto :open_default
start "" "%BROWSER%" "http://localhost:8000/"
goto :start_server

:open_default
start "" "http://localhost:8000/"

REM ---------- 6. 前台启动服务器 ----------
:start_server
python -m http.server 8000
pause
