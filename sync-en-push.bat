@echo off
cd /d "C:\Users\Wwbri\OneDrive\Bureaublad\tv-keuzehulp"

echo [%date% %time%] Starten sync...

node script.js
if %errorlevel% neq 0 (
    echo [%date% %time%] FOUT: script.js mislukt
    exit /b 1
)

echo [%date% %time%] Klaar.
