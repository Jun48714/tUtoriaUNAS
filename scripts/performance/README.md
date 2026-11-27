# Rendimiento de Tutoría UNAS

Auditoría local del 27 de noviembre de 2026. La referencia inicial es el commit **c22fc213**. Las pruebas utilizan datos sintéticos y un esquema independiente en PostgreSQL 18.6. El inventario identifica tres roles de autenticación, cinco perfiles efectivos, 46 pantallas y ocho alias privados, además de siete rutas públicas y de sistema.

- [Rutas, permisos, datos y acciones](INVENTARIO.md)
- [Endpoints, servicios y consultas](INVENTARIO-API.md)
- [Reproducción de Playwright y Chromium](browser.md)
- [Referencia de la API y planes de consulta](backend-baseline.json)
- [Escenarios y umbrales de k6](carga.k6.js)

## Resultado en navegador

El perfil fue la ruta directa común elegida para comparar las cinco cuentas con la misma API y el mismo esquema sintético. Chromium 156 usó Playwright 1.64, resolución 1440 × 900, RTT de 150 ms y CPU ralentizada 4×. Los valores corresponden al tiempo hasta ver contenido útil en una muestra por combinación. Cada pareja indica antes → después.

- Estudiante. 5 Mbps **2,70 → 2,46 s**. 2 Mbps **3,57 → 2,31 s**.
- Tutor. 5 Mbps **2,65 → 1,99 s**. 2 Mbps **3,09 → 2,77 s**.
- Coordinador de escuela. 5 Mbps **2,61 → 1,98 s**. 2 Mbps **3,11 → 2,76 s**.
- Coordinación con ámbito escolar. 5 Mbps **2,63 → 1,98 s**. 2 Mbps **3,54 → 2,73 s**.
- Administración institucional. 5 Mbps **2,65 → 1,96 s**. 2 Mbps **3,57 → 2,24 s**.

En las diez comparaciones de perfil, la imagen del acceso pasó de 116 054 bytes transferidos a cero. La mediana del inicio del GET de estado bajó de **1 539 a 607 ms** a 5 Mbps y de **2 169 a 868 ms** a 2 Mbps, desde la primera petición. El LCP de la entrada pública, medida una vez por velocidad, pasó de 996 a 888 ms a 5 Mbps y de 1 312 a 1 380 ms a 2 Mbps. En el envío del login con llegada al dashboard hubo resultados mixtos. El coordinador de escuela pasó de 2,46 a 2,64 s a 2 Mbps.

La [línea base amplia](baseline.json) contiene 310 mediciones a 5 Mbps y registra los errores y omisiones. La [comparación inicial](browser-before.json) y la [comparación final](browser-after.json) contienen 32 mediciones cada una a las dos velocidades. La [matriz Playwright](browser-comparison.json) cruza las rutas inventariadas con la evidencia disponible. Falta completar las repeticiones y la comparación de recarga, navegación caliente y acción principal en todas las rutas. Con una muestra por caso, los números anteriores describen esas ejecuciones. La estimación de percentiles de campo requiere telemetría por dispositivo.

### Cambios medidos

- `frontend/index.html` limita la precarga temprana de la foto del acceso a las rutas que la muestran.
- `frontend/src/routes/ProtectedRoute.tsx` y `portalPages.ts` empiezan a descargar el módulo de la ruta mientras se carga el portal. Un enlace directo a un formulario inicia la bandeja y el formulario en paralelo.
- `frontend/src/services/apiAuthService.ts` y `frontend/src/components/layout/ApiBoundary.tsx` comparten la petición inicial de una sesión restaurada. La aplicación comprueba el token vigente antes de aplicar el resultado.
- `frontend/src/pages/coordinacion/CoordPadron.tsx` aplica 180 ms de espera entre pulsaciones, cancela las consultas reemplazadas y segmenta la clave de la caché por usuario, ámbito y periodo. En administración institucional, seis pulsaciones pasaron de seis GET completados a uno. La consulta sustituida se canceló en administración institucional y coordinación escolar. [Antes](remote-search-before.json) · [Después](remote-search-after.json)

