# Elevated Installer Script for Jellyfin Web Patching
$ErrorActionPreference = "Stop"

$webCandidates = @(
    "C:\Program Files\Jellyfin\Server\jellyfin-web",
    "C:\Program Files (x86)\Jellyfin\Server\jellyfin-web",
    "C:\ProgramData\Jellyfin\Server\jellyfin-web"
)

$webDir = $null
foreach ($cand in $webCandidates) {
    if (Test-Path $cand) {
        $webDir = $cand
        break
    }
}

if (-not $webDir) {
    Write-Host "[X] Jellyfin web directory not found!" -ForegroundColor Red
    exit 1
}

Write-Host "[+] Found Jellyfin Web: $webDir" -ForegroundColor Green

$uiDir = Join-Path $webDir "ui"
if (-not (Test-Path $uiDir)) {
    New-Item -ItemType Directory -Path $uiDir -Force | Out-Null
    Write-Host "[+] Created ui directory" -ForegroundColor Green
}

$srcDir = $PSScriptRoot

# Copy spotlight, library banner, and movie details files
$filesToCopy = @("spotlight.html", "spotlight.css", "library-banner.js", "library-banner.css", "movie-details.js", "movie-details.css")
foreach ($f in $filesToCopy) {
    $srcPath = Join-Path $srcDir $f
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination (Join-Path $uiDir $f) -Force
        Write-Host "[+] Copied $f to ui folder" -ForegroundColor Green
    }
}

# Patch home-html chunk
$chunkFile = Get-ChildItem "$webDir\home-html.*.chunk.js" | Select-Object -First 1 -ExpandProperty FullName
if ($chunkFile) {
    if (-not (Test-Path "$chunkFile.bak")) {
        Copy-Item $chunkFile "$chunkFile.bak" -Force
    }
    $chunkSrc = Join-Path $srcDir "home-html.chunk.js"
    if (Test-Path $chunkSrc) {
        $origChunkContent = if (Test-Path "$chunkFile.bak") { Get-Content "$chunkFile.bak" -Raw } else { Get-Content $chunkFile -Raw }
        $patchChunkContent = Get-Content $chunkSrc -Raw
        if ($origChunkContent -match '\.push\(\[\[(\d+)\],\s*\{\s*(\d+)\s*:') {
            $origChunkId = $Matches[1]
            $origModId   = $Matches[2]
            $patchChunkContent = $patchChunkContent -replace '\.push\(\[\[8372\],\s*\{\s*5939:', ".push([[$origChunkId], {`n  ${origModId}:"
        }
        Set-Content -Path $chunkFile -Value $patchChunkContent -Encoding UTF8
        Write-Host "[+] Patched home-html chunk: $(Split-Path $chunkFile -Leaf)" -ForegroundColor Green
    }
}

# Patch index.html for GLOBAL script loading
$indexPath = Join-Path $webDir "index.html"
if (Test-Path $indexPath) {
    $indexContent = Get-Content $indexPath -Raw
    
    if ($indexContent -notlike "*library-banner.js*") {
        $indexContent = $indexContent -replace "</body>", '<link rel="stylesheet" href="ui/library-banner.css?v=1.4.3"><script src="ui/library-banner.js?v=1.4.3" defer></script></body>'
    }
    if ($indexContent -notlike "*movie-details.js*") {
        $indexContent = $indexContent -replace "</body>", '<link rel="stylesheet" href="ui/movie-details.css?v=1.3.0"><script src="ui/movie-details.js?v=1.3.0" defer></script></body>'
    } else {
        $indexContent = $indexContent -replace 'v=1\.2\.\d+', 'v=1.3.0'
    }
    
    Set-Content -Path $indexPath -Value $indexContent -Encoding UTF8
    Write-Host "[+] Injected global tags into index.html!" -ForegroundColor Green
}

Write-Host ""
Write-Host "[+] Installation & Patching Completed Successfully!" -ForegroundColor Green
