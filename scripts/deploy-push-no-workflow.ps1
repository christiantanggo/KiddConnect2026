# Push to GitHub without the workflow commit (so PAT without workflow scope can push).
# Run from repo root. Close Cursor/IDE first so git can update files.
# This: fetches, resets main to origin/main, cherry-picks only the "greeting & script" commit, then pushes.
# Railway will deploy from the push.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# Remove stale locks
Get-ChildItem -Path .git -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

git fetch origin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Reset to what's on remote (drops local commits that haven't been pushed, including the workflow one)
git reset --hard origin/main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Re-apply only the "Emergency dispatch: configurable greeting and script" commit (no workflow change)
git cherry-pick 2c6bb85
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cherry-pick failed. Run: git cherry-pick --abort"
  exit $LASTEXITCODE
}

git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Push succeeded. Railway should deploy from the new commit."
