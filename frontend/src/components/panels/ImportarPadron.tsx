import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Sheet } from '../ui/Sheet';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/StatusBadge';
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  Download,
  FileSpreadsheet,
  GraduationCap,
  LoaderCircle,
  Presentation,
  Users,
} from '../ui/icons';
import { ApiError } from '../../services/apiClient';
import {
  analizarPadron,
  confirmarPadron,
  csvExcluidas,
  type FilaExcluida,
  type ResultadoImportacion,
  type VistaPreviaPadron,
} from '../../services/padronImportacion';
import '../../styles/padron-import.css';

type Fase = 'inicio' | 'leyendo' | 'revision' | 'guardando' | 'listo';
const MAX_BYTES = 30_000_000;
const MAX_FILAS_VISIBLES = 200;
const numero = (valor: number) => valor.toLocaleString('es-PE');
const tamano = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;

function mensaje(causa: unknown) {
  if (causa instanceof ApiError) return causa.message;
  return causa instanceof Error ? causa.message : 'No se pudo completar la operación.';
}

function IconoNube() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="padron-import__cloud">
      <path
        d="M20 46a12 12 0 0 1-1.6-23.9A15 15 0 0 1 47.3 24 11 11 0 0 1 46 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 52V32m0 0-7 7m7-7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cifra({
  icono,
  valor,
  titulo,
  nota,
}: {
  icono: ReactNode;
  valor: number;
  titulo: string;
  nota?: string;
}) {
  return (
    <li className="padron-import__tile">
      <span className="padron-import__tile-icon" aria-hidden="true">
        {icono}
      </span>
      <span className="padron-import__tile-value">{numero(valor)}</span>
      <span className="padron-import__tile-label">{titulo}</span>
      {nota && <span className="padron-import__tile-note">{nota}</span>}
    </li>
  );
}

/**
 * Importación del padrón en dos pasos: primero se sube el Excel y se muestra qué se va a importar
 * (sin guardar nada); recién al confirmar se escribe en la base de datos, todo o nada.
 */
