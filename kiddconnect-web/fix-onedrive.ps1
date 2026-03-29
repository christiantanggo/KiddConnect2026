# Script to fix OneDrive sync issues with Next.js .next directory
# Run this if you encounter EINVAL errors related to OneDrive

Write-Host "Fixing OneDrive sync issues for Next.js..." -ForegroundColor Yellow

# Remove .next directory if it exists
if (Test-Path .next) {
    Write-Host "Removing .next directory..." -ForegroundColor Yellow
    try {
        Remove-Item -Recurse -Force .next -ErrorAction Stop
        Write-Host "✓ .next directory removed" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Could not remove .next directory: $_" -ForegroundColor Red
        Write-Host "You may need to manually delete it or exclude it from OneDrive sync" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ No .next directory found" -ForegroundColor Green
}

# Remove node_modules cache
if (Test-Path node_modules\.cache) {
    Write-Host "Removing node_modules cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
    Write-Host "✓ Cache cleared" -ForegroundColor Green
}

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Make sure .next/ is excluded from OneDrive sync" -ForegroundColor White
Write-Host "2. If your project is in OneDrive, consider moving it to a non-synced location" -ForegroundColor White
Write-Host "3. Restart the dev server: npm run dev" -ForegroundColor White