## API, PostgreSQL y carga

Se probó reunir las lecturas de usuario y persona vinculada en un LEFT JOIN de EF Core. En PostgreSQL 18.6, el plan conservó los índices de emisor y sujeto y la clave primaria de Personas. Las lecturas separadas registraron 0,022 ms y 0,012 ms, con dos bloques compartidos cada una. El plan combinado registró 0,028 ms y cuatro bloques compartidos. La prueba de integración verificó dos comandos totales en `/api/access/me` con el candidato. [Planes y mediciones iniciales](backend-baseline.json) · [SQL reproducible](ActorPlans.sql)

Se retiró el candidato del código final. La medición HTTP por endpoint tuvo resultados mixtos. En k6, el p95 de las lecturas subió de **16,2 a 26,0 ms** en el pico y de **18,0 a 23,2 ms** en estrés. La prueba de estrés observó un máximo de 116 usuarios virtuales y completó 1 501 solicitudes en la referencia y 1 490 con el candidato. Las dos variantes registraron cero errores y quedaron dentro del presupuesto de API en las cinco etapas. El archivo del candidato conserva p50, p95, p99 y la verificación de persistencia. [Referencia](k6-before.json) · [Candidato SQL](k6-candidato-sql.json) · [Comparación HTTP](backend-candidato-sql.json)

La infraestructura de prueba reutilizó el servidor PostgreSQL local con esquemas distintos. Las rampas cortas observaron el comportamiento hasta la concurrencia indicada. La saturación, los locks bajo carga prolongada y la espera de pool quedaron sin verificar. El servidor tenía pg_stat_statements sin precargar y Windows denegó el acceso al EventPipe de la API, por lo que quedó pendiente recopilar sus contadores durante el ensayo.

### Decisiones sobre dependencias

- Se reutilizó TanStack Query para el padrón. La cancelación y la espera breve redujeron la secuencia medida sin sumar paquetes.
- La evidencia disponible mantiene las tablas paginadas y los componentes de gráficos existentes. La virtualización, Workers, una cola de exportación y una caché compartida requieren mediciones adicionales del volumen y coste de esas operaciones.
- Los índices existentes resolvieron las consultas de identidad medidas. La versión final de la aplicación conserva el esquema y las consultas de backend de la referencia.

## Verificación

- El gate local pasó sus siete chequeos, incluidos compilación, lint, formato y 330 pruebas unitarias. Las 157 pruebas de .NET pasaron contra PostgreSQL de pruebas.
- Playwright confirmó el guardado y la recuperación tras recarga del contacto y las preferencias. La configuración de pruebas admite un origen loopback aislado mediante TUTORIA_E2E_ORIGIN, con la API y la web detrás del mismo proxy de prueba.
- La suite Playwright de persistencia pasó sus dos escenarios con una semilla nueva. Comprobó que confirmar la asistencia habilita la evaluación, que la edición sobrevive a un conflicto de versión y a una desconexión, y que el envío se puede consultar desde otro navegador. También comprobó la preparación del Formato 01 por escuela y su registro en auditoría.

## Carga reproducible

Iniciar una API por variante con [Start-BenchmarkApi.ps1](Start-BenchmarkApi.ps1). El script de preparación usa las migraciones oficiales y agrega dos perfiles de prueba al esquema sintético. Conservar la misma semilla, duración y versión de las herramientas en ambos cambios. Ejecutar las mediciones de navegador y carga en ventanas separadas.

Desde la raíz del repositorio, definir TUTORIA_PERF_PASSWORD con la clave de la semilla de desarrollo y ejecutar el escenario. La opción Counters recoge métricas de .NET, ASP.NET Core y Npgsql si se dispone del ejecutable oficial. Los archivos temporales quedan en .runtime.

