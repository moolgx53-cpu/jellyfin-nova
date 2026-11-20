@echo off
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

if not exist "C:\Program Files\Jellyfin\Server\jellyfin-web\ui" (
    mkdir "C:\Program Files\Jellyfin\Server\jellyfin-web\ui"
)
copy /y "%~dp0library-banner.js" "C:\Program Files\Jellyfin\Server\jellyfin-web\ui\library-banner.js"
copy /y "%~dp0library-banner.css" "C:\Program Files\Jellyfin\Server\jellyfin-web\ui\library-banner.css"
copy /y "%~dp0movie-details.js" "C:\Program Files\Jellyfin\Server\jellyfin-web\ui\movie-details.js"
copy /y "%~dp0movie-details.css" "C:\Program Files\Jellyfin\Server\jellyfin-web\ui\movie-details.css"
copy /y "%~dp0spotlight.html" "C:\Program Files\Jellyfin\Server\jellyfin-web\ui\spotlight.html"
copy /y "%~dp0spotlight.css" "C:\Program Files\Jellyfin\Server\jellyfin-web\ui\spotlight.css"

powershell -Command "$p = 'C:\Program Files\Jellyfin\Server\jellyfin-web\index.html'; $c = Get-Content $p -Raw; $c = $c -replace 'movie-details\.js\?v=[\d\.]+', 'movie-details.js?v=1.3.0' -replace 'movie-details\.css\?v=[\d\.]+', 'movie-details.css?v=1.3.0'; if ($c -notmatch 'movie-details\.js') { $tag = '<link rel=\"stylesheet\" href=\"ui/movie-details.css?v=1.3.0\"><script src=\"ui/movie-details.js?v=1.3.0\" defer></script></body>'; $c = $c -replace '</body>', $tag }; Set-Content -Path $p -Value $c -Encoding UTF8; Write-Host '[+] Injected movie-details into index.html'"

echo UI and movie details files copied with Administrator privileges!
