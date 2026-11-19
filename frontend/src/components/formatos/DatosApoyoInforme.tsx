import type { ConsolidacionInforme } from '../../services/informes';

export function DatosApoyoInforme({ datos }: { datos: ConsolidacionInforme }) {
  const fecha = new Date(datos.consultado);
  const consulta = Number.isNaN(fecha.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      }).format(fecha);
  const informes = datos.fuentes.filter((fuente) => fuente.formato === 'F02');
  return (
    <article className="fo-hoja ri-apoyo" aria-label="Datos de apoyo actuales">
      <header>
        <h2>Datos de apoyo actuales</h2>
        <p>
          Consulta: {consulta} · Semestre {datos.semestreId}
        </p>
        <p>Estos datos pueden cambiar y no modifican el contenido del informe presentado.</p>
      </header>
      <table className="fo-tabla">
        <caption>Actividad del periodo</caption>
        <tbody>
          <tr>
            <th scope="row">Estudiantes asignados</th>
            <td>{datos.estudiantesAsignados}</td>
          </tr>
          <tr>
            <th scope="row">Estudiantes atendidos</th>
            <td>{datos.atendidosUnicos}</td>
          </tr>
          <tr>
            <th scope="row">Sesiones individuales</th>
            <td>{datos.sesionesIndividuales}</td>
          </tr>
          <tr>
            <th scope="row">Sesiones grupales</th>
            <td>{datos.sesionesGrupales}</td>
          </tr>
          <tr>
            <th scope="row">Atenciones enviadas</th>
            <td>{datos.atencionesEnviadas}</td>
          </tr>
          {datos.formato === 'F01' && (
            <>
              <tr>
                <th scope="row">Tutores con asignaciones</th>
                <td>{datos.tutoresAsignados}</td>
              </tr>
              <tr>
                <th scope="row">Informes de tutor esperados</th>
                <td>{datos.informesEsperados}</td>
              </tr>
              <tr>
                <th scope="row">Informes de tutor enviados o aprobados</th>
                <td>{datos.informesEnviados}</td>
              </tr>
              <tr>
                <th scope="row">Informes de tutor aprobados</th>
                <td>{datos.informesAprobados}</td>
              </tr>
              <tr>
                <th scope="row">Tutores pendientes de envío</th>
                <td>{Math.max(0, datos.informesEsperados - datos.informesEnviados)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <section>
        <h3>Formatos enviados</h3>
        {datos.coberturaFormatos.some((formato) => formato.enviados > 0) ? (
          <table className="fo-tabla">
            <thead>
              <tr>
                <th scope="col">Formato</th>
                <th scope="col">Enviados o aprobados</th>
              </tr>
            </thead>
            <tbody>
              {datos.coberturaFormatos
                .filter((formato) => formato.enviados > 0)
                .map((formato) => (
                  <tr key={formato.formato}>
                    <td>{formato.formato}</td>
                    <td>{formato.enviados}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p>Aún no hay formatos enviados en este ámbito.</p>
        )}
      </section>
      {datos.formato === 'F01' && (
        <section>
          <h3>Informes de tutor consultados</h3>
          {informes.length ? (
            <table className="fo-tabla">
              <thead>
                <tr>
                  <th scope="col">Informe</th>
                  <th scope="col">Versión</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {informes.map((informe) => (
                  <tr key={informe.id}>
                    <td>{informe.id}</td>
                    <td>{informe.version}</td>
                    <td>{informe.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Sin informes de tutor disponibles.</p>
          )}
        </section>
      )}
    </article>
  );
}
