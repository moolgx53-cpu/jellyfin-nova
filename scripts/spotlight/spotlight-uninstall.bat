@echo off
setlocal EnableDelayedExpansion

set "JELLYFIN_WEB="

for %%P in (
    "C:\Program Files\Jellyfin\Server\jellyfin-web"
    "C:\Program Files (x86)\Jellyfin\Server\jellyfin-web"
    "C:\ProgramData\Jellyfin\Server\jellyfin-web"
) do (
    if exist %%P (
        set "JELLYFIN_WEB=%%~P"
        goto :found_web
    )
)

echo  [?] Could not auto-detect Jellyfin web directory.
echo      Enter the full path to your jellyfin-web folder:
echo      Example: C:\Program Files\Jellyfin\Server\jellyfin-web
set /p JELLYFIN_WEB="  Path: "

if not exist "!JELLYFIN_WEB!" (
    echo  [X] Directory not found: !JELLYFIN_WEB!
    exit /b 1
)

:found_web
echo  [+] Web directory: !JELLYFIN_WEB!

echo  Restoring home-html chunk...

set "CHUNK_NAME="
for %%F in ("!JELLYFIN_WEB!\home-html.*.chunk.js") do (
    set "CHUNK_NAME=%%~nxF"
)

if "!CHUNK_NAME!"=="" (
    echo  [?] Could not find home-html.*.chunk.js automatically.
    echo      Enter the exact filename:
    set /p CHUNK_NAME="  Filename: "
)

set "CHUNK_FILE=!JELLYFIN_WEB!\!CHUNK_NAME!"

if not exist "!CHUNK_FILE!" (
    echo  [X] Chunk file not found: !CHUNK_FILE!
    exit /b 1
)

if exist "!CHUNK_FILE!.bak" (
    copy /y "!CHUNK_FILE!.bak" "!CHUNK_FILE!" >nul
    del /f "!CHUNK_FILE!.bak" >nul
    echo  [+] Chunk restored.
    echo  [+] Backup removed.
) else (
    echo  [!] No backup found. Chunk could not be restored.
    echo      You may need to reinstall Jellyfin.
)

echo  Removing spotlight and UI files...

set "UI_DIR=!JELLYFIN_WEB!\ui"

for %%U in (spotlight.html spotlight.css library-banner.js library-banner.css movie-details.js movie-details.css) do (
    if exist "!UI_DIR!\%%U" (
        del /f "!UI_DIR!\%%U" >nul
        echo  [+] Removed %%U
    ) else (
        echo  [-] %%U not found, skipping.
    )
)

set "INDEX_FILE=!JELLYFIN_WEB!\index.html"
if exist "!INDEX_FILE!" (
    powershell -Command "$p = '!INDEX_FILE!'; $c = Get-Content $p -Raw; $n = $c -replace '<link[^>]*href=\"ui/(library-banner|movie-details)\.css[^\"]*\"[^>]*>', '' -replace '<script[^>]*src=\"ui/(library-banner|movie-details)\.js[^\"]*\"[^>]*></script>', ''; if ($n -ne $c) { Set-Content -Path $p -Value $n -Encoding UTF8; Write-Host '  [+] Restored index.html.' }"
)

for /f %%A in ('dir /b /a "!UI_DIR!" 2^>nul') do goto :ui_not_empty
    rmdir "!UI_DIR!" >nul
    echo  [+] Removed empty ui folder.
    goto :ui_done
:ui_not_empty
    echo  [-] ui folder has other files, leaving in place.
:ui_done

exit /b 0