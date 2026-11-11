# Dustoff installer: unpacks to %LOCALAPPDATA%\Programs\Dustoff (no admin needed),
# adds Desktop + Start menu shortcuts, registers an uninstaller, then opens the hub.
param([string]$Parent = (Join-Path $env:LOCALAPPDATA 'Programs'), [switch]$NoShortcuts, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$dest = Join-Path $Parent 'Dustoff'
$zip = Join-Path $PSScriptRoot 'payload.zip'

# Small "Installing" window so it doesn't look frozen.
$form = New-Object Windows.Forms.Form
$form.Text = 'Dustoff Setup'; $form.Width = 420; $form.Height = 150; $form.FormBorderStyle = 'FixedDialog'
$form.StartPosition = 'CenterScreen'; $form.MaximizeBox = $false; $form.MinimizeBox = $false; $form.TopMost = $true
$label = New-Object Windows.Forms.Label
$label.Text = 'Installing Dustoff. This takes about a minute.'; $label.AutoSize = $false; $label.Width = 380; $label.Height = 24; $label.Left = 16; $label.Top = 18
$bar = New-Object Windows.Forms.ProgressBar
$bar.Style = 'Marquee'; $bar.MarqueeAnimationSpeed = 25; $bar.Width = 370; $bar.Height = 20; $bar.Left = 16; $bar.Top = 52
$form.Controls.AddRange(@($label, $bar))
$form.Show(); [Windows.Forms.Application]::DoEvents()

function Pump([int]$ms) { $end = [DateTime]::Now.AddMilliseconds($ms); while ([DateTime]::Now -lt $end) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 } }

try {
  # Close a running copy so files can be replaced on an update.
  Get-Process -Name 'Dustoff' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null

  $p = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @('-xf', "`"$zip`"", '-C', "`"$Parent`"") -WindowStyle Hidden -PassThru
  $null = $p.Handle   # keeps the exit code readable after the process ends
  while (-not $p.HasExited) { Pump 100 }
  $p.WaitForExit()
  if (-not (Test-Path (Join-Path $dest 'resources\app\main.js')) -or -not (Test-Path (Join-Path $dest 'Dustoff.exe'))) { throw "Unpacking failed (code $($p.ExitCode))." }

  $exe = Join-Path $dest 'Dustoff.exe'
  if (-not $NoShortcuts) {
    $label.Text = 'Adding shortcuts...'; Pump 50
    $sh = New-Object -ComObject WScript.Shell
    $places = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))
    foreach ($dir in $places) {
      $lnk = $sh.CreateShortcut((Join-Path $dir 'Dustoff.lnk'))
      $lnk.TargetPath = $exe; $lnk.WorkingDirectory = $dest; $lnk.IconLocation = "$exe,0"; $lnk.Description = 'Play your Nintendo games'
      $lnk.Save()
    }
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Dustoff'
    New-Item -Path $key -Force | Out-Null
    $ver = (Get-Content (Join-Path $dest 'version.txt') -ErrorAction SilentlyContinue | Select-Object -First 1)
    $size = [int]((Get-ChildItem $dest -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1KB)
    $vals = @{ DisplayName = 'Dustoff'; DisplayVersion = "$ver"; Publisher = 'Dustoff'; InstallLocation = $dest; DisplayIcon = "$exe,0"; NoModify = 1; NoRepair = 1; EstimatedSize = $size
      UninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dest\uninstall.ps1`"" }
    foreach ($k in $vals.Keys) { Set-ItemProperty -Path $key -Name $k -Value $vals[$k] }
  }

  $form.Close()
  if (-not $NoLaunch) { Start-Process -FilePath $exe -WorkingDirectory $dest }
} catch {
  $form.Close()
  [Windows.Forms.MessageBox]::Show("Dustoff couldn't be installed.`n`n$($_.Exception.Message)", 'Dustoff Setup', 'OK', 'Error') | Out-Null
  exit 1
}
