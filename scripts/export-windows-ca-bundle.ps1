$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "docker\certs"
$outputFile = Join-Path $outputDir "local-ca.crt"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$certificates = @(
  Get-ChildItem Cert:\CurrentUser\Root
  Get-ChildItem Cert:\LocalMachine\Root
) | Where-Object {
  $_.HasPrivateKey -eq $false -and $_.RawData.Length -gt 0
} | Sort-Object Thumbprint -Unique

if ($certificates.Count -eq 0) {
  throw "No Windows root certificates were found."
}

$builder = [System.Text.StringBuilder]::new()

foreach ($certificate in $certificates) {
  $base64 = [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks)
  [void]$builder.AppendLine("-----BEGIN CERTIFICATE-----")
  [void]$builder.AppendLine($base64)
  [void]$builder.AppendLine("-----END CERTIFICATE-----")
}

[System.IO.File]::WriteAllText($outputFile, $builder.ToString(), [System.Text.Encoding]::ASCII)

Write-Host "Wrote $($certificates.Count) certificates to $outputFile"
