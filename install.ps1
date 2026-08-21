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

$ref = if ($env:TRIPLE_CROWN_REF) { $env:TRIPLE_CROWN_REF } else { "v0.6.5" }

# An explicitly configured npm package wins; otherwise GitHub is the distribution
# channel, so the default path needs no environment variables at all.
if ($env:TRIPLE_CROWN_NPM_PACKAGE) {
  $ver = if ($env:TRIPLE_CROWN_VERSION) { $env:TRIPLE_CROWN_VERSION } else { "latest" }
  & npx --yes "$($env:TRIPLE_CROWN_NPM_PACKAGE)@$ver" install @RemainingArgs
  exit $LASTEXITCODE
}

$repo = if ($env:TRIPLE_CROWN_REPO) { $env:TRIPLE_CROWN_REPO } else { "ungkey/triple-crown" }
& npx --yes "github:$repo#$ref" install @RemainingArgs
exit $LASTEXITCODE
