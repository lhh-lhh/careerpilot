param([switch]$Read)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$credentialFolder = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CareerPilot'
$credentialPath = Join-Path $credentialFolder 'deepseek.key.dpapi'
if ($Read) {
  if (-not (Test-Path -LiteralPath $credentialPath)) { exit 0 }
  $encrypted = [IO.File]::ReadAllBytes($credentialPath)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
  [Array]::Clear($plain, 0, $plain.Length)
} else {
  $secret = [Console]::In.ReadToEnd().Trim()
  if ($secret -notmatch '^sk-[A-Za-z0-9_-]{20,200}$') { throw 'Invalid credential format' }
  [IO.Directory]::CreateDirectory($credentialFolder) | Out-Null
  $plain = [Text.Encoding]::UTF8.GetBytes($secret)
  $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($credentialPath, $encrypted)
  [Array]::Clear($plain, 0, $plain.Length)
  $secret = $null
  Write-Output 'Encrypted credential configured for current Windows user; no plaintext file created.'
}
