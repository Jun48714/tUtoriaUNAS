# AGENTS.md — Reglas de trabajo de `tutoria-unas`

> Este archivo lo mantiene el **Lead de QA**. Léelo antes de editar. Aplica a cualquier agente
> que trabaje en este repositorio (incluido Codex).

## 1. Quién escribe qué (zonas exclusivas)

| Zona | Dueño | Regla |
| --- | --- | --- |
| `frontend/src/**`, `frontend/public/**`, `frontend/*.json`, `frontend/*.ts`, `backend/**`, `scripts/**` | **Codex (constructor)** | Único autor. Puede crear/reescribir libremente. |
| `tools/qa/**`, `docs/QA/**`, `artifacts/qa/**`, `AGENTS.md` | **Equipo QA** (Lead, qa-runtime, qa-datos, qa-ui) | Codex no los edita; solo los lee y ejecuta. |
| `docs/MIGRACION.md`, `docs/VALIDACION.md`, `README.md` | Codex | Actualizar cuando el estado cambie de verdad. |

El equipo QA **no corrige** `frontend/src/**`: verifica, mide y escribe pedidos en
`docs/QA/PEDIDOS-A-CODEX.md`. Si un arreglo urgente debe hacerse en `frontend/src/**`, lo
coordina el Lead para que no haya dos escritores en el mismo archivo.

## 2. Reglas duras (no negociables)

1. **El árbol nunca se queda sin compilar.** Prohibido dejar imports a archivos inexistentes.
   Si se declaran rutas antes que las páginas (`src/routes/AppRoutes.tsx`), en el mismo turno
   se crean **todos** los archivos referenciados, aunque su contenido inicial sea mínimo real
   (encabezado + estados vacíos). *Hoy hay 33 imports rotos y por eso `/login` no renderiza:
   el grafo de Vite falla antes de montar React. Es el bug crítico abierto.*
2. **Iconografía de librería, jamás dibujada.** Todos los iconos de UI provienen de
   Font Awesome 6.5.1 ya vendorizado (`src/assets/vendor/fontawesome.min.css` +
   `src/assets/webfonts`). Prohibido un segundo set de iconos: **`lucide-react` debe salir** de
   `src/data/navegacion.ts` (hoy líneas 1–35 y 148–158) y de `frontend/package.json`.
   Los SVG botánicos del login son decorativos y están aprobados.
3. **Tipografía:** solo Manrope (variable) y JetBrains Mono, servidas localmente con
   `@fontsource`. Nada de Google Fonts, nada de familias nuevas.
4. **Datos ficticios y trazables.** Nunca datos reales de personas. Los instrumentos,
   formatos, roles y plazos deben corresponder a la **Resolución Nº 500-2022-CU-R-UNAS** y a
   los formatos **01–12** que exige, y cubrir las 9 solicitudes de datos (Gestión Pedagógica,
   DIAA, Facultades/Escuelas, RRHH, TI, Bienestar/Servicio Social, Medicina, Psicología,
   Psicopedagogía).
5. **Sin dependencias nuevas** sin pedirlo al Lead; el lockfile está fijado.
6. **No borrar** `login-unas/`, `docs/`, `tools/qa/`, `artifacts/qa/`, `backend/`.

## 3. Definición de terminado (pedido del usuario)

Cada rol debe entrar a un portal **específico y propio**, no genérico ni feo:

- **Sidebar** con grupos, contadores dinámicos, estado activo, versión móvil (drawer), teclado
  y `Escape`, `aria-*` correctos.
- **Responsive real** en 320 / 375 / 390 / 768 / 1024 / 1440 px, sin desbordamiento horizontal.
- **Calendario** funcional (sesiones, hitos, agenda del tutor) y no decorativo.
- **Correo/avisos**: bandeja, redacción, plantillas, destinatarios y estados (ficticios).
- **Seguimiento al SIS**, consultas médicas, y derivaciones a salud / psicología /
  psicopedagogía / bienestar, con datos ficticios listos para sustituir por la API que el
  usuario integrará aparte.
- **Instrumentos 01–12** con código, periodicidad, responsable y destinatario.
- Estados **vacío / carga / error / observado**, foco visible, `aria-label`, textos en es-PE.
- Tipografía, espaciado y componentes consistentes, reutilizando `src/components/ui`.

## 4. Verificación obligatoria antes de decir "listo"

Node y pnpm **no están en PATH**. Usa rutas absolutas:

```
node = C:\Users\UNAS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
pnpm = C:\Users\UNAS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs
```

Desde `tutoria-unas\frontend`:

```powershell
& $node $pnpm run build          # tsc -b + vite build
& $node $pnpm run lint           # eslint --max-warnings 0
& $node $pnpm run test           # vitest run
& $node $pnpm run format:check   # prettier --check
```

Gate del equipo QA (cuando el árbol compile):

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\UNAS\Downloads\Tutoria\tutoria-unas\tools\qa\gate.ps1
```

Deja el resultado en `docs/QA/last-gate.json`.

**Regla de oro:** no se anuncia avance con el build roto. Si el build falla, el siguiente paso
es arreglarlo, no agregar más pantallas.

## 5. Coordinación

- Los pedidos de QA hacia el constructor viven en `docs/QA/PEDIDOS-A-CODEX.md`. El Lead los
  crea y actualiza; Codex **no** edita ese archivo, solo lo lee y corrige el código.
- Cada pedido tiene id (`P-01`, `P-02`, …), severidad, evidencia reproducible y criterio de
  cierre. Un pedido se cierra cuando el criterio de cierre se ejecuta y pasa.

## 6. Reglas del usuario (vigentes para todo agente)

1. **Leer primero.** Cada sesión y cada llamada empieza leyendo `CLAUDE.md` y `AGENTS.md`. No se ejecuta ni se cambia nada antes de eso.
2. **Alcance.** Solo se edita dentro de la carpeta `~/tutoria`. Prohibido editar cualquier archivo fuera de ella.
3. **Flujo de publicación.** Primero edita y verifica en local. Publica cambios en GitHub solo si el usuario lo solicita expresamente.
4. **Sin código basura.** No agregar código muerto, duplicado, archivos sobrantes ni versiones paralelas. Si la lógica ya existe, se edita esa lógica.
5. **Reutilizar el frontend.** Seguir los patrones y componentes existentes (`src/components/ui`). En elementos repetidos, extraer un componente reutilizable en lugar de copiar. Prohibido usar el frontend de forma distinta a lo establecido.
6. **Buenas prácticas de ingeniería.** Código legible, nombres claros, sin duplicación, con estados y errores manejados explícitamente.
7. **Comentarios.** Prohibido escribir comentarios que expliquen lo obvio o que describan el código como malo. Solo se comenta el porqué cuando no es evidente.
8. **Datos personales.** No publicar ni subir datos personales de estudiantes o docentes. Antes de cualquier subida a GitHub, se verifica que no existan.
9. **Ejecución local.** Inicia y completa las tareas solicitadas sin pedir confirmación adicional por cada etapa.
