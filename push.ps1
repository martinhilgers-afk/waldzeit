param(
  [string]$msg = "update"
)

Write-Host "== Git add ==" -ForegroundColor Cyan
git add .

Write-Host "== Git commit ==" -ForegroundColor Cyan
git commit -m $msg

Write-Host "== Git push ==" -ForegroundColor Cyan
git push

Write-Host "Fertig! Vercel baut jetzt automatisch neu." -ForegroundColor Green