param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalCli = Join-Path $ScriptDir "bin\triple-crown.cjs"

if (Test-Path $LocalCli) {
  & node $LocalCli install @RemainingArgs
  exit $LASTEXITCODE
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Triple Crown: Node.js is required."
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Triple Crown: npx is required for remote installation."
}

$ref = if ($env:TRIPLE_CROWN_REF) { $env:TRIPLE_CROWN_REF } else { "main" }
if ($env:TRIPLE_CROWN_REPO) {
  & npx --yes "github:$($env:TRIPLE_CROWN_REPO)#$ref" install @RemainingArgs
  exit $LASTEXITCODE
}

$pkg = if ($env:TRIPLE_CROWN_NPM_PACKAGE) { $env:TRIPLE_CROWN_NPM_PACKAGE } else { "triple-crown-workflow-installer" }
$ver = if ($env:TRIPLE_CROWN_VERSION) { $env:TRIPLE_CROWN_VERSION } else { "latest" }
& npx --yes "$pkg@$ver" install @RemainingArgs
exit $LASTEXITCODE
