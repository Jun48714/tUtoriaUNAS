# Inventario de rendimiento de Tutoría UNAS

Corte local del 27 de noviembre de 2026. Base inspeccionada: `c22fc213cb6a88cfca13650985ac3e13aeb5752e`. Este inventario estático relaciona las rutas, sus fuentes de datos, sus acciones y los endpoints usados por el navegador. La ejecución y los tiempos se registran en las mediciones y pruebas de la auditoría.

## Roles, ámbitos y reglas de acceso

- **Estudiante (`estudiante`)**: portal propio, expediente propio, instrumentos que le corresponden, sesiones donde participa, avisos, perfil y preferencias.
- **Docente tutor (`tutor`)**: estudiantes asignados, formularios, sesiones, asistencias, solicitudes de apoyo, reportes y avisos de su alcance.
- **Docente designado coordinador de escuela (`tutor` con `coordinadorEscuela`)**: conserva el portal de tutor y agrega cuatro pantallas de monitoreo escolar de solo lectura.
- **Coordinación (`coordinacion`)**: administra los recursos habilitados para su escuela.
- **Administración institucional (`coordinacion` con `adminInstitucional`)**: usa las mismas rutas de coordinación, con elección de organización completa o escuela activa. El modo institucional admite consultas y algunas acciones globales, como importación y edición de formatos. Otras escrituras exigen resolver la escuela.

El router contiene **46 patrones privados que renderizan pantallas**, incluidos dos detalles de entidad y cuatro vistas de monitoreo. Hay otros **8 patrones privados de redirección** y **7 patrones públicos o de sistema**. `ProtectedRoute` comprueba la sesión y el rol en el cliente. `SoloCoordinadorEscuela` protege el módulo de monitoreo. `TutoriaContext.Actor` valida la identidad vigente, versión de acceso, persona activa, escuela y permisos que luego exigen los servicios y controladores. La aplicación limpia el almacén de estado y la caché de consultas al salir y comprueba sesión y ámbito cuando llega una respuesta HTTP.

Fuentes [router y guardas](../../frontend/src/routes/AppRoutes.tsx), [roles del frontend](../../frontend/src/types/auth.ts), [roles del backend](../../backend/TutoriaUNAS.Api/Configuration/RoleNames.cs), [contexto del actor](../../backend/TutoriaUNAS.Api/Services/TutoriaContext.cs), [cliente HTTP](../../frontend/src/services/apiClient.ts).

## Datos comunes a las rutas privadas

Todas las pantallas privadas en modo API pasan por `ApiBoundary`, que espera a `GET /api/tutoria/estado`. En el ingreso se usa `?inicio=true`. El administrador puede solicitar `ambitoEscuela` o `ambitoInstitucional`. El contrato entrega identidad, periodo, personas, asignaciones, matrículas, horarios, sesiones, registros, precargas, datos de sistema e historial según rol y ámbito. El navbar y el menú también dependen de datos compartidos. La revalidación visible intenta usar ETag cada 15 s y al recuperar el foco, con protección de 2 s para eventos repetidos. El modo demo usa los datos y la persistencia locales seleccionados al compilar.

En la matriz, **estado común** significa ese GET con alcance del servidor. Los endpoints adicionales se listan donde se activan, incluso si se difieren hasta abrir una ficha, panel o acción. El prefijo de las rutas del navegador aparece en el título de cada grupo.

Fuentes [ApiBoundary](../../frontend/src/components/layout/ApiBoundary.tsx), [almacén de estado](../../frontend/src/services/apiTutoria.ts), [servicio en el backend](../../backend/TutoriaUNAS.Api/Services/EstadoTutoriaService.cs), [modo API/demo](../../frontend/src/services/apiConfig.ts).

## Rutas públicas y de sistema

- `/` — sesión restaurada o anónima. Redirige al dashboard del rol o a `/login`.
- `/login` — usuario, contraseña, opción de persistencia de la sesión. `POST /api/auth/login` y después el GET de estado inicial en API. Puede redirigir a activar una cuenta.
- `/recuperar-clave` — verificación de correo y recuperación con código.
- `/crear-cuenta` — registro mediante correo y código.
- `/verificar-cuenta` — activación y contraseña según estado de cuenta. El conjunto de los tres flujos usa `GET /api/auth/capacidades` y `POST /api/auth/{correo/validar,codigo,codigo/confirmar,cuenta/completar}` según el paso y el modo.
- `/no-autorizado`, `*` — salida para acceso de otro rol y rutas inexistentes, respectivamente. Sin endpoint propio.

