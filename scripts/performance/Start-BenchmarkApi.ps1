[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 5088,
    [ValidateRange(1024, 65535)][int]$DatabasePort = 5449
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$api = Join-Path $repo 'backend/TutoriaUNAS.Api'
$output = Join-Path $PSScriptRoot ".runtime/backend-$Port"
$database = 'tutoria_unas_tests'
$schema = 'perf_' + [Guid]::NewGuid().ToString('N').Substring(0, 14)
$pgListener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $DatabasePort -State Listen |
    Select-Object -First 1
$pgProcess = Get-Process -Id $pgListener.OwningProcess
if ($pgProcess.ProcessName -ne 'postgres') {
    throw "El puerto $DatabasePort no corresponde a PostgreSQL local."
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto HTTP $Port está ocupado."
}

$pgBin = Split-Path -Parent $pgProcess.Path
$pgRoot = Split-Path -Parent (Split-Path -Parent $pgBin)
$psql = Join-Path $pgBin 'psql.exe'
$credential = Get-Content -LiteralPath (Join-Path $pgRoot 'credenciales.local.json') -Raw -Encoding UTF8 |
    ConvertFrom-Json
$connection = [System.Data.Common.DbConnectionStringBuilder]::new()
$connection.set_ConnectionString("Host=127.0.0.1;Port=$DatabasePort;Database=$database;Username=tutoria_app;Include Error Detail=false;Application Name=TutoriaPerformance")
$connection.set_Item('Password', [string]$credential.app)
$connection.set_Item('Search Path', $schema)

$settings = @{
    ASPNETCORE_ENVIRONMENT = 'Development'
    DOTNET_ENVIRONMENT = 'Development'
    TUTORIA_LOCAL_CONFIG = $null
    ConnectionStrings__Tutoria = $connection.get_ConnectionString()
    Database__Enabled = 'true'
    Authentication__Enabled = 'false'
    LocalDevelopment__Enabled = 'true'
    Cuentas__Enabled = 'false'
    Tutoria__ApplyMigrations = 'true'
    Tutoria__SeedDemo = 'true'
    Tutoria__DisableDispatcher = 'true'
    Logging__LogLevel__Default = 'Warning'
    Logging__LogLevel__Microsoft_EntityFrameworkCore = 'Warning'
}
$previous = @{}
foreach ($key in $settings.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
}

function Invoke-BenchmarkSql([string]$Sql) {
    $previousPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = [string]$credential.app
        $Sql | & $psql -X -w -q -h 127.0.0.1 -p $DatabasePort -U tutoria_app -d $database -v ON_ERROR_STOP=1 -f -
        if ($LASTEXITCODE -ne 0) { throw "Falló la preparación del esquema sintético $schema." }
    }
    finally { $env:PGPASSWORD = $previousPassword }
}

Push-Location $api
try {
    & dotnet restore --locked-mode
    if ($LASTEXITCODE -ne 0) { throw 'Falló la restauración de la API.' }
    & dotnet build --configuration Release --no-restore --output $output
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de la API.' }

    Invoke-BenchmarkSql "CREATE SCHEMA $schema"
    $assembly = Join-Path $output 'TutoriaUNAS.Api.dll'
    & dotnet $assembly --migrate
    if ($LASTEXITCODE -ne 0) { throw "Falló la semilla sintética en $schema." }

    $roles = @(
        "SET search_path TO $schema;",
        'BEGIN;',
        'UPDATE "Usuarios" SET "CoordinadorEscuela" = TRUE, "Version" = "Version" + 1',
        'WHERE "Id" = ''DOC-0427'' AND "Rol" = ''tutor'' AND "Issuer" = ''local-development'';',
        'INSERT INTO "Usuarios"',
        '("Id","Issuer","Subject","Rol","PersonaId","EscuelaId","Identificador","PasswordHashDesarrollo","Activo","Version","AdminInstitucional","CoordinadorEscuela")',
        'SELECT ''COM-PERF-01'', "Issuer", ''COM-PERF-01'', ''coordinacion'', "PersonaId", "EscuelaId", ''coordinacion.perf'', "PasswordHashDesarrollo", TRUE, 1, FALSE, FALSE',
        'FROM "Usuarios" WHERE "Id" = ''DOC-0423'' AND "Rol" = ''tutor'' AND "Issuer" = ''local-development'';',
        'COMMIT;'
    ) -join [Environment]::NewLine
    Invoke-BenchmarkSql $roles

    $env:Tutoria__ApplyMigrations = 'false'
    $env:Tutoria__SeedDemo = 'false'
    Write-Output "API http://127.0.0.1:$Port | PostgreSQL $database | esquema $schema"
    & dotnet $assembly --urls "http://127.0.0.1:$Port"
    if ($LASTEXITCODE -ne 0) { throw 'La API de medición se cerró con error.' }
}
finally {
    Pop-Location
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
