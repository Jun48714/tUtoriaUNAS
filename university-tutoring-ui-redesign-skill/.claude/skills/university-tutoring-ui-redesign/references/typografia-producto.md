# SGT — Dirección tipográfica y anti-plantilla de IA

## Alcance y fuentes de referencia

Inspirarse en **principios**, no en una copia de pantallas o activos de marca:

- **YouTube:** marca YouTube Sans para display/titulares en parte de su identidad, Roboto documentado como texto del sistema/cuerpo. La lección aplicable es separar **títulos de fuerte lectura** de **información secundaria altamente escaneable**, no que su UI actual use una sola fuente en todas las superficies. Fuente: https://design.google/library/youtube-sans-font
- **Apple:** SF Pro es su fuente de sistema; enseña jerarquía semántica, variaciones de peso, legibilidad, adaptación al tamaño de texto, uso moderado de familias, detalle en tracking. Para un frontend web multiplataforma preferir `system-ui`/`ui-sans-serif` o una licencia abierta apropiada; no redistribuir archivos SF Pro. Fuentes: https://developer.apple.com/design/human-interface-guidelines/typography y https://developer.apple.com/documentation/technologyoverviews/fonts
- **Facebook:** su *brand design* utiliza Facebook Sans, un diseño personalizado; esto NO prueba que toda la interfaz use Facebook Sans. La lección es una narrativa tipográfica con identidad, espacios de lectura y una estructura familiar. Fuente: https://www.meta.com/design-at-meta/blog/building-a-brand-identity-for-the-worlds-largest-community/

**No usar logos ajenos, no instalar fuentes propietarias, no afirmar que se ha reproducido con exactitud el sistema de diseño de una marca.** Las propuestas son interpretaciones para un sistema administrativo universitario.

## Escala recomendada para una UI de escritorio (punto de partida, no regla fija)

| Rol semántico | Ejemplo SGT | Tamaño CSS | Peso | Line-height | Tracking sugerido |
|---|---|---|---|---|---|
| `page-title` | Seguimiento tutorial | 28–32px | 650–750 | 1.15–1.25 | -0.02em a -0.035em |
| `page-subtitle` | Consulta el estado de las tutorías… | 14–16px | 400–450 | 1.5–1.6 | normal |
| `section-title` | Sesiones recientes | 18–22px | 600–700 | 1.2–1.35 | -0.01em a -0.02em |
| `subsection-title` | Filtros | 15–17px | 600–650 | 1.35 | -0.01em |
| `body` | Explicación / contenido | 14–16px | 400–500 | 1.45–1.65 | normal |
| `nav` | Estudiantes | 14px | 500–650 | 1.3–1.45 | normal |
| `table-head` | Estado / Fecha | 12–14px | 600–700 | 1.35–1.45 | normal |
| `table-cell` | Seguimiento individual | 13–14px | 400–550 | 1.45–1.55 | normal |
| `field-label` | Fecha de sesión | 13–14px | 550–650 | 1.4 | normal |
| `button` | Registrar tutoría | 13–15px | 600–700 | 1.2–1.35 | normal |
| `metadata` | Actualizado hace 2 h | 12–13px | 400–500 | 1.4–1.5 | normal |
| `kpi-value` | 128 | 28–36px | 650–760 | 1.0–1.15 | -0.03em |
| `helper/error` | Completa este campo | 12–14px | 450–550 | 1.4–1.5 | normal |

**Accesibilidad:** no reducir texto importante a 10–11px solo por estética; tamaños en `rem`, zoom 200% sin pérdida de función, texto de contraste adecuado, pesos distinguibles, `tabular-nums` en datos numéricos cuando la fuente lo permita. Ajustar escala según tamaño real del layout y densidad. Si los usuarios exigen comodidad, 16px para cuerpo; nunca dejar microtexto esencial por debajo de una medida cómoda.

## Ejemplos de tres sistemas tipográficos propios

### Sistema A: «Precision / Apple-inspired»

- `font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
- Título 30px / 700 / -0.03em; subtítulo 15px / 400; sección 20px / 650; cuerpo 14–15px / 400; tabla 14px / 450.
- Jerarquía a través de espacios medidos, contraste tonal, paneles discretos, subrayados o indicadores mínimos. No llenes todo de tarjetas redondeadas.

### Sistema B: «Signal / YouTube-inspired»

- Fuente de UI abierta sugerida: `Roboto, 'Arial', sans-serif`, si está instalada/licenciada; titular puede emplear **Manrope**, abierta, si justificado y disponible.
- Título 30px / 750; subtítulo 14px / 400; sección 18px / 700; cuerpo 14px / 450; metadatos 12px / 450. Navegación directa y alta escaneabilidad.
- Regla: título del registro arriba, estado/fecha/disciplina debajo; la atención debe recaer en la tarea, no en una decoración.

### Sistema C: «Community / Facebook-inspired»

- Fuente sugerida: `Inter, system-ui, sans-serif`, si disponible/licenciada; alternativa `system-ui`.
- Título 28px / 720; subtítulo 15px / 450; sección 18px / 650; cuerpo 14–15px; metadatos 12–13px. Elementos de uso frecuente reconocibles, filtros claros y acciones familiares.
- No copiar el feed de Facebook para todas las tablas; reservar módulos tipo actividad para información cronológica, manteniendo tabla cuando es mejor para comparación.

### Sistema D: «Editorial / Universidad»

- `Manrope` o `Plus Jakarta Sans` para título y sistema abierto neutro para UI (máximo 2 familias). Título 31px / 700; sección 19px / 650; cuerpo 14–15px / 400.
- Estructura con cabeceras de sección marcadas, divisores finos, tono académico moderno y densidad operativa.

**Precaución:** estas no son afirmaciones sobre qué fuentes usan actualmente YouTube/Facebook/Apple. Son direcciones de diseño propias inspiradas en principios públicos.

## Reglas contra el aspecto «dashboard genérico IA»

- No copiar el mismo layout cambiando cuatro colores; comparar propuestas mediante navegación, proporción de columnas, superficie, títulos, densidad y tratamiento de tablas.
- No aplicar gradientes a cada superficie, no usar cian+violeta por defecto sin razón ni sombras profundas en toda tarjeta.
- No utilizar 4 bloques KPI gigantes para ocupar espacio cuando la tarea principal es gestionar listas y expedientes.
- No usar ilustraciones 3D aleatorias, glassmorphism, tipografía solo en negrita, títulos oversized en formularios, botones flotantes sin contexto.
- Reservar acento a CTA o momentos críticos; separar color semántico de branding y de decoración.
- Diseñar primero **una pantalla de trabajo real** con datos representativos sintéticos; asegurar identidad y estados antes de multiplicar componentes.
- Cada variación debe declarar cuál es su **idea compositiva distinta** (por ejemplo, sidebar jerárquico vs navegación superior con filtros vs panel maestro-detalle vs workspace editorial compacto).
- Diferenciar estados normal/hover/focus/disabled, usar área táctil suficiente, y evitar texto truncado sin mecanismo de consulta.

## Entregables para comparar propuestas

Para cada propuesta 0–D: **muestra real de textos** (mismo contenido y roles), ejemplos visuales de módulo, ficha de tipo, tabla de colores 60/30/10, razón para el layout y 3–6 modificaciones sustantivas. La propuesta 0 debe usar fuentes y colores reales del repositorio: no adivinar. En HTML conceptual, rotular claramente que se trata de una referencia y no del frontend real.
