import { DirectorySearch } from '../../components/ui/DirectoryToolbar';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CompactPage } from '../../components/ui/CompactPage';
import { PageHeading } from '../../components/ui/PageHeading';
import { FormsFilters } from '../../components/ui/FormsPanel';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Sheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/StatusBadge';
import { definicionesFormato } from '../../data/formatos';
import { usePortal } from '../../hooks/usePortal';
import { normalizar } from '../../utils/busqueda';
import type { DefinicionFormato } from '../../types/domain';
import { useAuth } from '../../hooks/useAuth';
import { API_MODE } from '../../services/apiConfig';
import { FormatoEditor } from '../../components/formatos/editor/FormatoEditor';

export function CoordFormats() {
  const portal = usePortal();
  const { user } = useAuth();
  const [edicion, setEdicion] = useState<DefinicionFormato['codigo'] | null>(null);
  const puedeEditar = API_MODE && user?.adminInstitucional;
  const [actor, setActor] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [detalle, setDetalle] = useState<DefinicionFormato | null>(null);
  const actores = [
    { id: 'todos', nombre: 'Todos' },
    { id: 'tutorado', nombre: 'Estudiante' },
    { id: 'tutor', nombre: 'Docente' },
    { id: 'equipo-tutores', nombre: 'Comisión' },
  ];
  const visibles = definicionesFormato.filter(
    (f) =>
      (actor === 'todos' || f.actor === actor) &&
      normalizar(
        `${f.codigo} ${f.numero} ${f.nombre} ${f.actorEtiqueta} ${f.periodicidad}`,
      ).includes(normalizar(buscar)),
  );
  return (
    <CompactPage>
      <PageHeading
        eyebrow="Coordinación"
        title="Formularios de tutoría"
        actions={
          <Link className="btn btn-falcon-default" to="/coordinacion/campos">
            Preguntas y reglas
          </Link>
        }
      />
      <FormsFilters
        label="Filtrar formularios"
        options={actores.map((a) => ({
          ...a,
          cantidad: definicionesFormato.filter((f) => a.id === 'todos' || f.actor === a.id).length,
        }))}
        value={actor}
        onChange={setActor}
        acciones={<DirectorySearch value={buscar} onChange={setBuscar} label="Buscar formulario" />}
      />
      <Card>
        {visibles.length ? (
          <ul className="compact-list" aria-label="Formularios de tutoría">
            {visibles.map((f) => (
              <li key={f.codigo}>
                <button
                  type="button"
                  className="compact-list__row"
                  aria-label={`${puedeEditar ? 'Editar' : 'Ver'} formato ${f.numero}`}
                  onClick={() => (puedeEditar ? setEdicion(f.codigo) : setDetalle(f))}
                >
                  <span className="compact-code">{f.numero}</span>
                  <span className="compact-list__body">
                    <strong>{f.nombre}</strong>
                    <small>
                      {f.actorEtiqueta} ·{' '}
                      {f.secciones.reduce((total, s) => total + s.campos.length, 0)} preguntas
                    </small>
                  </span>
                  <span className="compact-list__end">
                    <i
                      className={`fa-solid ${puedeEditar ? 'fa-pen-to-square' : 'fa-arrow-right'}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin coincidencias" description="Prueba otra búsqueda o perfil." />
        )}
      </Card>
      {detalle && (
        <Sheet
          title={`Formato ${detalle.numero} · ${detalle.nombre}`}
          onClose={() => setDetalle(null)}
          className="sheet--instrumento"
          footer={
            puedeEditar && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setEdicion(detalle.codigo);
                  setDetalle(null);
                }}
              >
                <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> Editar formulario
              </button>
            )
          }
        >
          <div className="stack">
            <p>{detalle.proposito}</p>
            <dl className="compact-detail-list">
              {[
                ['Responsable', detalle.actorEtiqueta],
                ['Cuándo', detalle.momento],
                ['Periodicidad', detalle.periodicidad],
                ['Destinatario', detalle.destinatario],
                ['Aplicación', detalle.obligatorio ? 'Obligatorio' : 'Opcional'],
                ['Firmas', detalle.visaciones.join(' · ')],
                ['Vigencia', detalle.vigencia],
                ['Versión y aprobación', `${detalle.version} · ${detalle.aprobacion}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <Badge tone="info">
              {portal.instrumentos.filter((i) => i.formato === detalle.codigo).length} registros
            </Badge>
            {detalle.secciones.map((s) => (
              <details className="compact-disclosure" key={s.titulo}>
                <summary>
                  {s.titulo} · {s.campos.length} preguntas
                </summary>
                <ul className="compact-list">
                  {s.campos.map((c) => (
                    <li key={c.codigo}>
                      <div className="compact-list__row">
                        <span className="compact-list__body">
                          <strong>
                            {c.etiqueta}
                            {c.obligatorio ? ' *' : ''}
                          </strong>
                          <small>{c.opciones?.join(' · ') || c.ayuda || c.tipo}</small>
                          {c.columnas && (
                            <small>{c.columnas.map((col) => col.etiqueta).join(' · ')}</small>
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </Sheet>
      )}
      {edicion && <FormatoEditor codigo={edicion} onClose={() => setEdicion(null)} />}
    </CompactPage>
  );
}
