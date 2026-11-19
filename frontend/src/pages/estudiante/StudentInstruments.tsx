import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/ui/PageHeading';
import { FormsFilters } from '../../components/ui/FormsPanel';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { CircleCheck } from '../../components/ui/icons';
import { StudentFormsPanel } from '../../components/panels/StudentFormsPanel';
import { filtroFormulario, filtrosFormularios } from '../../utils/filtrosFormularios';
import { usePortal } from '../../hooks/usePortal';
import { useInstrumentWorkspace } from '../../hooks/useInstrumentWorkspace';
import { semestreActual } from '../../data/catalogos';
import { esEvaluacionSesion } from '../../utils/evaluacionesSesion';
import {
  formulariosDelEstudiante,
  porResponder,
  rutaFormulario,
} from '../../utils/formulariosEstudiante';
import '../../styles/student-forms.css';

/** Mis formularios: lo que el tutorado debe responder ahora, sin ruido. */
export function StudentInstruments() {
  const portal = usePortal();
  const workspace = useInstrumentWorkspace();
  const [parametros, setParametros] = useSearchParams();
  const location = useLocation();
  const navegar = useNavigate();
  const filtro = filtroFormulario(parametros.get('estado'));
  const aviso = (location.state as { aviso?: string } | null)?.aviso;

  // Enlaces anteriores («Evaluar» desde Sesiones) abren directamente la página del formulario.
  const sesionPedida = parametros.get('sesion');
  if (sesionPedida) {
    const evaluacion = portal.instrumentos.find(
      (r) => r.sesionId === sesionPedida && esEvaluacionSesion(r.formato),
    );
    if (evaluacion) return <Navigate replace to={rutaFormulario(evaluacion)} />;
  }

  const estudiante = portal.estudiante;
  if (!estudiante)
    return (
      <EmptyState
        title="No encontramos tu ficha de tutoría"
        description="Revisa la cuenta con la que ingresaste."
      />
    );

  const formularios = formulariosDelEstudiante(
    portal.instrumentos,
    estudiante.ciclo,
    portal.sesiones,
    workspace.momento,
  );
  const pendientes = formularios.filter(porResponder).length;
  const enviados = formularios.filter((f) => f.disponibilidad === 'enviado').length;
  const cantidad = {
    '': formularios.length,
    pendiente: formularios.length - enviados,
    enviado: enviados,
  };

  function filtrar(id: string) {
    const nuevos = new URLSearchParams(parametros);
    if (id) nuevos.set('estado', id);
    else nuevos.delete('estado');
    nuevos.delete('sesion');
    setParametros(nuevos);
  }

  return (
    <div className="sf-pagina">
      <PageHeading
        eyebrow="Mi tutoría"
        title="Mis formularios"
        description={
          estudiante.ciclo ? `Ciclo ${estudiante.ciclo} · ${semestreActual}` : semestreActual
        }
        actions={
          <span className={`sf-pill${pendientes ? '' : ' sf-pill--ok'}`}>
            {pendientes ? `${pendientes} por responder` : 'Al día'}
          </span>
        }
      />

      {aviso && (
        <div className="tutoring-notice sf-notice" role="status">
          <CircleCheck aria-hidden="true" />
          <span>{aviso}</span>
          <button
            className="btn btn-link"
            type="button"
            onClick={() =>
              navegar(`${location.pathname}${location.search}`, { replace: true, state: null })
            }
          >
            Cerrar
          </button>
        </div>
      )}
      {workspace.aviso && (
        <Alert tone="alerta" title="No se pudo actualizar la información">
          {workspace.aviso}
        </Alert>
      )}
      {sesionPedida && (
        <Alert tone="alerta" title="Evaluación no disponible">
          La sesión no existe o no estás convocado a ella. Revisa tu calendario de sesiones.
        </Alert>
      )}

      <FormsFilters
        label="Filtrar mis formularios"
        options={filtrosFormularios.map((f) => ({ ...f, cantidad: cantidad[f.id] }))}
        value={filtro}
        onChange={filtrar}
      />

      <StudentFormsPanel
        formularios={formularios}
        registros={portal.instrumentos}
        sesiones={portal.sesiones}
        ciclo={estudiante.ciclo}
        filtro={filtro}
      />
      <Outlet />
    </div>
  );
}
