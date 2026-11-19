[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
if (Get-NetTCPConnection -LocalPort 5084,5174 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Detén los servidores de prueba de los puertos 5084 y 5174 antes de preparar otro esquema.'
}
$taskLocal = Get-Content -LiteralPath (Join-Path $taskRepo 'backend/TutoriaUNAS.Api/appsettings.Development.local.json') -Raw | ConvertFrom-Json
$taskConnection = [System.Data.Common.DbConnectionStringBuilder]::new()
$taskConnection.set_ConnectionString($taskLocal.ConnectionStrings.Tutoria)
if ([string]$taskConnection.get_Item('Host') -ne '127.0.0.1') { throw 'Esta prueba requiere PostgreSQL local.' }
$taskConnection.set_Item('Database', 'tutoria_unas_tests')
$taskPort = [int]$taskConnection.get_Item('Port')
$taskListener = Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction Stop | Select-Object -First 1
$taskPostgres = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskListener.OwningProcess)
if ($taskPostgres.Name -ne 'postgres.exe') { throw 'El puerto de la base no pertenece a PostgreSQL.' }
$taskPsql = Join-Path (Split-Path -Parent $taskPostgres.ExecutablePath) 'psql.exe'
$taskSchema = 'prueba_editor_' + [guid]::NewGuid().ToString('N')
$taskPreviousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = [string]$taskConnection.get_Item('Password')
    & $taskPsql -h 127.0.0.1 -p $taskPort -U ([string]$taskConnection.get_Item('Username')) -d tutoria_unas_tests -v ON_ERROR_STOP=1 -c ('CREATE SCHEMA ' + $taskSchema)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el esquema exclusivo de pruebas.' }
} finally { $env:PGPASSWORD = $taskPreviousPassword }
$taskConnection.set_Item('Search Path', $taskSchema)
$taskConfig = @{
    Database = @{ Enabled = $true }
    ConnectionStrings = @{ Tutoria = $taskConnection.get_ConnectionString() }
    Tutoria = @{ ApplyMigrations = $true; SeedDemo = $true; DisableDispatcher = $true }
    LocalDevelopment = @{ Enabled = $true }
    Cuentas = @{ Enabled = $false }
    Cors = @{ AllowedOrigins = @('http://127.0.0.1:5174') }
}
$taskDirectory = Join-Path $env:LOCALAPPDATA 'TutoriaUNAS'
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$taskConfigPath = Join-Path $taskDirectory 'editor-qa.local.json'
$taskConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskConfigPath -Encoding utf8
Write-Output "Configuración: $taskConfigPath"
Write-Output "Esquema desechable: tutoria_unas_tests / $taskSchema"
Write-Output 'API de prueba: 5084. Frontend de prueba: 5174. La base principal no se modifica.'
