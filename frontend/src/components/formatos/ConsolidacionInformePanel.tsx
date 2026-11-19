import { useQuery } from '@tanstack/react-query';
import { consultarConsolidacion } from '../../services/informes';
import { Alert } from '../ui/Alert';

export function ConsolidacionInformePanel({
  id,
  version,
  onActualizar,
  actualizando = false,
}: {
  id: string;
  version: number;
  onActualizar?: () => void;
  actualizando?: boolean;
}) {
  const consulta = useQuery({
    queryKey: ['consolidacion-informe', id, version],
    queryFn: ({ signal }) => consultarConsolidacion(id, signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  if (consulta.isPending) return <p role="status">Consultando datos del informe…</p>;
  if (consulta.isError)
    return (
      <Alert tone="riesgo" title="No se pudieron consultar los datos">
        <button
          type="button"
          className="btn btn-falcon-default btn-sm"
          onClick={() => void consulta.refetch()}
        >
          Reintentar
        </button>
      </Alert>
    );
  const datos = consulta.data;
  const fecha = new Date(datos.consultado);
  const momento = Number.isNaN(fecha.getTime())
    ? ''
    : new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      }).format(fecha);
  return (
    <section className="informe-fuentes" aria-label="Datos actuales del periodo">
      <div className="informe-fuentes__cabecera">
        <h2>Actividad</h2>
        {onActualizar && (
          <button
            type="button"
            className="btn btn-link btn-sm"
            onClick={onActualizar}
            disabled={actualizando}
          >
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </button>
        )}
        <p className="informe-fuentes__nota">Datos actuales</p>
      </div>
      <dl className="informe-fuentes__cifras">
        <div>
          <dt>Estudiantes</dt>
          <dd>
            <strong>{datos.estudiantesAsignados}</strong> asignados
          </dd>
          <dd>{datos.atendidosUnicos} atendidos</dd>
        </div>
        <div>
          <dt>Sesiones</dt>
          <dd>
            <strong>{datos.sesionesIndividuales + datos.sesionesGrupales}</strong> realizadas
          </dd>
        </div>
        {datos.formato === 'F01' && (
          <div>
            <dt>Informes de tutor</dt>
            <dd>
              <strong>{datos.informesEnviados}</strong> enviados o aprobados
            </dd>
            <dd>
              {Math.max(0, datos.informesEsperados - datos.informesEnviados)}{' '}
              {datos.informesEsperados - datos.informesEnviados === 1 ? 'pendiente' : 'pendientes'}
            </dd>
          </div>
        )}
        {datos.formato !== 'F01' && (
          <div>
            <dt>Atenciones</dt>
            <dd>
              <strong>{datos.atencionesEnviadas}</strong> enviadas o aprobadas
            </dd>
          </div>
        )}
      </dl>
      <details className="informe-fuentes__detalles">
        <summary>Ver detalle</summary>
        <div className="informe-fuentes__contenido">
          <p>
            {momento && `Consulta ${momento}. `}Las cifras pueden cambiar; el informe enviado
            conserva su versión.
          </p>
          <p>
            Sesiones: {datos.sesionesIndividuales} individuales · {datos.sesionesGrupales} grupales.
          </p>
          {datos.formato === 'F01' && (
            <p>
              {datos.tutoresAsignados}{' '}
              {datos.tutoresAsignados === 1 ? 'tutor asignado' : 'tutores asignados'} ·{' '}
              {datos.informesAprobados}{' '}
              {datos.informesAprobados === 1 ? 'informe aprobado' : 'informes aprobados'} ·{' '}
              {datos.atencionesEnviadas}{' '}
              {datos.atencionesEnviadas === 1
                ? 'atención enviada o aprobada'
                : 'atenciones enviadas o aprobadas'}
            </p>
          )}
          {datos.formato === 'F01' && datos.fuentes.length > 0 && (
            <details>
              <summary>Informes de tutor incluidos ({datos.fuentes.length})</summary>
              <ul>
                {datos.fuentes.map((fuente) => (
                  <li key={fuente.id}>
                    {fuente.id} · versión {fuente.version} · {fuente.estado}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {datos.motivos.length > 0 && (
            <details>
              <summary>Motivos de atención registrados</summary>
              <ul>
                {datos.motivos.map((motivo) => (
                  <li key={motivo.motivo}>
                    {motivo.motivo}: {motivo.atenciones}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details>
            <summary>Formatos enviados</summary>
            {datos.coberturaFormatos.some((formato) => formato.enviados > 0) ? (
              <ul>
                {datos.coberturaFormatos
                  .filter((formato) => formato.enviados > 0)
                  .map((formato) => (
                    <li key={formato.formato}>
                      {formato.formato}: {formato.enviados} enviados o aprobados
                    </li>
                  ))}
              </ul>
            ) : (
              <p>Aún no hay formatos enviados en este ámbito.</p>
            )}
          </details>
          <details>
            <summary>Datos necesarios</summary>
            <p>
              {datos.formato === 'F01'
                ? 'Asignaciones y plan de la escuela, actividades con sus fechas y evidencias, e informes de los tutores. La comisión revisa y completa el informe.'
                : 'Asignaciones del tutor, sesiones realizadas con asistencia confirmada y atenciones registradas. El tutor revisa los resultados y completa sus observaciones.'}
            </p>
          </details>
        </div>
      </details>
    </section>
  );
}