~~~powershell
pwsh -File scripts/performance/Measure-Load.ps1 -K6 <k6.exe> -Variant before -Port 5088 -StageSeconds 6
pwsh -File scripts/performance/Measure-Load.ps1 -K6 <k6.exe> -Variant after -Port 5089 -StageSeconds 6
~~~

El escenario reutiliza cinco cuentas sintéticas. Cada perfil intercala el estado tutorial y las lecturas de su dominio. La autenticación aparece al iniciar y en sesiones más largas. Una sexta tarea comprueba una actualización de preferencias por HTTP 204 y verifica la versión persistida con una lectura independiente. Los resultados conservan p50, p95, p99, los máximos observados y el número de muestras. Las etapas de pico y estrés prueban rampas cortas en el equipo local. Sus resultados describen ese equipo y ese volumen de datos.

## Presupuesto

- Carga fría útil a 5 Mbps con RTT de 150 ms. p50 de hasta 2,5 s y p95 de hasta 4 s.
- Carga fría útil a 2 Mbps con el mismo RTT. p50 de hasta 3,5 s y p95 de hasta 6 s.
- Navegación con datos vigentes. p50 de hasta 250 ms y p95 de hasta 700 ms. Con una nueva petición, p50 de hasta 600 ms y p95 de hasta 1,5 s.
- Lecturas interactivas de API sin RTT del navegador. p50 de hasta 150 ms, p95 de hasta 400 ms y p99 de hasta 1 s.
- Mutaciones interactivas confirmadas. p50 de hasta 800 ms, p95 de hasta 2 s y p99 de hasta 4 s.
- Core Web Vitals en p75 por dispositivo. LCP de hasta 2,5 s, INP de hasta 200 ms y CLS de hasta 0,10. Las muestras de laboratorio y la telemetría de usuarios se interpretan por separado. [Web Vitals](https://web.dev/articles/vitals)

## Despliegue gradual y reversión

1. Compilar las dos imágenes actuales de API y frontend en un entorno de preproducción. Conservar las versiones y sus etiquetas para la reversión. Validar con los cinco perfiles y con un volumen sintético representativo de las escuelas.
2. Mantener los assets con hash de la versión anterior durante la transición y comprobar la revalidación del HTML en el proxy que sirva el frontend. La publicación gradual depende de que la infraestructura permita dirigir tráfico a ambas versiones. [Vite](https://v8.vite.dev/guide/build)
3. Medir por perfil y tipo de operación los percentiles de API, errores, métricas de navegador, CPU, memoria, pausas GC, conexiones, espera de pool y locks. Comparar con una ventana equivalente de la versión anterior. Establecer capacidad de base antes de aumentar concurrencia.
4. Revertir si falla una comprobación de permisos o persistencia, si los errores nominales alcanzan 0,5 % o si dos ventanas comparables superan el presupuesto de p95/p99. Restaurar las imágenes anteriores y comprobar salud, acceso y guardado con una cuenta de prueba por perfil. La optimización de consulta usa el esquema existente.

## Referencias técnicas

- Carga diferida y límites de Suspense en [React 19.3](https://react.dev/reference/react/lazy).
- Cancelación y propagación de señales en [TanStack Query v5](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).
- Precarga condicional por media en el [estándar HTML](https://html.spec.whatwg.org/multipage/links.html#link-type-preload).
- Métricas [ASP.NET Core 10](https://learn.microsoft.com/en-us/aspnet/core/metrics/built-in?view=aspnetcore-10.0) y [Npgsql 10](https://www.npgsql.org/doc/diagnostics/metrics.html).
- Planes de ejecución y estadísticas en [PostgreSQL 18](https://www.postgresql.org/docs/18/sql-explain.html) y [pg_stat_statements](https://www.postgresql.org/docs/18/pgstatstatements.html).
- Emulación y umbrales en [Playwright CDP](https://playwright.dev/docs/api/class-cdpsession) y [k6](https://grafana.com/docs/k6/latest/using-k6/thresholds/).
