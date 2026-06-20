[CmdletBinding()]
param(
    [string]$RepositoryRoot,
    [string]$WorktreeRoot,
    [switch]$AllowPendingChanges
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$scriptRoot = if ($PSScriptRoot) {
    $PSScriptRoot
} else {
    Split-Path -Parent $MyInvocation.MyCommand.Path
}

if (-not $RepositoryRoot) {
    $RepositoryRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
}

if (-not $WorktreeRoot) {
    $WorktreeRoot = Join-Path (Split-Path -Parent $RepositoryRoot) "telemetry-worktrees"
}

$expectedWorktrees = @(
    @{
        Name = "root"
        Path = $RepositoryRoot
        Branch = "dev"
        RemoteBranch = "origin/dev"
    },
    @{
        Name = "frontend"
        Path = (Join-Path $WorktreeRoot "frontend")
        Branch = "feature/frontend-dev"
        RemoteBranch = "origin/feature/frontend-dev"
    },
    @{
        Name = "backend"
        Path = (Join-Path $WorktreeRoot "backend")
        Branch = "feature/backend-dev"
        RemoteBranch = "origin/feature/backend-dev"
    }
)

$trackedDeniedPatterns = @(
    "auth.txt",
    ".env",
    ".env.*",
    "agents/runtime/*.log.md",
    "frontend/dist/*",
    "frontend/node_modules/*",
    "backend/.venv/*",
    "tmp/*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.crt",
    "*.csr",
    "*.sql",
    "*.dump"
)

$trackedAllowedPatterns = @(
    ".env.example",
    "backend/.env.example",
    "frontend/.env.example"
)

$script:FailureCount = 0

function Write-CheckResult {
    param(
        [bool]$Passed,
        [string]$Message
    )

    if ($Passed) {
        Write-Host "[OK]   $Message"
        return
    }

    $script:FailureCount += 1
    Write-Host "[FAIL] $Message"
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string]$WorkDir,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    $output = & git -C $WorkDir @Arguments 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "git -C $WorkDir $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }

    return $output
}

function Test-RefExists {
    param(
        [string]$WorkDir,
        [string]$RefName
    )

    & git -C $WorkDir rev-parse --verify --quiet $RefName *> $null
    return $LASTEXITCODE -eq 0
}

function Test-PathSpecMatch {
    param(
        [string]$Path,
        [string]$Pattern
    )

    $normalizedPath = $Path -replace "\\", "/"
    $normalizedPattern = $Pattern -replace "\\", "/"

    if ($normalizedPattern.EndsWith("/*")) {
        return $normalizedPath.StartsWith($normalizedPattern.Substring(0, $normalizedPattern.Length - 1))
    }

    if ($normalizedPattern.Contains("*")) {
        return $normalizedPath -like $normalizedPattern
    }

    return $normalizedPath -eq $normalizedPattern
}

function Test-IsAllowedTrackedFile {
    param([string]$Path)

    foreach ($pattern in $trackedAllowedPatterns) {
        if (Test-PathSpecMatch -Path $Path -Pattern $pattern) {
            return $true
        }
    }

    return $false
}

function Get-TrackedDeniedFiles {
    param([string]$WorkDir)

    $trackedFiles = Invoke-Git -WorkDir $WorkDir ls-files
    $denied = @()

    foreach ($file in $trackedFiles) {
        if (Test-IsAllowedTrackedFile -Path $file) {
            continue
        }

        foreach ($pattern in $trackedDeniedPatterns) {
            if (Test-PathSpecMatch -Path $file -Pattern $pattern) {
                $denied += $file
                break
            }
        }
    }

    return $denied | Sort-Object -Unique
}

function Get-BranchAheadBehind {
    param(
        [string]$WorkDir,
        [string]$LocalRef,
        [string]$RemoteRef
    )

    $counts = Invoke-Git -WorkDir $WorkDir rev-list --left-right --count "$RemoteRef...$LocalRef"
    $parts = ($counts -join "").Trim() -split "\s+"

    return [pscustomobject]@{
        Behind = [int]$parts[0]
        Ahead = [int]$parts[1]
    }
}

Write-Host "Repository root: $RepositoryRoot"
Write-Host "Worktree root: $WorktreeRoot"
Write-Host ""