Fuentes [páginas públicas](../../frontend/src/pages/auth), [servicio de cuentas](../../frontend/src/services/cuentas.ts), [autenticación](../../frontend/src/services/apiAuthService.ts), [verificación en backend](../../backend/TutoriaUNAS.Api/Controllers/VerificacionCuentaController.cs).

## Estudiante · /estudiante

- `dashboard` — estado común de tutor, alertas, pendientes, sesiones e instrumentos. Consulta indicadores, filtros de fechas y datos de gráficas.
- `sesiones` — sesiones y resultados propios del estado común. Abre agenda, historial (`?vista=historial`), detalle y enlace a evaluación.
- `tutor` — asignación, docente, contacto y solicitudes propias. `POST /api/sistema/solicitudes-cambio` solicita cambio de tutor.
- `instrumentos` — lista instrumentos y evaluaciones propios, incluidos `?estado=pendiente|enviado` y `?sesion=`. Filtra y abre un instrumento; el detalle anidado `instrumentos/:instrumentoId` carga respuestas, definición, precarga y versión desde el estado. `PUT /api/formularios/{id}` guarda borrador o envía la respuesta.
- `expediente` — matrícula, avance y resumen académico propio del estado común. Consulta el detalle de estudios.
- `derivaciones` — estado comunicable e historial de solicitudes propias. Filtra todas o `?estado=seguimiento` y abre detalle.
- `salud` — datos de salud comunicables, campañas e inscripciones del estado común. `POST` y `DELETE /api/sistema/campanas/{id}/inscripcion` para la acción disponible.
- `documentos` — instrumentos e historial autorizado, más fichas derivadas del estado. Previsualiza y descarga desde el cliente.
- `avisos` — avisos y estado de lectura propios. Abre, filtra y marca mediante `PUT /api/sistema/notificaciones/lectura`.
- `perfil` — identidad y contacto. `PUT /api/sistema/perfil` guarda campos de contacto.
- `preferencias` — ajustes propios y versión. `PUT /api/sistema/preferencias` guarda los cambios.
- Alias: `/estudiante` → dashboard y `calendario` → sesiones.

Fuentes [páginas de estudiante](../../frontend/src/pages/estudiante), [páginas comunes](../../frontend/src/pages/comun), [mutaciones de sistema](../../frontend/src/services/apiSistema.ts).

## Tutor · /tutor

- `dashboard` — estado común de estudiantes asignados, sesiones, instrumentos, revisiones y avisos. Consulta y filtra indicadores, agenda próxima y gráficas.
- `tutorados` — asignaciones y personas del estado. Busca, filtra y abre `tutorados/:estudianteId`, donde consulta matrícula, horarios, instrumentos, asistencia y trayectoria autorizada; enlaces a filtros de instrumentos y programación.
- `sesiones` — agenda, historial (`?vista=historial`), detalle, programación (`?accion=programar&estudiante=`) y estado de sesión. `POST /api/sesiones/disponibilidad` consulta cruces por semana/estudiantes, `POST /api/sesiones` programa y `PUT /api/sistema/sesiones/{id}/estado` actualiza el estado.
- `asistencias` — sesiones, asistentes e instrumentos relacionados. Abre `?sesion=`, confirma asistencia y evidencia mediante `PUT /api/sesiones/{id}/asistencia`; `GET /api/sesiones/{id}/evidencia` descarga evidencia guardada cuando está disponible.
- `derivaciones` — lista y detalle de solicitudes, áreas, prioridad y seguimiento (`?estado=seguimiento`). En API, la creación abre el formulario F12 de instrumentos. En demo, abre el formulario de la bandeja.
- `instrumentos` — bandejas de formularios propios y de estudiantes (`?ambito=propios|estudiantes`), búsqueda e historial. Parámetros `estado`, `estudiante`, `sesion`, `registro`, `crear=F08|F12`. `POST /api/formularios`, `PUT /api/formularios/{id}` y `POST /api/formularios/{id}/revision` para creación, guardado/envío y revisión, según el caso.
- `reportes` — asignaciones, instrumentos, asistencia, sesiones y derivaciones del ámbito. Aplica filtros y exporta CSV en el cliente.
- `avisos` — notificaciones, destinatarios permitidos, mensajes y borradores. `PUT /api/sistema/notificaciones/lectura` y `POST|PUT|DELETE /api/sistema/mensajes[/{id}]` según permiso.
- `perfil`, `preferencias` — contacto y pantalla. `PUT /api/sistema/perfil` y `PUT /api/sistema/preferencias`.
- Alias: `/tutor` → dashboard y `calendario`, `horario` → sesiones.

