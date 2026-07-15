param(
  [Parameter(Mandatory = $true)]
  [string] $RepoPath,

  [string] $TaskName = "Torrevie TEX Quick Connect",
  [string] $LogPath = "tex-quick-connect-connector.log"
)

$resolvedRepo = Resolve-Path -LiteralPath $RepoPath -ErrorAction Stop
$command = "cd '$($resolvedRepo.Path)'; pnpm tex:quick-connect:connector *> '$LogPath'"

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs the persistent TEX WhatsApp linked-device connector." `
  -Force

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Repository path: $($resolvedRepo.Path)"
Write-Host "Log path: $LogPath"
