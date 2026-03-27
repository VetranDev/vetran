# Deploy Vetran to Railway — one‑click helper
# Run this in PowerShell from the Vetran project folder.

$ErrorActionPreference = "Stop"

# 1. Generate JWT_SECRET
Write-Host "Generating JWT_SECRET..." -ForegroundColor Cyan
$JWT_SECRET = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
Write-Host "JWT_SECRET: $JWT_SECRET" -ForegroundColor Yellow

# 2. Your Railway info
$RAILWAY_TOKEN = "a520798d-97aa-46f7-9a38-9a3584081c48"
$GITHUB_REPO = "VetranDev/vetran"

# 3. Open Railway new‑project page (you must be logged in)
$url = "https://railway.app/new?repo=$GITHUB_REPO"
Write-Host "`nOpening Railway in your browser..." -ForegroundColor Cyan
start $url

# 4. Print instructions
Write-Host @"
==================================================
  RAILWAY DEPLOYMENT STEPS
==================================================
1. Click "Create Project" from GitHub (repo should be pre‑selected).
2. Add a **Postgres** plugin (this creates DATABASE_URL).
3. Go to Project → Settings → Variables and add:
   - JWT_SECRET = $JWT_SECRET
   - NODE_ENV   = production
4. Deploy (first deploy may take a few minutes).
5. Once live, test: <your‑project‑url>/health or root.
==================================================
"@ -ForegroundColor Green

Write-Host "`nPress any key to copy JWT_SECRET to clipboard..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Set-Clipboard -Value $JWT_SECRET
Write-Host "JWT_SECRET copied to clipboard!" -ForegroundColor Green
