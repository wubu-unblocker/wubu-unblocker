param(
  [string]$ProjectDir = (Join-Path (Get-Location) "Wubu Unblocker"),
  [string]$OutZip = (Join-Path (Get-Location) "app.zip")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectDir)) {
  throw "ProjectDir not found: $ProjectDir"
}

$staging = Join-Path $env:TEMP ("wubu_hf_zip_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  Write-Host "Staging from: $ProjectDir"
  Write-Host "Staging to  : $staging"

  # Robocopy preserves structure and supports exclusions cleanly.
  $xd = @(
    "node_modules",
    ".git",
    ".git.bak",
    "views\\dist",
    "views\\archive",
    "blooket-data",
    "GAMESFORCHEATS",
    "Holy-Unblocker",
    "ORIGINAL",
    ".idea",
    ".vscode"
  )

  $xf = @(
    "debug.log",
    "*.log",
    "app.zip",
    "wubu-issues-firebase-adminsdk-*.json"
  )

  # Copy everything, then rely on gitignore-ish excludes above.
  # /E includes empty dirs, /R:1 /W:1 keeps it quick, /NFL /NDL reduces noise.
  $cmd = @(
    "robocopy",
    "`"$ProjectDir`"",
    "`"$staging`"",
    "/E",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NP",
    "/XD"
  ) + $xd + @("/XF") + $xf

  & $cmd[0] $cmd[1..($cmd.Length-1)]
  $rc = $LASTEXITCODE
  if ($rc -ge 8) {
    throw "robocopy failed with exit code $rc"
  }

  # Extra runtime caches that can exist anywhere.
  Get-ChildItem -Path $staging -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\\\(cache-js|sessions)\\\\" } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  Get-ChildItem -Path $staging -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq ".shutdown" -or $_.Extension -eq ".rhfsession" } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  if (Test-Path $OutZip) {
    Remove-Item -Force $OutZip
  }

  Write-Host "Creating zip: $OutZip"
  # Prefer bsdtar (tar.exe) when available; it produces zip entries with forward slashes,
  # which avoids unzip warnings/errors on Linux builders.
  $tar = (Get-Command tar -ErrorAction SilentlyContinue)
  if ($tar) {
    & $tar.Source -a -c -f $OutZip -C $staging .
  } else {
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $OutZip -CompressionLevel Optimal
  }

  Write-Host "Done."
  Write-Host "Upload to HF Space as: app.zip (plus Dockerfile)"
} finally {
  Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
}
