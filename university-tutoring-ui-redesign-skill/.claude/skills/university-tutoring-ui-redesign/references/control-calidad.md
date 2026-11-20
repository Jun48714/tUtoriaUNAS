# Control de calidad del rediseño SGT

## Antes

- [ ] Stack y convenciones inspeccionadas, sin conjeturas.
- [ ] Estado Git revisado; no se pisan cambios ajenos.
- [ ] Inventario de pantallas, roles y flujos real del repositorio.
- [ ] Mapa de tokens y colores originales con rutas de código.
- [ ] Captura base o evidencia visual equivalente si es posible.
- [ ] Se decide entre evolución actual y alternativas con aprobación o instrucción explícita.

## Durante

- [ ] Los tokens están centralizados; la semántica no depende de HEX crudos desperdigados.
- [ ] Se preservan los componentes interactivos, props, llamadas y accesos por roles.
- [ ] No se implementaron pantallas ficticias como rutas de producción.
- [ ] Densidad de tablas y formularios responde a necesidades operativas reales.
- [ ] Estados hover/focus/active/disabled/loading/error/empty son visibles y consistentes.
- [ ] Elementos gráficos apoyan la información, no la ocultan.
- [ ] Los porcentajes 60/30/10 se aplican al peso visual, no a cada componente.
- [ ] Tanto la evolución del diseño actual como cada alternativa son visiblemente **un poco más coloridas**, sin perder identidad ni legibilidad.
- [ ] Hay enriquecimiento cromático en 4–6 puntos útiles de la vista, no solamente en botones o navegación.
- [ ] Se comparó antes/después y se verificó que no hubo sobresaturación ni confusión con colores semánticos.
- [ ] No se añadieron dependencias prescindibles.

## Después

- [ ] Revisión de diffs: sin rutas, APIs, modelos, permisos ni comportamientos alterados por accidente.
- [ ] Ejecutar pruebas/build/lint/typecheck que el repositorio disponga; reportar cuáles realmente se ejecutaron.
- [ ] Comprobar contrastes efectivos: texto normal ≥4.5:1, grande ≥3:1 y componentes UI esenciales ≥3:1 según WCAG 2.2 AA.
- [ ] Foco teclado visible, orden lógico de tabulación, etiquetas y mensajes de validación.
- [ ] Comprobar estados y operaciones aplicables: modales, filtros, tablas, formularios, archivos, paginación, navegación y roles.
- [ ] Comprobar vistas alrededor de 360/390, 768, 1024 y 1440 px y zoom 200% cuando haya navegador.
- [ ] No aparecen barras de scroll inesperadas, elementos superpuestos, texto truncado sin alternativa ni botones fuera de viewport.
- [ ] Capturas comparativas reales, si se dispone de navegador, distinguen claramente “antes” y “después”.
- [ ] Resumen de archivos modificados, tests realmente ejecutados, bloqueos y reversión.

## Errores que invalidan una entrega

1. Rediseñar sin revisar componentes reales, afirmar colores HEX actuales inventados o presentar un mockup como captura de producción.
2. Reemplazar flujos con datos ficticios, romper seguridad/permisos o suprimir validaciones por estética.
3. Cambiar paleta global cuando el usuario solo pidió comparar propuestas.
4. Usar acentos en todos los elementos y perder jerarquía visual.
5. Sobre-escribir cambios ajenos; afirmar que tests pasaron sin ejecutarlos.

## Fuentes normativas

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- Roles UX/UI/WAI: https://www.w3.org/WAI/planning/arrm/roles/
