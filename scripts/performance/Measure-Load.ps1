[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$K6,
    [Parameter(Mandatory)][ValidateSet('before', 'after')][string]$Variant,
    [ValidateRange(1024, 65535)][int]$Port = 5088,
    [ValidateRange(5, 120)][int]$StageSeconds = 12,
    [string]$Counters,
    [string]$FixturePassword = $env:TUTORIA_PERF_PASSWORD
)

$ErrorActionPreference = 'Stop'
if (!$FixturePassword) { throw 'Define TUTORIA_PERF_PASSWORD con la clave de la semilla sintética.' }
$k6Path = (Resolve-Path -LiteralPath $K6).Path
$fixture = @{
    TUTORIA_PERF_URL = "http://127.0.0.1:$Port"
    TUTORIA_PERF_SYNTHETIC = '1'
    TUTORIA_PERF_STAGE_SECONDS = "$StageSeconds"
    TUTORIA_PERF_USER_ESTUDIANTE = '2023010456'
    TUTORIA_PERF_USER_TUTOR = 'DOC-0421'
    TUTORIA_PERF_USER_COORDINADORESCUELA = 'DOC-0427'
    TUTORIA_PERF_USER_COORDINACION = 'coordinacion.perf'
    TUTORIA_PERF_USER_ADMINISTRACION = 'coordinacion.tutoria'
    TUTORIA_PERF_PASSWORD = $FixturePassword
}
$stages = [ordered]@{ base = 1; nominal = 1; alta = 1; pico = 3; estres = 4 }
$runtime = Join-Path $PSScriptRoot '.runtime'
$null = New-Item -ItemType Directory -Path $runtime -Force
$config = Join-Path $PSScriptRoot 'carga.k6.js'
$started = [DateTimeOffset]::UtcNow
$stamp = $started.ToUnixTimeSeconds()
$counterProcess = $null
$previous = @{}

try {
    foreach ($key in @($fixture.Keys) + 'TUTORIA_PERF_STAGE') {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $fixture[$key], 'Process')
    }
    if ($Counters) {
        $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen | Select-Object -First 1
        $meterList = 'System.Runtime,Microsoft.AspNetCore.Hosting,Microsoft.AspNetCore.Server.Kestrel,Npgsql'
        $telemetryFile = Join-Path $runtime "counters-$Variant.json"
        $duration = [TimeSpan]::FromSeconds(10 * $StageSeconds + 18).ToString('dd\:hh\:mm\:ss')
        $previous['DOTNET_BUNDLE_EXTRACT_BASE_DIR'] = $env:DOTNET_BUNDLE_EXTRACT_BASE_DIR
        $env:DOTNET_BUNDLE_EXTRACT_BASE_DIR = Join-Path $runtime 'counters-bundle'
        $counterOptions = @{
            FilePath = (Resolve-Path -LiteralPath $Counters).Path
            WindowStyle = 'Hidden'
            PassThru = $true
            ArgumentList = @('collect', '-p', "$($listener.OwningProcess)", '--format', 'json',
                '-o', ('"' + $telemetryFile + '"'), '--counters', $meterList, '--duration', $duration)
            RedirectStandardOutput = Join-Path $runtime "counters-$Variant.log"
            RedirectStandardError = Join-Path $runtime "counters-$Variant.err.log"
        }
        $counterProcess = Start-Process @counterOptions
    }

    $results = foreach ($stage in $stages.Keys) {
        $env:TUTORIA_PERF_STAGE = $stage
        $summary = Join-Path $runtime "k6-$Variant-$stamp-$stage.json"
        $log = Join-Path $runtime "k6-$Variant-$stamp-$stage.log"
        & $k6Path run --no-color --quiet --summary-export $summary $config *> $log
        $exitCode = $LASTEXITCODE
        if (!(Test-Path -LiteralPath $summary)) { throw "k6 no produjo resultados para $stage, código $exitCode. Ver $log." }
        $metrics = (Get-Content -LiteralPath $summary -Raw | ConvertFrom-Json).metrics
        [ordered]@{
            stage = $stage
            exitCode = $exitCode
            activeSeconds = $stages[$stage] * $StageSeconds
            maxUsersObserved = $metrics.vus.max
            requests = $metrics.http_reqs.count
            requestsPerSecond = $metrics.http_reqs.rate
            errorRate = $metrics.http_req_failed.value
            allRequestsMs = $metrics.http_req_duration
            readsMs = $metrics.'http_req_duration{tipo:lectura}'
            confirmedWritesMs = $metrics.'http_req_duration{tipo:mutacion}'
        }
    }
}
finally {
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}

$report = [ordered]@{
    variant = $Variant
    startedUtc = $started.ToString('o')
    commit = (& git -C $PSScriptRoot rev-parse HEAD)
    stageSeconds = $StageSeconds
    loopbackPort = $Port
    k6 = (& $k6Path version)
    stages = @($results)
}
$report | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "k6-$Variant.json") -Encoding utf8
if ($counterProcess) { Wait-Process -InputObject $counterProcess }
$report.stages | Format-Table stage, exitCode, maxUsersObserved, requests, errorRate
if ($report.stages.exitCode | Where-Object { $_ -ne 0 }) { exit 1 }
