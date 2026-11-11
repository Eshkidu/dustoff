# Dustoff uninstaller. Asks whether to keep games and saves.
Add-Type -AssemblyName System.Windows.Forms
$dest = $PSScriptRoot
$answer = [Windows.Forms.MessageBox]::Show(
  "Keep your games and saves?`n`nYes: remove Dustoff but keep your games, saves and library in`n$dest`n(reinstalling picks them back up).`n`nNo: delete everything, including your games and saves.",
  'Uninstall Dustoff', 'YesNoCancel', 'Question')
if ($answer -eq 'Cancel') { exit 0 }

Get-Process -Name 'Dustoff', 'retroarch', 'Dolphin', 'Cemu', 'Ryujinx' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
Start-Sleep -Milliseconds 800

foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item (Join-Path $dir 'Dustoff.lnk') -Force -ErrorAction SilentlyContinue
}
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Dustoff' -Recurse -Force -ErrorAction SilentlyContinue

if ($answer -eq 'No') {
  # Delete from a copy of cmd so this script's own folder can go too.
  Start-Process cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$dest`"" -WindowStyle Hidden
} else {
  # Keep games, data (library + art) and emulator save folders; remove the program files.
  Get-ChildItem $dest -Force | Where-Object { $_.Name -notin @('games', 'data', 'emulators') } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
[Windows.Forms.MessageBox]::Show('Dustoff has been removed.', 'Uninstall Dustoff', 'OK', 'Information') | Out-Null
