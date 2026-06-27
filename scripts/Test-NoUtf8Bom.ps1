param(
    [string]$RepositoryRoot = "."
)

$ErrorActionPreference = "Stop"

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$gitOutput = git -C $resolvedRoot ls-files -z

if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed with exit code $LASTEXITCODE"
}

$paths = $gitOutput -split "`0" | Where-Object { $_ -ne "" }
$bomPaths = New-Object System.Collections.Generic.List[string]

foreach ($path in $paths) {
    $fullPath = Join-Path $resolvedRoot $path
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        continue
    }

    $stream = [System.IO.File]::OpenRead($fullPath)
    try {
        if ($stream.Length -lt 3) {
            continue
        }

        $buffer = [byte[]]::new(3)
        [void]$stream.Read($buffer, 0, 3)
        if ($buffer[0] -eq 0xEF -and $buffer[1] -eq 0xBB -and $buffer[2] -eq 0xBF) {
            $bomPaths.Add($path)
        }
    }
    finally {
        $stream.Dispose()
    }
}

if ($bomPaths.Count -gt 0) {
    Write-Error ("UTF-8 BOM is not allowed in tracked files:`n" + ($bomPaths -join "`n"))
    exit 1
}

Write-Host "No tracked files start with a UTF-8 BOM."
