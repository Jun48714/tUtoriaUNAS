import { Link, useNavigate, useParams } from 'react-router-dom';
import { GuidedInstrumentForm } from '../../components/panels/GuidedInstrumentForm';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageLoading } from '../../components/ui/PageLoading';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Sheet } from '../../components/ui/Sheet';
import { useAuth } from '../../hooks/useAuth';
import { usePortal } from '../../hooks/usePortal';
import { useInstrumentWorkspace } from '../../hooks/useInstrumentWorkspace';
import { API_MODE } from '../../services/apiConfig';
import { snapshotApi } from '../../services/apiTutoria';
import { persistirFormulario } from '../../services/mutacionesTutoria';
import { definicionPorCodigo } from '../../data/formatos';
import { bloqueoEvaluacion, esEvaluacionSesion } from '../../utils/evaluacionesSesion';
import { clasificarFormulario } from '../../utils/formulariosEstudiante';
import '../../styles/student-forms.css';

/** El enlace directo abre el formulario sobre la bandeja del estudiante. */
export function StudentInstrumentFill() {
  const { instrumentoId = '' } = useParams();
  const { user } = useAuth();
  const portal = usePortal();
  const workspace = useInstrumentWorkspace();
  const navegar = useNavigate();
  const cerrar = () => navegar('/estudiante/instrumentos', { replace: true });
  const registro = portal.instrumentos.find((r) => r.id === instrumentoId);
  const definicion = registro
    ? (registro.definicion ?? definicionPorCodigo(registro.formato))
    : undefined;

  if (!registro || !definicion || !user) {
    // En modo API los formularios llegan después del primer pintado.
    if (API_MODE && !snapshotApi().datos && !workspace.aviso) return <PageLoading />;
    return (
      <Sheet title="Formulario no disponible" className="sheet--instrumento" onClose={cerrar}>
        <EmptyState
          title="No encontramos este formulario"
          description="Puede que ya no esté disponible para tu cuenta. Revisa tus formularios vigentes."
          action={
            <Link className="btn btn-falcon-default" to="/estudiante/instrumentos">
              Ver mis formularios
            </Link>
          }
        />
      </Sheet>
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
    ? (sesion?.tema ?? 'Sesión no disponible')
    : `Formato ${definicion.numero} · ${registro.semestreId}`;

  const guardar = async (respuestas: Record<string, string>, enviar: boolean, version?: number) => {
    const guardado = await persistirFormulario(registro, respuestas, user, enviar, version);
    return guardado;
  };

  return (
    <Sheet
      title={(definicion.revision ?? 1) > 1 ? definicion.nombre : titulo}
      description={contexto}
      className="sheet--instrumento sf-llenado"
      onClose={cerrar}
    >
      <div className="ui-row">
        <StatusBadge estado={registro.estado} contexto="formulario" />
      </div>

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

      <GuidedInstrumentForm
        key={registro.id}
        definicion={definicion}
        instrumento={registro}
        editable={editable}
        puedeEnviar={editable}
        mostrarFormato={false}
        onFinalizar={cerrar}
        onGuardar={editable ? guardar : undefined}
      />
    </Sheet>
  );
}