try {
    Invoke-Git -WorkDir $RepositoryRoot fetch --prune origin | Out-Null
    Write-CheckResult -Passed $true -Message "Fetched latest origin refs."
} catch {
    Write-CheckResult -Passed $false -Message "Failed to fetch origin refs: $($_.Exception.Message)"
}

foreach ($worktree in $expectedWorktrees) {
    Write-Host ""
    Write-Host "== $($worktree.Name): $($worktree.Path) =="

    if (-not (Test-Path -LiteralPath $worktree.Path)) {
        Write-CheckResult -Passed $false -Message "Missing worktree. Run scripts/Initialize-AgentWorktrees.ps1 first."
        continue
    }

    try {
        $insideWorkTree = (Invoke-Git -WorkDir $worktree.Path rev-parse --is-inside-work-tree) -join ""
        Write-CheckResult -Passed ($insideWorkTree.Trim() -eq "true") -Message "Path is a Git worktree."

        $branch = (Invoke-Git -WorkDir $worktree.Path branch --show-current) -join ""
        Write-CheckResult -Passed ($branch.Trim() -eq $worktree.Branch) -Message "Expected branch $($worktree.Branch), actual $($branch.Trim())."

        $status = Invoke-Git -WorkDir $worktree.Path status --porcelain=v1 -uall
        $hasStatus = (($status | Measure-Object).Count -gt 0)
        $allowStatus = $AllowPendingChanges -and ($worktree.Name -eq "root")
        Write-CheckResult -Passed ((-not $hasStatus) -or $allowStatus) -Message "No uncommitted or untracked committable changes."
        if (($status | Measure-Object).Count -gt 0) {
            if ($allowStatus) {
                Write-Host "       Pending root changes are allowed for pre-commit inspection."
            }
            $status | ForEach-Object { Write-Host "       $_" }
        }

        $denied = Get-TrackedDeniedFiles -WorkDir $worktree.Path
        Write-CheckResult -Passed (($denied | Measure-Object).Count -eq 0) -Message "No tracked secrets, runtime logs, dependency directories, or build outputs."
        if (($denied | Measure-Object).Count -gt 0) {
            $denied | ForEach-Object { Write-Host "       $_" }
        }

        if (Test-RefExists -WorkDir $worktree.Path -RefName $worktree.RemoteBranch) {
            $divergence = Get-BranchAheadBehind -WorkDir $worktree.Path -LocalRef $worktree.Branch -RemoteRef $worktree.RemoteBranch
            Write-CheckResult -Passed ($divergence.Behind -eq 0 -and $divergence.Ahead -eq 0) -Message "$($worktree.Branch) matches $($worktree.RemoteBranch)."
            if ($divergence.Behind -ne 0 -or $divergence.Ahead -ne 0) {
                Write-Host "       behind=$($divergence.Behind) ahead=$($divergence.Ahead)"
            }
        } else {
            Write-CheckResult -Passed $false -Message "Remote branch $($worktree.RemoteBranch) is missing or was not fetched."
        }
    } catch {
        Write-CheckResult -Passed $false -Message $_.Exception.Message
    }
}

Write-Host ""
Write-Host "== Integration hints =="

try {
    foreach ($featureBranch in @("feature/frontend-dev", "feature/backend-dev")) {
        $hasBranch = Test-RefExists -WorkDir $RepositoryRoot -RefName $featureBranch
        $hasRemote = Test-RefExists -WorkDir $RepositoryRoot -RefName "origin/$featureBranch"
        Write-CheckResult -Passed ($hasBranch -and $hasRemote) -Message "$featureBranch has local and remote refs."

        if ($hasBranch) {
            $missingFromDev = Invoke-Git -WorkDir $RepositoryRoot log --oneline "dev..$featureBranch"
            if (($missingFromDev | Measure-Object).Count -gt 0) {
                Write-Host "       $featureBranch has commits not in dev history. Prefer path-based restore for integration, not direct merge:"
                $missingFromDev | Select-Object -First 5 | ForEach-Object { Write-Host "       $_" }
            } else {
                Write-Host "       $featureBranch has no commits missing from dev history."
            }
        }
    }
} catch {
    Write-CheckResult -Passed $false -Message "Failed to build integration hints: $($_.Exception.Message)"
}

Write-Host ""

if ($script:FailureCount -gt 0) {
    Write-Host "Check failed: $script:FailureCount item(s) need attention."
    exit 1
}

Write-Host "Check passed: worktrees, branches, and Git protection rules are clean."
