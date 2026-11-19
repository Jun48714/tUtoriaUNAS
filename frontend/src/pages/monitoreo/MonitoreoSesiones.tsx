import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SessionCalendar } from '../../components/panels/SessionCalendar';
import { Sheet } from '../../components/ui/Sheet';
import { MonitoreoMarco } from './MonitoreoMarco';
import { formatFechaLarga } from '../../utils/fechas';
import type { Sesion } from '../../types/domain';

export function MonitoreoSesiones() {
  const [docente, setDocente] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  return (
    <MonitoreoMarco vista="sesiones">
      {(datos, ayudas) => {
        const sesiones: Sesion[] = datos.sesiones
          .filter((s) => !docente || s.tutorId === docente)
          .map((s) => ({
            ...s,
            tema: s.tipo === 'grupal' ? 'Tutoría grupal' : 'Tutoría individual',
            lugar: '',
          }));
        const detalle = sesiones.find((s) => s.id === detalleId);
        return (
          <div className="stack">
            <div className="ui-row ui-row--between ui-row--wrap">
              <label className="field">
                <span>Docente tutor</span>
                <select
                  className="select"
                  value={docente}
                  onChange={(e) => setDocente(e.target.value)}
                >
                  <option value="">Todos los docentes de mi escuela</option>
                  {datos.docentes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {ayudas.nombreDocente(d.id)}
                    </option>
                  ))}
                </select>
              </label>
              <Link to="/tutor/sesiones?accion=programar" className="btn btn-primary">
                Programar mi sesión
              </Link>
            </div>
            <SessionCalendar
              sesiones={sesiones}
              compact
              resolverTutor={ayudas.nombreDocente}
              onAbrir={(s) => setDetalleId(s.id)}
            />
            {detalle && (
              <Sheet
                title={detalle.tema}
                description={formatFechaLarga(detalle.fecha)}
                onClose={() => setDetalleId(null)}
              >
                <dl className="meta-list">
                  <div>
                    <dt>Docente tutor</dt>
                    <dd>{ayudas.nombreDocente(detalle.tutorId)}</dd>
                  </div>
                  <div>
                    <dt>Horario</dt>
                    <dd>
                      {detalle.horaInicio}–{detalle.horaFin}
                    </dd>
                  </div>
                  <div>
                    <dt>Modalidad</dt>
                    <dd>{detalle.modalidad}</dd>
                  </div>
                  <div>
                    <dt>Convocados</dt>
                    <dd>{detalle.totalConvocados ?? detalle.asistentes.length}</dd>
                  </div>
                </dl>
              </Sheet>
            )}
          </div>
        );
      }}
    </MonitoreoMarco>
  );
}