Fuentes [páginas de tutor](../../frontend/src/pages/tutor), [bandeja de instrumentos](../../frontend/src/components/panels/TutoringWorkspace.tsx), [cliente de formularios y sesiones](../../frontend/src/services/apiTutoria.ts).

### Monitoreo del coordinador de escuela

- `monitoreo` — avance de estudiantes, docentes, ciclos y resultados. Filtra y consulta detalle.
- `monitoreo/sesiones` — agenda e historial de sesiones de la escuela, con filtros.
- `monitoreo/formatos` — avance, versión visible y detalle de formatos. Admite `?formato=&doc=`.
- `monitoreo/derivaciones` — seguimiento, áreas y estados comunicables de solicitudes en su escuela.

Las cuatro rutas añaden `GET /api/monitoreo/escuela` con la misma consulta de TanStack Query, 30 s de frescura y abortado al desmontar si queda sin observadores. El backend también admite el endpoint para administración institucional dentro de una escuela elegida. No hay una ruta equivalente de administración en el router.

Fuentes [páginas de monitoreo](../../frontend/src/pages/monitoreo), [consulta](../../frontend/src/hooks/useMonitoreo.ts), [control de acceso y lecturas SQL](../../backend/TutoriaUNAS.Api/Services/MonitoreoService.cs).

## Coordinación y administración institucional · /coordinacion

- `dashboard` — estado común de escuela o institución, periodo, sesiones, asignaciones, instrumentos y estado de importación. Consulta métricas y gráficas por periodo/tutor.
- `sesiones` — agenda, historial (`?vista=historial`) y detalle de sesiones del ámbito. Usa el estado común.
- `asignaciones` — estudiantes, docentes, matrículas y asignaciones del ámbito. Búsqueda, filtros, paginación, asignación y resolución de solicitudes. `POST /api/tutoria/asignaciones` y `PUT /api/sistema/solicitudes-cambio/{id}`.
- `tutores` — directorio y asignaciones de docentes, con búsqueda, filtros, paginación y detalle. Alta autorizada y búsqueda de candidatos mediante el módulo de cuentas.
- `tutorados` — directorio de estudiantes, matrícula, ciclo y tutor asignado. Búsqueda, filtros, paginación, detalle y alta de cuenta donde se autoriza. Ficha bajo demanda mediante `GET /api/padron/{id}` cuando el modo y registro lo admiten.
- `padron` — hojas de estudiantes/docentes (`?hoja=docentes`), búsqueda y paginación. `GET /api/padron?tipo=&buscar=&escuelaId=&pagina=`, `GET /api/padron/{id}` para detalle. Importación institucional con `POST /api/padron/importar/{analizar,confirmar}`.
- `plan` — periodos, actividades y formulario F01. Gestiona actividades (`POST /api/sistema/plan`, `PUT|DELETE /api/sistema/plan/{id}`) y registra F01 (`POST /api/formularios`, `PUT /api/formularios/{id}`) según rol, escuela, fase y permiso. El selector de etapa llama a `PUT /api/tutoria/periodo`.
- `revisiones` — informes y pendientes, detalle, revisión, propuesta, consolidación y seguimiento. `GET /api/formularios/{id}/{propuesta,consolidacion}`, `POST /api/formularios/{id}/revision`, `PUT /api/sistema/derivaciones/{id}`.
- `reportes` — agregaciones de sesiones, formatos, asignaciones y seguimiento desde el estado común. Filtra y exporta CSV en el cliente.
- `exportar` — formatos terminados, expedientes y cierre. Previsualización, selección múltiple y PDF mediante impresión del navegador.
- `avisos` — mensajes, destinatarios y notificaciones del ámbito. Lectura y redacción mediante los endpoints de avisos y mensajes del tutor, con los permisos de coordinación.
- `instrumentos` — catálogo de formatos y detalle. El editor institucional solicita `GET /api/formatos/{codigo}/editor`, publica con `POST /api/formatos/{codigo}/publicar` y consulta la versión seleccionada con `GET /api/formatos/{codigo}/versiones/{revision}`.
- `campos` — preguntas y reglas de los catálogos locales. Búsqueda, ficha y CSV local.
- `permisos` — matriz de perfiles; `?tab=cuentas` en API abre gestión de cuentas. `GET|POST /api/cuentas`, `GET /api/cuentas/candidatos`, `POST /api/cuentas/{id}/temporal`, `PUT /api/cuentas/{id}/{estado,vinculacion,coordinador-escuela}` cuando corresponda.
- `integraciones` — fuentes, pendientes de insumos y detalle. `PUT /api/sistema/insumos/{id}` actualiza la respuesta del insumo autorizado.
- `semestres` — calendario académico, periodo y configuración. Edita fechas mediante `PUT /api/sistema/periodo`.
- `auditoria` — `GET /api/tutoria/auditoria`, consulta y recarga explícita del historial acotado por el servidor. Filtros, detalle y CSV en el cliente según el modo disponible.
- `perfil`, `preferencias` — contacto y pantalla mediante `PUT /api/sistema/perfil` y `PUT /api/sistema/preferencias`.
- Alias: `/coordinacion` → dashboard y `calendario`, `horarios` → sesiones.

