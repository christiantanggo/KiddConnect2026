# Replicate Tavari (old) Supabase -> new Supabase: public schema + data
# Requires: PostgreSQL 15+ client tools on PATH (pg_dump, pg_restore).
#   Install: https://www.postgresql.org/download/windows/ (Command Line Tools)
#
# Connection strings: Supabase Dashboard -> Project Settings -> Database
# Use "URI" and include ssl: append  ?sslmode=require  if not already present
#
# Usage (PowerShell):
#   Copy the real "URI" from each project: Dashboard -> Project Settings -> Database (not the example below).
#   Replace postgres.[PROJECT-REF] user, password, and host with values from the dashboard (never leave "..." as the host).
#   $env:OLD_SUPABASE_DB_URL = "postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-0-....pooler.supabase.com:6543/postgres?sslmode=require"
#   $env:NEW_SUPABASE_DB_URL = "postgresql://postgres.yyyyy:YOUR_PASSWORD@aws-0-....pooler.supabase.com:6543/postgres?sslmode=require"
#   .\replicate-supabase-public.ps1
#
# The NEW database should be empty in public (or you accept --clean dropping objects).

$ErrorActionPreference = "Stop"
$oldUrl = $env:OLD_SUPABASE_DB_URL
$newUrl = $env:NEW_SUPABASE_DB_URL
if (-not $oldUrl -or -not $newUrl) {
  Write-Error "Set OLD_SUPABASE_DB_URL and NEW_SUPABASE_DB_URL to your two Database URIs (Settings -> Database)."
}

function Get-PostgresUriHost {
  param([Parameter(Mandatory)][string]$Uri)
  if ($Uri -notmatch '^postgres(ql)?://') { return $null }
  if ($Uri -notmatch '@([^:/]+)(?::(\d+))?/') { return $null }
  return $Matches[1]
}

foreach ($pair in @(
  @{ Name = "OLD_SUPABASE_DB_URL"; Uri = $oldUrl },
  @{ Name = "NEW_SUPABASE_DB_URL"; Uri = $newUrl }
)) {
  $h = Get-PostgresUriHost -Uri $pair.Uri
  if (-not $h) {
    Write-Error "$($pair.Name) must be a postgres URI like postgresql://user:pass@HOST:PORT/db (copy from Supabase Database settings)."
  }
  if ($h -eq '...' -or $h -notmatch '\.') {
    Write-Error "$($pair.Name) hostname is '$h' - use the real host from Supabase (e.g. aws-0-REGION.pooler.supabase.com or db.PROJECTREF.supabase.co), not the literal ... placeholder."
  }
}

$dumpPath = Join-Path $PSScriptRoot "tavari-public-schema-and-data.dump"
if (Test-Path $dumpPath) { Remove-Item $dumpPath -Force }

Write-Host "Dumping schema + data from OLD project (schema public only)..."
& pg_dump $oldUrl --schema=public --no-owner --no-acl -F c -f $dumpPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Restoring into NEW project..."
# --clean --if-exists: drop existing public objects first (OK on fresh DB)
& pg_restore --dbname=$newUrl --no-owner --no-acl --verbose --clean --if-exists $dumpPath
if ($LASTEXITCODE -ne 0) {
  Write-Warning "pg_restore exit code $LASTEXITCODE - common on harmless warnings; verify tables in new Supabase SQL editor (SELECT count(*) from information_schema.tables WHERE table_schema='public')."
}

Write-Host ""
Write-Host "Next (still required for parity):"
Write-Host "  1) Re-run: KiddConnect/docs/new-supabase-storage-buckets-and-rls.sql  (buckets + RLS)"
Write-Host "  2) Copy Storage FILES (not in pg_dump): use Supabase dashboard or CLI per bucket"
Write-Host "  3) Auth: this script does NOT copy auth.users - if logins must match, migrate auth separately or re-invite users"
