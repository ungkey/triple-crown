$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $Here "doctor.cjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node (Join-Path $Here "run-live.cjs") --keep
exit $LASTEXITCODE