Fuentes [páginas de coordinación](../../frontend/src/pages/coordinacion), [gestión de coordinación](../../frontend/src/components/panels/GestionCoordinacion.tsx), [controladores de API](../../backend/TutoriaUNAS.Api/Controllers).

## Dependencias y carga

- Las versiones que declara el manifiesto son React y React DOM **19.3.0**, React Router **7.18.4**, TanStack Query **5.104.2**, React Hook Form **7.90.0**, Vite **8.3.4** y Playwright **1.64.0**. Vite separa React/router, TanStack y formularios. El proveedor de TanStack vive en el shell autenticado.
- La ruta de acceso es import estático. El shell privado, las pantallas secundarias de acceso y las vistas privadas usan imports dinámicos. El registro de precarga deduplica la descarga de cada módulo y el menú espera 80 ms en hover, cancela al salir y respeta `saveData`.
- Al enviar el formulario de acceso, el código inspeccionado solicita el shell, los tres dashboards y ECharts. El archivo fuente de ECharts tiene **559 448 bytes sin comprimir**. La transferencia real depende de la compresión, el perfil de red y el orden de solicitudes. ECharts es un archivo local servido como recurso, cargado por las gráficas del portal.
- El build genera recursos por ruta y por grupos definidos en Vite. El archivo de acceso usa código y CSS propios y fotos AVIF responsivas; el portal agrega tema, iconos y JetBrains Mono. El estado común se carga en diferido desde la autenticación.
- El padrón pagina a 25 filas en el servidor. Los directorios alimentados por el estado aplican paginación local donde está activada. Los reportes CSV y el PDF de formatos utilizan lógica de navegador. No se identificó un Worker, una librería de virtualización ni una cola de exportaciones utilizada por esas rutas.

Fuentes [manifiesto](../../frontend/package.json), [configuración de Vite](../../frontend/vite.config.ts), [registro de rutas privadas](../../frontend/src/routes/portalPages.ts), [menú](../../frontend/src/components/navigation/Sidebar.tsx), [gráficas](../../frontend/src/components/ui/PortalCharts.tsx), [padrón](../../backend/TutoriaUNAS.Api/Controllers/PadronController.cs).

## Patrones que corresponde contrastar con medición

- Un acceso profundo monta primero el shell y espera el estado antes de que `ApiBoundary` entregue la pantalla diferida. Confirmar los tiempos de inicio del GET y de los chunks del shell, ruta y detalle. La precarga existente solo solicita el hijo al señalar un detalle de instrumentos del estudiante.
- En padrón y candidatos de cuentas la búsqueda usa `useDeferredValue`, que difiere el render pero no fija un intervalo de debounce. Ambos fetches y el detalle de padrón omiten la señal de TanStack en el código inspeccionado. Comparar requests por secuencia de escritura y tiempos de respuesta visible antes de cambiar.
- `refrescarApi` descarta respuestas por sesión y revisión. La revalidación sigue construyendo el estado desde el servidor antes de poder comparar una etiqueta de contenido. Cuantificar trabajo de un 304, descargas de 200 y concurrencia primero.
- Las mutaciones de contacto, preferencias y lectura aplican los datos confirmados por el servidor al recibirlos, y luego el servicio espera un GET de estado. Medir por separado persistencia confirmada, feedback y actualización de datos derivados.
- El estado de inicio mezcla dominios. Identificar qué campos consume cada pantalla con el ámbito, volumen sintético, bytes y planes SQL observados. Los catálogos o rutas que ya tengan una carga ligera no justifican por sí solos una separación de endpoints.

La lista refleja pantallas accesibles desde el router y navegación condicional observada. `/api/access/me`, `/api/demo/overview`, `/api/status` y las APIs de calendario antiguo, de borrador del editor y de consulta/borrado directo de un formulario constan en el servidor, con distinta finalidad o sin una vista conectada en el router actual. El listado de código no acredita sesiones, operaciones ni accesos en producción. La medición de rutas parametrizadas requiere un registro sintético válido y una prueba funcional para cada variante significativa.