export function ImportarPadron({ onClose, onImportado }: { onClose(): void; onImportado(): void }) {
  const [fase, setFase] = useState<Fase>('inicio');
  const [vista, setVista] = useState<VistaPreviaPadron | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [hoja, setHoja] = useState<'todas' | FilaExcluida['hoja']>('todas');
  const ocupado = fase === 'leyendo' || fase === 'guardando';

  async function leer(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.xlsx'))
      return setError('Elige un libro de Excel con extensión .xlsx.');
    if (archivo.size > MAX_BYTES) return setError('El archivo supera los 30 MB.');
    setError('');
    setFase('leyendo');
    try {
      setVista(await analizarPadron(archivo));
      setFase('revision');
    } catch (causa) {
      setError(mensaje(causa));
      setFase('inicio');
    }
  }

  async function guardar() {
    if (!vista) return;
    setError('');
    setFase('guardando');
    try {
      setResultado(await confirmarPadron(vista.token));
      setFase('listo');
      onImportado();
    } catch (causa) {
      setError(mensaje(causa));
      setFase('revision');
    }
  }

  function soltar(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault();
    setArrastrando(false);
    void leer(evento.dataTransfer.files[0]);
  }

  function descargarExcluidas() {
    if (!vista) return;
    const url = URL.createObjectURL(
      new Blob([csvExcluidas(vista.excluidas)], { type: 'text/csv;charset=utf-8' }),
    );
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'filas-no-importadas.csv';
    enlace.click();
    URL.revokeObjectURL(url);
  }

  const excluidas = vista?.excluidas.filter((f) => hoja === 'todas' || f.hoja === hoja) ?? [];
  const total = vista ? vista.alumnos.importables + vista.docentes.importables : 0;

  const pie =
    fase === 'revision' && vista ? (
      <>
        <button
          type="button"
          className="btn btn-falcon-default"
          onClick={() => {
            setVista(null);
            setFase('inicio');
          }}
        >
          Elegir otro archivo
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void guardar()}>
          <Check aria-hidden="true" /> Importar{' '}
          {[
            vista.alumnos.importables > 0 && `${numero(vista.alumnos.importables)} alumnos`,
            vista.docentes.importables > 0 && `${numero(vista.docentes.importables)} docentes`,
          ]
            .filter(Boolean)
            .join(' y ')}
        </button>
      </>
    ) : fase === 'listo' ? (
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Ver el padrón
      </button>
    ) : fase === 'inicio' ? (
      <button type="button" className="btn btn-falcon-default" onClick={onClose}>
        Cancelar
      </button>
    ) : undefined;

  return (
    <Sheet
      className="sheet--importar-padron"
      wide
      title="Importar padrón"
      description="Alumnos con sus horarios y docentes activos, desde el Excel de registros."
      onClose={() => !ocupado && onClose()}
      footer={pie}
    >
      <div className="padron-import">
        {error && (
          <Alert tone="riesgo" title="No se pudo continuar">
            {error}
          </Alert>
        )}

        {fase === 'inicio' && (
          <>
            <label
              className={`padron-import__drop${arrastrando ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={soltar}
            >
              <input
                type="file"
                className="padron-import__input"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  void leer(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <IconoNube />
              <strong>Arrastra aquí el Excel del padrón</strong>
              <span>o haz clic para elegirlo desde tu equipo</span>
              <small>Libro de Excel (.xlsx) de hasta 30 MB</small>
              <span className="btn btn-falcon-default padron-import__pick">Elegir archivo</span>
            </label>
            <div className="padron-import__sheets">
              <article>
                <span className="padron-import__sheet-icon" aria-hidden="true">
                  <GraduationCap />
                </span>
                <div>
                  <h3>Hoja de alumnos</h3>
                  <p>
                    Código, apellidos, nombres, escuela, correo, celular, PPA y TCA; con sus cursos,
                    aulas y horarios del ciclo.
                  </p>
                </div>
              </article>
              <article>
                <span className="padron-import__sheet-icon" aria-hidden="true">
                  <Presentation />
                </span>
                <div>
                  <h3>Hoja de docentes</h3>
                  <p>
                    Apellido paterno, materno, nombres, correo y departamento académico. Una fila
                    que diga «NO SE DEFINE», o con algún dato vacío o raro, no se importa.
                  </p>
                </div>
              </article>
            </div>
            <p className="padron-import__safe">
              <BadgeCheck aria-hidden="true" /> Primero verás un resumen; no se guarda nada hasta
              que confirmes. Importar no crea cuentas ni contraseñas, y repetir el mismo archivo no
              duplica datos.
            </p>
          </>
        )}

        {(fase === 'leyendo' || fase === 'guardando') && (
          <div className="padron-import__busy" role="status" aria-live="polite">
            <LoaderCircle className="padron-import__spin" aria-hidden="true" />
            <strong>
              {fase === 'leyendo'
                ? 'Leyendo y revisando el archivo…'
                : 'Guardando en la base de datos…'}
            </strong>
            <span>
              {fase === 'leyendo'
                ? 'Se comprueba cada fila de alumnos y docentes. Toma unos segundos.'
                : 'Es una sola operación: si algo falla, no se guarda nada. No cierres esta ventana.'}
            </span>
            <span className="padron-import__bar" aria-hidden="true" />
          </div>
        )}

        {fase === 'revision' && vista && (
          <>
            <header className="padron-import__file">
              <span className="padron-import__file-icon" aria-hidden="true">
                <FileSpreadsheet />
              </span>
              <div>
                <strong>{vista.archivo}</strong>
                <small>
                  {tamano(vista.tamano)} · revisado en{' '}
                  {vista.segundosLectura.toLocaleString('es-PE')} s
                </small>
              </div>
              <Badge tone="info">Semestre {vista.semestre}</Badge>
              {vista.yaImportado && <Badge tone="alerta">Ya importado antes</Badge>}
            </header>

            {vista.yaImportado && (
              <Alert tone="alerta" title="Este archivo ya se importó">
                Volver a importarlo no duplica nada: solo actualiza lo que haya cambiado.
              </Alert>
            )}

            <ul className="padron-import__tiles" aria-label="Qué se importará">
              <Cifra
                icono={<GraduationCap />}
                valor={vista.alumnos.importables}
                titulo="Alumnos"
                nota={`${numero(vista.alumnos.nuevos)} nuevos · ${numero(vista.alumnos.actualizados)} ya estaban`}
              />
              <Cifra
                icono={<Presentation />}
                valor={vista.docentes.importables}
                titulo="Docentes"
                nota={`${numero(vista.docentes.nuevos)} nuevos · ${numero(vista.docentes.actualizados)} ya estaban`}
              />
              <Cifra
                icono={<Users />}
                valor={vista.cursosMatriculados}
                titulo="Cursos matriculados"
                nota={`${numero(vista.cursos)} cursos distintos`}
              />
              <Cifra
                icono={<CalendarClock />}
                valor={vista.horarios}
                titulo="Bloques de horario"
                nota={
                  vista.horariosSinNormalizar > 0
                    ? `${numero(vista.horariosSinNormalizar)} sin hora interpretable`
                    : 'Todos interpretados'
                }
              />
              <Cifra
                icono={<Building2 />}
                valor={vista.escuelas.length}
                titulo="Escuelas"
                nota={`${numero(vista.escuelas.filter((e) => e.nueva).length)} nuevas en el catálogo`}
              />
            </ul>

            <div className="padron-import__checks">
              {vista.hojas.alumnos && (
                <section className={vista.alumnos.filasExcluidas ? 'is-warn' : 'is-ok'}>
                  <h3>
                    <Check aria-hidden="true" /> Hoja de alumnos
                  </h3>
                  <p>
                    <strong>{numero(vista.alumnos.filas)}</strong> filas leídas ·{' '}
                    <strong>{numero(vista.alumnos.importables)}</strong> alumnos distintos.{' '}
                    {vista.alumnos.filasExcluidas
                      ? `${numero(vista.alumnos.filasExcluidas)} filas no se importan.`
                      : 'Todas las filas tienen datos para importarse.'}
                  </p>
                  <small>
                    {numero(vista.alumnos.sinPpa)} sin PPA/TCA · {numero(vista.alumnos.sinCelular)}{' '}
                    sin celular (se guardan como «Sin informar»).
                  </small>
                </section>
              )}
              {vista.hojas.docentes && (
                <section className={vista.docentes.excluidos ? 'is-warn' : 'is-ok'}>
                  <h3>
                    <Check aria-hidden="true" /> Hoja de docentes
                  </h3>
                  <p>
                    <strong>{numero(vista.docentes.filas)}</strong> filas leídas ·{' '}
                    <strong>{numero(vista.docentes.importables)}</strong> docentes con los cinco
                    datos.{' '}
                    {vista.docentes.excluidos
                      ? `${numero(vista.docentes.excluidos)} filas dicen «NO SE DEFINE» o les falta algún dato, y no se importan.`
                      : 'Todas las filas están completas.'}
                  </p>
                </section>
              )}
            </div>

            <section className="padron-import__schools" aria-label="Escuelas del archivo">
              <h3>Alumnos por escuela</h3>
              <ul>
                {vista.escuelas.map((e) => (
                  <li key={e.id}>
                    <span>{e.nombre}</span>
                    <b>{numero(e.alumnos)}</b>
                    {e.nueva && <Badge tone="info">Nueva</Badge>}
                  </li>
                ))}
              </ul>
            </section>

            {vista.advertencias.length > 0 && (
              <Alert tone="alerta" title="Para tu revisión">
                {vista.advertencias.join(' ')}
              </Alert>
            )}

            {vista.totalExcluidas > 0 && (
              <details className="padron-import__excluded">
                <summary>
                  Filas que no se importan <b>{numero(vista.totalExcluidas)}</b>
                </summary>
                <div className="padron-import__excluded-bar">
                  <label>
                    Hoja
                    <select
                      className="select"
                      value={hoja}
                      onChange={(e) => setHoja(e.target.value as typeof hoja)}
                    >
                      <option value="todas">Todas</option>
                      <option value="Alumnos">Alumnos</option>
                      <option value="Docentes">Docentes</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-falcon-default btn-sm"
                    onClick={descargarExcluidas}
                  >
                    <Download aria-hidden="true" /> Descargar lista (CSV)
                  </button>
                </div>
                <div className="padron-import__table app-scroll" tabIndex={0}>
                  <table>
                    <caption className="sr-only">
                      Filas del Excel que no se importan y su motivo
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Hoja</th>
                        <th scope="col">Fila</th>
                        <th scope="col">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excluidas.slice(0, MAX_FILAS_VISIBLES).map((f) => (
                        <tr key={`${f.hoja}-${f.fila}`}>
                          <td>{f.hoja}</td>
                          <td className="mono">{f.fila}</td>
                          <td>{f.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(excluidas.length > MAX_FILAS_VISIBLES ||
                  vista.excluidas.length < vista.totalExcluidas) && (
                  <small className="muted">
                    Se muestran {numero(Math.min(MAX_FILAS_VISIBLES, excluidas.length))} de{' '}
                    {numero(excluidas.length)}; el CSV las incluye todas.
                    {vista.excluidas.length < vista.totalExcluidas &&
                      ` El detalle llega hasta ${numero(vista.excluidas.length)} de ${numero(vista.totalExcluidas)} filas.`}
                  </small>
                )}
              </details>
            )}
            <p className="padron-import__total" role="status">
              Se guardarán <b>{numero(total)}</b> personas, sus matrículas y horarios del{' '}
              <b>{vista.semestre}</b>.
            </p>
          </>
        )}

        {fase === 'listo' && resultado && (
          <div className="padron-import__done" role="status" aria-live="polite">
            <span className="padron-import__done-icon" aria-hidden="true">
              <Check />
            </span>
            <h3>Importación completada</h3>
            <p>
              Todo quedó guardado en la base de datos en{' '}
              {resultado.segundos.toLocaleString('es-PE')} segundos.
            </p>
            <ul>
              <li>
                <b>{numero(resultado.alumnos)}</b> alumnos
              </li>
              <li>
                <b>{numero(resultado.docentes)}</b> docentes
              </li>
              <li>
                <b>{numero(resultado.matriculas)}</b> matrículas
              </li>
              <li>
                <b>{numero(resultado.horarios)}</b> bloques de horario
                {resultado.horariosRetirados > 0 &&
                  ` (${numero(resultado.horariosRetirados)} antiguos retirados)`}
              </li>
              <li>
                <b>{numero(resultado.cursos)}</b> cursos
              </li>
              <li>
                <b>{numero(resultado.escuelas)}</b> escuelas
              </li>
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
