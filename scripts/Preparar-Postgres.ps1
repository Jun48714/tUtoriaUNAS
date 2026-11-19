[CmdletBinding()]
param([int]$Port = 5449)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskConfigPath = Join-Path $taskRepo 'backend/TutoriaUNAS.Api/appsettings.Development.local.json'
$taskRoots = @(
    (Join-Path $env:LOCALAPPDATA 'Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/TutoriaUNAS/postgresql-18.6'),
    (Join-Path $env:LOCALAPPDATA 'TutoriaUNAS/postgresql-18.6')
)
if (Test-Path -LiteralPath $taskConfigPath) {
    # Preparar no significa sustituir el entorno existente ni descartar cuentas/SMTP/CORS.
    $taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $taskConnection = [System.Data.Common.DbConnectionStringBuilder]::new()
    $taskConnection.set_ConnectionString($taskConfig.ConnectionStrings.Tutoria)
    if ([string]$taskConnection.get_Item('Host') -notin @('127.0.0.1', 'localhost')) { throw 'La configuración existente no es local. No se modificó.' }
    $taskConfiguredPort = if ($taskConnection.ContainsKey('Port')) { [int]$taskConnection.get_Item('Port') } else { 5432 }
    if ($PSBoundParameters.ContainsKey('Port') -and $Port -ne $taskConfiguredPort) { throw 'El puerto solicitado difiere de la configuración existente. No se modificó.' }
    $Port = $taskConfiguredPort
    $taskMatches = @($taskRoots | Where-Object {
        $taskSecretsPath = Join-Path $_ 'credenciales.local.json'
        if ((Test-Path -LiteralPath $taskSecretsPath) -and (Test-Path -LiteralPath (Join-Path $_ 'data/PG_VERSION'))) {
            $taskExistingSecrets = Get-Content -LiteralPath $taskSecretsPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $taskExistingSecrets.app -eq [string]$taskConnection.get_Item('Password')
        }
    })
    if ($taskMatches.Count -ne 1) { throw 'No se identificó de forma única el clúster de la configuración existente. No se creó ni sobrescribió ningún entorno.' }
    $taskExistingRoot = $taskMatches[0]
    $taskExistingBin = Join-Path $taskExistingRoot 'pgsql/bin'
    $taskExistingData = Join-Path $taskExistingRoot 'data'
    $taskListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($taskListener) {
        $taskProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskListener.OwningProcess)
        $taskExpectedBin = (Join-Path $taskExistingBin 'postgres.exe').Replace('/', '\')
        $taskExpectedData = $taskExistingData.Replace('/', '\')
        if (([string]$taskProcess.ExecutablePath).Replace('/', '\') -ne $taskExpectedBin -or
            ([string]$taskProcess.CommandLine).Replace('/', '\') -notlike ('*' + $taskExpectedData + '*')) {
            throw "El puerto $Port pertenece a otro clúster o proceso. No se modificó la configuración."
        }
    } else {
        & (Join-Path $taskExistingBin 'pg_ctl.exe') status -D $taskExistingData *> $null
        if ($LASTEXITCODE -eq 0) { throw 'El clúster existente está iniciado en otro puerto. No se modificó.' }
        $taskExistingPg = Start-Process -FilePath (Join-Path $taskExistingBin 'pg_ctl.exe') -ArgumentList @('start','-D',('"'+$taskExistingData+'"'),'-o',('"-p '+$Port+'"'),'-l',('"'+(Join-Path $taskExistingRoot 'postgresql.log')+'"'),'-w') -WindowStyle Hidden -PassThru
        if (-not $taskExistingPg.WaitForExit(30000) -or $taskExistingPg.ExitCode -ne 0) { throw 'No se pudo iniciar el clúster existente. Revisa su log local.' }
    }
    $taskPreviousPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = [string]$taskConnection.get_Item('Password')
        & (Join-Path $taskExistingBin 'psql.exe') -w -h 127.0.0.1 -p $Port -U ([string]$taskConnection.get_Item('Username')) -d ([string]$taskConnection.get_Item('Database')) -tAc 'SELECT 1' *> $null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la conexión existente. No se modificó la configuración.' }
    } finally { $env:PGPASSWORD = $taskPreviousPassword }
    Write-Output "PostgreSQL existente verificado: 127.0.0.1:$Port. Se conservaron la base, cuentas, correo y configuración del frontend."
    return
}
if (@($taskRoots | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'data/PG_VERSION') }).Count -gt 0) {
    throw 'Ya existe un clúster local pero falta la configuración de este proyecto. Recupera su configuración antes de preparar otro; no se creó ninguna base.'
}
$taskRoot = Join-Path $env:LOCALAPPDATA 'TutoriaUNAS/postgresql-18.6'
$taskBin = Join-Path $taskRoot 'pgsql/bin'
$taskData = Join-Path $taskRoot 'data'
$taskSecrets = Join-Path $taskRoot 'credenciales.local.json'
New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $taskBin 'postgres.exe'))) {
    $taskZip = Join-Path $taskRoot 'postgresql.zip'
    if (-not (Test-Path -LiteralPath $taskZip)) {
        Invoke-WebRequest -Uri 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260609' -OutFile $taskZip
    }
    Expand-Archive -LiteralPath $taskZip -DestinationPath $taskRoot
}
if (Test-Path -LiteralPath $taskSecrets) {
    $taskCredentials = Get-Content -LiteralPath $taskSecrets -Raw | ConvertFrom-Json
} else {
    $taskCredentials = [PSCustomObject]@{ owner = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'); app = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N') }
    $taskCredentials | ConvertTo-Json | Set-Content -LiteralPath $taskSecrets -Encoding ascii
}
if (-not (Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))) {
    $taskPwFile = Join-Path $taskRoot 'init-password.local.json'
    [System.IO.File]::WriteAllText($taskPwFile, $taskCredentials.owner)
    try {
        & (Join-Path $taskBin 'initdb.exe') '-D' $taskData '-U' 'tutoria_owner' '--encoding=UTF8' '--locale=C' '--auth=scram-sha-256' "--pwfile=$taskPwFile"
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar PostgreSQL.' }
    } finally { Remove-Item -LiteralPath $taskPwFile -ErrorAction SilentlyContinue }
    Add-Content -LiteralPath (Join-Path $taskData 'postgresql.conf') -Value "`nlisten_addresses = '127.0.0.1'`nport = $Port`nmax_connections = 40`n"
}
& (Join-Path $taskBin 'pg_ctl.exe') status '-D' $taskData *> $null
if ($LASTEXITCODE -ne 0) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "El puerto $Port ya está ocupado." }
    $taskPgProcess = Start-Process -FilePath (Join-Path $taskBin 'pg_ctl.exe') -ArgumentList @('start','-D',('"'+$taskData+'"'),'-l',('"'+(Join-Path $taskRoot 'postgresql.log')+'"'),'-w') -WindowStyle Hidden -PassThru
    if (-not $taskPgProcess.WaitForExit(30000)) { throw 'PostgreSQL tardó demasiado en iniciar. Revisa su log local.' }
    if ($taskPgProcess.ExitCode -ne 0) { throw 'PostgreSQL no pudo iniciar. Revisa su log local.' }
}
$taskPreviousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $taskCredentials.owner
    $taskPsql = Join-Path $taskBin 'psql.exe'
    $taskRoleSql = "SELECT 1 FROM pg_roles WHERE rolname='tutoria_app'"
    $taskRoleExists = & $taskPsql -h 127.0.0.1 -p $Port -U tutoria_owner -d postgres -tAc $taskRoleSql
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar al PostgreSQL local.' }
    if (-not $taskRoleExists) {
        "CREATE ROLE tutoria_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$($taskCredentials.app)';" | & $taskPsql -h 127.0.0.1 -p $Port -U tutoria_owner -d postgres -v ON_ERROR_STOP=1
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el rol de la aplicación.' }
    }
    foreach ($taskDb in @('tutoria_unas','tutoria_unas_tests')) {
        $taskDbExists = & $taskPsql -h 127.0.0.1 -p $Port -U tutoria_owner -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$taskDb'"
        if (-not $taskDbExists) {
            & (Join-Path $taskBin 'createdb.exe') -h 127.0.0.1 -p $Port -U tutoria_owner -O tutoria_app $taskDb
            if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $taskDb." }
        }
    }
} finally { $env:PGPASSWORD = $taskPreviousPassword }
$taskConnection = "Host=127.0.0.1;Port=$Port;Database=tutoria_unas;Username=tutoria_app;Password=$($taskCredentials.app);Include Error Detail=false"
$taskConfig = @{ Database=@{Enabled=$true}; ConnectionStrings=@{Tutoria=$taskConnection}; Tutoria=@{ApplyMigrations=$true;SeedDemo=$true}; LocalDevelopment=@{Enabled=$true} }
$taskConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRepo 'backend/TutoriaUNAS.Api/appsettings.Development.local.json') -Encoding utf8
@('VITE_DATA_SOURCE=api','VITE_API_BASE_URL=http://127.0.0.1:5080') | Set-Content -LiteralPath (Join-Path $taskRepo 'frontend/.env.local') -Encoding ascii
Write-Output "PostgreSQL local listo: 127.0.0.1:$Port / tutoria_unas. Credenciales solo en archivos locales ignorados por Git."
