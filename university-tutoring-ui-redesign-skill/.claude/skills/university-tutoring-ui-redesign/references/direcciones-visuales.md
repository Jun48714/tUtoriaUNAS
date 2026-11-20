# Direcciones visuales y tipográficas de referencia para SGT

Son **conceptos, no auditorías del frontend**. La Propuesta 0 usa exclusivamente colores/tipos del proyecto real. Las propuestas A–D deben personalizarse tras estudiar la plataforma. El archivo `assets/preview-paletas.html` es una galería **conceptual incluida en la skill**, no una captura del SGT.

El 60/30/10 indica **peso visual aproximado** (base/estructura/acento); los tokens de estado y texto se definen adicionalmente.

## Propuesta 0 — Evolución del sistema actual, más colorido y mejor tipografiado

- Colores reales de base (60%), secundaria (30%) y acento (10%): **extraer del frontend**. No adivinar.
- Fuentes reales, pesos y estilos: **extraer del frontend**. Conservar rasgos reconocibles que aportan identidad; corregir jerarquía, legibilidad e inconsistencias.
- Layout: evolucionar navegación, formularios, tablas y paneles de datos sin cambiar flujos.
- Enriquecer 4–6 puntos de color de manera moderada; demostrar **antes/después** en la misma pantalla.

## A — Precisión serena (principios Apple)

| Rol | HEX | Uso |
|---|---|---|
| Base 60% | `#F6F8FB` | Fondo ordenado y con aire |
| Estructura 30% | `#264461` | Navegación/encabezados clave |
| Acento 10% | `#2CAA9B` | Foco y CTA selecto |
| Texto | `#1A2B38` | Titulares y lectura |
| Superficie | `#FFFFFF` | Área principal |

- Tipo: `system-ui`; titular 30/700, sección 20/650, cuerpo 15/400, tablas 14 aprox.
- Layout: navegación lateral delgada, fondo claro, métricas integradas y divisores precisos; no todo son tarjetas.
- Referencia de principio: jerarquía y precisión de Apple; **sin redistribuir SF Pro**.

## B — Señal y ritmo (principios YouTube)

| Rol | HEX | Uso |
|---|---|---|
| Base 60% | `#FBFAF7` | Fondo cálido tranquilo |
| Estructura 30% | `#253E55` | Sidebar y navegación |
| Acento 10% | `#EE6B42` | Acción focalizada |
| Texto | `#1A2B38` | Jerarquía directa |
| Superficie | `#FFFFFF` | Lista de tareas y datos |

- Tipo: `Roboto`/`Arial`/sistema (según disponibilidad); titular 30/750, sección 18/700 y metadatos 12/450.
- Layout: panel de tareas y lista escaneable, textos principales arriba, metadatos abajo, próximo paso de un vistazo.
- Referencia de principio: distinción display/body que Google documentó; **sin redistribuir YouTube Sans**.

## C — Conexión útil (principios Facebook)

| Rol | HEX | Uso |
|---|---|---|
| Base 60% | `#F0F5FB` | Fondo claro ligeramente azulado |
| Estructura 30% | `#25638A` | Navegación y jerarquía |
| Acento 10% | `#19A8A1` | Estado activo y acción focal |
| Texto | `#1A2B38` | Lectura y títulos |
| Superficie | `#FFFFFF` | Actividad/controles |

- Tipo: `Inter`/`system-ui`; titular 28/720, sección 18/650, cuerpo 15/450.
- Layout: barra superior y panel de movimientos con seguimiento contextual; mantiene tabla para comparar datos y feed solo para cronología.
- Referencia de principio: claridad del contenido y estructura reconocible; **sin copiar la app ni Facebook Sans**.

## D — Editorial institucional propia

| Rol | HEX | Uso |
|---|---|---|
| Base 60% | `#FAF9F3` | Fondo papel cálido |
| Estructura 30% | `#245847` | Barra superior / agrupadores |
| Acento 10% | `#D89329` | Líneas editoriales y CTA |
| Texto | `#1A2B38` | Lectura |
| Superficie | `#FFFFFF` | Registros y formularios |

- Tipo: `Manrope`/`system-ui`; titular 31/700, sección 19/650, cuerpo 15/400.
- Layout: barra horizontal, encabezado editorial, métricas integradas y tareas por prioridad; evita un bloque de cuatro KPI genéricos.
- Identidad propia adaptada a institución académica.

## Obligaciones para TODAS las propuestas

1. No bastan cuatro colores: debe haber **ideas de composición, navegación y tipografía diferentes**.
2. Cada una debe verse un poco más colorida que el diseño original, con tonos medidos y un balance accesible.
3. Mostrar «título de página, subtítulo, sección, texto, etiqueta, dato en tabla, microtexto, botón» en pantalla y como ficha.
4. Justificar cuándo una lista, tabla, formulario, modal, vista maestro-detalle o panel de actividad es el patrón correcto para esa tarea.
5. Usar la misma pantalla representativa y datos sintéticos al comparar; reportar limitaciones si no se ha abierto el frontend real.
6. No usar fuentes propietarias ni publicar contenido confidencial de alumnos o docentes.
7. Contrastar UI en escritorio, móvil, zoom 200% y estados loading/empty/error. Ver `references/typografia-producto.md` y `references/control-calidad.md`.
