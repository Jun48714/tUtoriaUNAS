import { Link, useNavigate, useParams } from 'react-router-dom';
import { GuidedInstrumentForm } from '../../components/panels/GuidedInstrumentForm';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageLoading } from '../../components/ui/PageLoading';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ArrowLeft } from '../../components/ui/icons';
import { useAuth } from '../../hooks/useAuth';
import { usePortal } from '../../hooks/usePortal';
import { useInstrumentWorkspace } from '../../hooks/useInstrumentWorkspace';
import { API_MODE } from '../../services/apiConfig';
import { snapshotApi } from '../../services/apiTutoria';
import { persistirFormulario } from '../../services/mutacionesTutoria';
import { definicionPorCodigo } from '../../data/formatos';
import { formatFecha } from '../../utils/fechas';
import { bloqueoEvaluacion, esEvaluacionSesion } from '../../utils/evaluacionesSesion';
import { clasificarFormulario } from '../../utils/formulariosEstudiante';
import '../../styles/student-forms.css';

function Volver() {
  return (
    <Link className="sf-volver" to="/estudiante/instrumentos">
      <ArrowLeft aria-hidden="true" /> Mis formularios
    </Link>
  );
}

/** Responder (o consultar) un formulario en su propia página, sin ventanas superpuestas. */
export function StudentInstrumentFill() {
  const { instrumentoId = '' } = useParams();
  const { user } = useAuth();
  const portal = usePortal();
  const workspace = useInstrumentWorkspace();
  const navegar = useNavigate();
  const registro = portal.instrumentos.find((r) => r.id === instrumentoId);
  const definicion = registro
    ? (registro.definicion ?? definicionPorCodigo(registro.formato))
    : undefined;

  if (!registro || !definicion || !user) {
    // En modo API los formularios llegan después del primer pintado.
    if (API_MODE && !snapshotApi().datos && !workspace.aviso) return <PageLoading />;
    return (
      <div className="sf-pagina sf-llenado">
        <Volver />
        <EmptyState
          title="No encontramos este formulario"
          description="Puede que ya no esté disponible para tu cuenta. Revisa tus formularios vigentes."
          action={
            <Link className="btn btn-falcon-default" to="/estudiante/instrumentos">
              Ver mis formularios
            </Link>
          }
        />
      </div>
    );
  }

  const { sesion, disponibilidad } = clasificarFormulario(
    registro,
    portal.sesiones,
    workspace.momento,
  );
  const evaluacion = esEvaluacionSesion(registro.formato);
  const editable =
    registro.estudianteId === user.id &&
    (disponibilidad === 'responder' || disponibilidad === 'corregir');
  const bloqueo =
    evaluacion && !editable && disponibilidad !== 'enviado'
      ? bloqueoEvaluacion(sesion, user.id)
      : null;
  const observaciones = registro.observaciones.filter((o) => o.estado === 'abierta');
  const titulo = evaluacion
    ? `Evaluación de la tutoría ${registro.formato === 'F10' ? 'individual' : 'grupal'}`
    : registro.formato === 'F04'
      ? 'Entrevista de seguimiento'
      : registro.formato === 'F05'
        ? 'Entrevista de cierre'
        : 'Entrevista de ingreso';
  const contexto = evaluacion
    ? sesion
      ? `${sesion.tema} · ${formatFecha(sesion.fecha)} · ${sesion.horaInicio}–${sesion.horaFin}`
      : 'Sesión no disponible'
    : `Formato ${definicion.numero} · ${registro.semestreId}`;

  const guardar = async (respuestas: Record<string, string>, enviar: boolean, version?: number) => {
    const guardado = await persistirFormulario(registro, respuestas, user, enviar, version);
    return guardado;
  };

  return (
    <div className="sf-pagina sf-llenado">
      <Volver />
      <header className="sf-cabecera">
        <div className="sf-cabecera__texto">
          <h1>{(definicion.revision ?? 1) > 1 ? definicion.nombre : titulo}</h1>
          <p className="sf-cabecera__contexto">{contexto}</p>
        </div>
        <StatusBadge estado={registro.estado} contexto="formulario" />
      </header>

      {observaciones.length > 0 && (
        <Alert tone="alerta" title="Tu tutor pidió estos cambios">
          {observaciones.map((o) => (
            <span className="d-block" key={o.id}>
              {o.texto}
            </span>
          ))}
        </Alert>
      )}
      {bloqueo && (
        <Alert tone="info" title="Aún no puedes responder">
          {bloqueo} Mientras tanto, puedes ver las preguntas.
        </Alert>
      )}

      <div className="sf-hoja">
        <GuidedInstrumentForm
          key={registro.id}
          definicion={definicion}
          instrumento={registro}
          editable={editable}
          puedeEnviar={editable}
          mostrarFormato={false}
          onFinalizar={() => navegar('/estudiante/instrumentos', { replace: true })}
          onGuardar={editable ? guardar : undefined}
        />
      </div>
    </div>
  );
}
