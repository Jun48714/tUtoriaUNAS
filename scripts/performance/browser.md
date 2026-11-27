# Medición de navegación con Chromium

Ejecutar desde el directorio raíz del repositorio. Se usa Playwright instalado por el frontend, Chromium local y Vite preview. El comparativo debe usar el mismo equipo, navegador, semilla, tamaño de pantalla y condiciones de red. Evitar builds, suites y carga concurrente durante las lecturas.

## Preparación

Iniciar la API aislada en otra terminal con scripts/performance/Start-BenchmarkApi.ps1. El servidor de medición enlaza únicamente a 127.0.0.1 y reenvía /api al servidor sintético. La build de producción de Vite se prepara para API del mismo origen.

```powershell
$node = 'C:\Users\UNAS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$env:VITE_DATA_SOURCE = 'api'
$env:VITE_API_BASE_URL = ''
Push-Location frontend
& $node node_modules/vite/bin/vite.js build --outDir ../scripts/performance/.runtime/browser-before --emptyOutDir
Pop-Location
$env:PERF_DIST = 'scripts/performance/.runtime/browser-before'
$env:PERF_MODE = 'api'
$env:PERF_PROXY_URL = 'http://127.0.0.1:5088'
$env:PERF_STAGE = 'before'
$env:PERF_SAMPLES = '1'
$env:PERF_ADDITIONAL_PROFILES = '[{"name":"coordinador-escuela","role":"tutor","identifier":"DOC-0427","schoolCoordinator":true},{"name":"coordinacion-escuela","role":"coordinacion","identifier":"coordinacion.perf"}]'
& $node scripts/performance/browser-benchmark.mjs scripts/performance/baseline.json
```

Para repetir, conservar el entorno y cambiar PERF_STAGE, PERF_DIST y el archivo de salida. PERF_ROUTE_FILTER acepta una expresión regular para concentrar más repeticiones en rutas críticas, y PERF_SPEEDS acepta la lista de Mbps separada por comas (5,2 por defecto). PERF_CPU permite repetir con el mismo factor de ralentización (4 por defecto). El escenario de navegador sin API se obtiene al compilar demo, usar PERF_MODE=demo y limpiar PERF_PROXY_URL y PERF_ADDITIONAL_PROFILES.

## Lectura de resultados

El JSON registra paths y fases, perfil, fecha UTC, commit, nombre del bundle de entrada, versiones, red, errores y métricas de cada ejecución. La sesión se obtiene por el formulario normal de la aplicación. La visita fría de una ruta privada conserva esa sesión y vacía la caché HTTP de Chromium. Las redirecciones se comprueban y su recarga mide la ruta canónica final. Las fases de navegación interna usan enlaces existentes y consignan omisiones cuando el selector del prototipo no encuentra un enlace visible.

El laboratorio mide una ventana controlada para LCP y CLS. Event Timing representa el mayor evento observado en el recorrido, con valor nulo si el navegador no produjo una entrada. Esta cifra no equivale al INP p75 poblacional. Los percentiles con pocas muestras son descriptivos y los valores mínimos de muestras se identifican en el reporte comparativo. Scripting y memoria provienen de métricas de Chromium. Resource Timing captura bytes codificados, decodificados y transferidos; CDP añade bytes y estado por petición API. La latencia CDP incluye el RTT emulado.

Para comparar dos salidas con el mismo entorno, generar la matriz con:

```powershell
& $node scripts/performance/browser-compare.mjs scripts/performance/baseline.json scripts/performance/browser-after.json scripts/performance/browser-comparison.json
```

PERF_PHASES permite acotar las fases medidas para un diagnóstico rápido y PERF_PROFILE_FILTER selecciona perfiles por expresión regular. PERF_VIEWPORT acepta ancho y alto en formato 390x844. Si se selecciona recarga, la prueba también abre la ruta fría para preparar la caché. Si se selecciona navegación repetida, el primer acceso interno prepara la segunda visita.

Referencias de medición. [Playwright 1.64](https://playwright.dev/docs/release-notes#version-164) · [CDP Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditionsByRule) · [CDP Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/) · [Core Web Vitals](https://web.dev/articles/vitals)
