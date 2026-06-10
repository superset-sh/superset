# Superset CLI installer for Windows.
#
# Usage:
#   irm https://superset.sh/cli/install.ps1 | iex
#
# Installs the Superset CLI and host-service to $HOME\superset by default.
# Set SUPERSET_HOME to override the install directory.
# Set SUPERSET_VERSION to a release tag such as cli-v0.2.22.

$ErrorActionPreference = "Stop"

$Repo = "superset-sh/superset"
$InstallDir = if ($env:SUPERSET_HOME) { $env:SUPERSET_HOME } else { Join-Path $HOME "superset" }
$Tag = if ($env:SUPERSET_VERSION) { $env:SUPERSET_VERSION } else { "latest" }

function Write-Info {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "warning: $Message" -ForegroundColor Yellow
}

function Fail {
    param([string]$Message)
    Write-Host "error: $Message" -ForegroundColor Red
    exit 1
}

function Get-Target {
    if (-not [Environment]::Is64BitOperatingSystem) {
        Fail "Unsupported Windows architecture: 32-bit Windows is not supported"
    }
    return "win32-x64"
}

function Get-DownloadUrl {
    param([string]$Target)

    $Tarball = "superset-$Target.tar.gz"
    if ($Tag -eq "latest") {
        return "https://github.com/$Repo/releases/download/cli-latest/$Tarball"
    }
    return "https://github.com/$Repo/releases/download/$Tag/$Tarball"
}

function Download-Tarball {
    param([string]$Url)

    $TempFile = Join-Path ([IO.Path]::GetTempPath()) ("superset-install-{0}.tar.gz" -f ([Guid]::NewGuid().ToString("N")))
    Write-Info "Downloading $Url"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $TempFile -UseBasicParsing
    } catch {
        Remove-Item -LiteralPath $TempFile -Force -ErrorAction SilentlyContinue
        Fail "Failed to download $Url"
    }
    return $TempFile
}

function Extract-Tarball {
    param([string]$Tarball)

    Write-Info "Extracting to $InstallDir"
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    & tar.exe -xzf $Tarball -C $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Fail "Failed to extract $Tarball"
    }
    Remove-Item -LiteralPath $Tarball -Force -ErrorAction SilentlyContinue
}

function Test-InstalledFiles {
    $ExpectedFiles = @(
        (Join-Path $InstallDir "bin\superset.exe"),
        (Join-Path $InstallDir "bin\superset-host.cmd"),
        (Join-Path $InstallDir "lib\node.exe")
    )

    foreach ($Path in $ExpectedFiles) {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
            Fail "Expected file not found: $Path"
        }
    }
}

function Add-ToUserPath {
    $BinDir = Join-Path $InstallDir "bin"
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "Process")
    $AllPath = @($UserPath, $MachinePath, $CurrentPath) -join ";"

    $Existing = $AllPath -split ";" | Where-Object {
        $_ -and ([string]::Equals($_.TrimEnd("\"), $BinDir.TrimEnd("\"), [StringComparison]::OrdinalIgnoreCase))
    }

    if ($Existing) {
        Write-Info "$BinDir is already in PATH"
        return
    }

    Write-Info "Adding $BinDir to your user PATH"
    $NextUserPath = if ([string]::IsNullOrWhiteSpace($UserPath)) {
        $BinDir
    } else {
        "$UserPath;$BinDir"
    }
    [Environment]::SetEnvironmentVariable("Path", $NextUserPath, "User")
    $env:Path = "$env:Path;$BinDir"
}

Write-Host "Installing Superset CLI"
Write-Host ""

$Target = Get-Target
Write-Info "Platform: $Target"

$Url = Get-DownloadUrl -Target $Target
if ($env:SUPERSET_INSTALLER_DRY_RUN -eq "1") {
    Write-Info "Dry run: $Url"
    Write-Info "Install directory: $InstallDir"
    exit 0
}

$Tarball = Download-Tarball -Url $Url
Extract-Tarball -Tarball $Tarball
Test-InstalledFiles
Add-ToUserPath

Write-Host ""
Write-Host "Installed!" -ForegroundColor Green
Write-Host "Open a new terminal, then run: superset auth login"
