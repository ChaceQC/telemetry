[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$WorktreeRoot = (Join-Path (Split-Path -Parent (Resolve-Path (Join-Path $PSScriptRoot "..")).Path) "telemetry-worktrees")
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & git -C $RepositoryRoot @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') 执行失败。"
    }
}

function Get-WorktreeBranchMap {
    $items = @()
    $current = @{}

    foreach ($line in (Invoke-Git worktree list --porcelain)) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            if ($current.Count -gt 0) {
                $items += [pscustomobject]$current
                $current = @{}
            }
            continue
        }

        $parts = $line -split " ", 2
        if ($parts.Count -eq 2) {
            $current[$parts[0]] = $parts[1]
        }
    }

    if ($current.Count -gt 0) {
        $items += [pscustomobject]$current
    }

    return $items
}

function Ensure-LocalBranch {
    param([string]$Branch)

    & git -C $RepositoryRoot rev-parse --verify --quiet $Branch *> $null
    if ($LASTEXITCODE -eq 0) {
        return
    }

    & git -C $RepositoryRoot rev-parse --verify --quiet "origin/$Branch" *> $null
    if ($LASTEXITCODE -eq 0) {
        Invoke-Git branch --track $Branch "origin/$Branch" | Out-Null
        return
    }

    Invoke-Git branch $Branch | Out-Null
}

function Add-AgentWorktree {
    param(
        [string]$Name,
        [string]$Branch
    )

    $targetPath = Join-Path $WorktreeRoot $Name
    $branchRef = "refs/heads/$Branch"
    $existing = Get-WorktreeBranchMap | Where-Object { $_.branch -eq $branchRef }

    if ($existing -and ($existing.worktree -ne $targetPath)) {
        Write-Warning "分支 $Branch 已在 $($existing.worktree) 检出。先完成该工作树的提交/切换，再为 $Name 创建独立 worktree。"
        return
    }

    if (Test-Path -LiteralPath $targetPath) {
        Write-Host "已存在 $targetPath，跳过 $Name。"
        return
    }

    Ensure-LocalBranch -Branch $Branch

    if ($PSCmdlet.ShouldProcess($targetPath, "git worktree add $Branch")) {
        New-Item -ItemType Directory -Path $WorktreeRoot -Force | Out-Null
        Invoke-Git worktree add $targetPath $Branch | Out-Null
        Write-Host "已创建 $Name worktree：$targetPath -> $Branch"
    }
}

Write-Host "仓库根目录：$RepositoryRoot"
Write-Host "worktree 根目录：$WorktreeRoot"

Add-AgentWorktree -Name "frontend" -Branch "feature/frontend-dev"
Add-AgentWorktree -Name "backend" -Branch "feature/backend-dev"

Write-Host "完成。后续开发型 agent 必须进入自己的 worktree 工作，根工作树只用于总 agent 汇总和集成。"
