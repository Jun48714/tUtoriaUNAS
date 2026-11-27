import type {
  Asignacion,
  Docente,
  Estudiante,
  Instrumento,
  Matricula,
  BloqueHorario,
  Sesion,
  CodigoFormato,
} from '../types/domain';
import type { DemoUser } from '../types/auth';
import { estudiantes, docentes } from '../data/personas';
import { asignaciones } from '../data/tutoria';
import { matriculas, horariosAcademicos } from '../data/academico';
import { semestreVigente } from '../data/catalogos';
import {
  RUTA_ESTADO,
  RUTA_ESTADO_INICIAL,
  apiJson,
  apiJsonSiCambio,
  getApiSession,
} from './apiClient';
import type { MomentoTutoria } from '../utils/instrumentos';
import type { ProgramacionSesion } from './sessionWorkspace';
import type { EvidenciaAsistencia } from './evidenciaAsistencia';
import type { SistemaApi } from '../types/sistema';
import { aplicarDatosSistema, vaciarDatosSistema } from './datosSistema';
import { API_MODE } from './apiConfig';
import { definicionPorCodigo } from '../data/formatos';

export interface EstadoApi {
  usuario: DemoUser;
  semestreId: string;
  momento: MomentoTutoria;
  periodoVersion: number;
  escuelaId?: string;
  escuelasAdministrables?: string[];
  consultaInstitucional?: boolean;
  estudiantes: Estudiante[];
  docentes: Docente[];
  asignaciones: Asignacion[];
  matriculas: Matricula[];
  horarios: BloqueHorario[];
  registros: Instrumento[];
  sesiones: Sesion[];
  precargas: Record<string, Record<string, string>>;
  sistema?: SistemaApi;
  historial?: Instrumento[];
}
const vacio = {
  registros: [] as Instrumento[],
  momento: 'durante' as MomentoTutoria,
  aviso: null as string | null,
};
let estado = { datos: null as EstadoApi | null, error: null as string | null, workspace: vacio };
let revisionCarga = 0;
/**
 * Etiqueta del estado que el portal tiene aplicado tal como lo envió el servidor. Si el
 * portal modifica su copia localmente, se descarta: la siguiente consulta trae el estado
 * completo. Con la etiqueta vigente, una consulta sin cambios responde 304 y no vuelve a
 * pintar el portal.
 */
let etagEstado: string | null = null;
const listeners = new Set<() => void>();
export const snapshotApi = () => estado;
export const workspaceApi = () => estado.workspace;
export function suscribirApi(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publicar() {
  listeners.forEach((l) => l());
}
/** Cambio local sobre la copia del servidor: la etiqueta deja de representarla. */
function modificarLocal() {
  revisionCarga++;
  etagEstado = null;
}
export function confirmarSistema(actualizar: (sistema: SistemaApi) => SistemaApi) {
  if (!estado.datos?.sistema) return;
  modificarLocal();
  const sistema = actualizar(estado.datos.sistema);
  const registros = [...estado.datos.registros];
  estado = {
    ...estado,
    datos: { ...estado.datos, sistema, registros },
    workspace: { ...estado.workspace, registros },
  };
  aplicarDatosSistema(sistema);
  publicar();
}
export function vaciarApi() {
  modificarLocal();
  estado = { datos: null, error: null, workspace: vacio };
  estudiantes.splice(0);
  docentes.splice(0);
  asignaciones.splice(0);
  matriculas.splice(0);
  horariosAcademicos.splice(0);
  if (API_MODE) vaciarDatosSistema();
  publicar();
}
export function aplicarEstadoApi(datos: EstadoApi) {
  // Las asignaciones antiguas pueden no tener metadatos ni historial en su JSON.
  // Normalizar aquí protege todos los portales, también al consumir una API anterior.
  datos = {
    ...datos,
    docentes: datos.docentes.map((docente) => ({
      ...docente,
      codigo: docente.codigo ?? '',
      departamento: docente.departamento ?? '',
      categoria: docente.categoria ?? null,
      dedicacion: docente.dedicacion ?? null,
      correo: docente.correo ?? '',
      telefono: docente.telefono ?? '',
      aforoMaximo: docente.aforoMaximo ?? null,
      cursosAsignados: Array.isArray(docente.cursosAsignados) ? docente.cursosAsignados : [],
    })),
    asignaciones: datos.asignaciones.map((asignacion) => ({
      ...asignacion,
      fechaInicio: asignacion.fechaInicio ?? '',
      fechaFin: asignacion.fechaFin ?? null,
      criterio: asignacion.criterio ?? '',
      referenciaAprobacion: asignacion.referenciaAprobacion ?? '',
      historial: Array.isArray(asignacion.historial) ? asignacion.historial : [],
    })),
  };
  modificarLocal();
  estudiantes.splice(0, estudiantes.length, ...datos.estudiantes);
  docentes.splice(0, docentes.length, ...datos.docentes);
  asignaciones.splice(0, asignaciones.length, ...datos.asignaciones);
  matriculas.splice(0, matriculas.length, ...datos.matriculas);
  horariosAcademicos.splice(0, horariosAcademicos.length, ...datos.horarios);
  semestreVigente.id = datos.semestreId;
  if (datos.sistema) aplicarDatosSistema(datos.sistema);
  estado = {
    datos,
    error: null,
    workspace: { registros: datos.registros, momento: datos.momento, aviso: null },
  };
  publicar();
}
type RespuestaEstado = Awaited<ReturnType<typeof apiJsonSiCambio<EstadoApi>>>;
/**
 * `inicio`: primera carga tras el login (`RUTA_ESTADO_INICIAL`).
 * `pedido`: esa misma consulta ya iniciada por el login mientras se descargaba este módulo.
 */
export async function refrescarApi(inicio = false, pedido?: Promise<RespuestaEstado>) {
  const token = getApiSession()?.accessToken;
  if (!token) return;
  const revision = ++revisionCarga;
  try {
    const respuesta = await (pedido ??
      apiJsonSiCambio<EstadoApi>(
        inicio ? RUTA_ESTADO_INICIAL : RUTA_ESTADO,
        estado.datos ? etagEstado : null,
      ));
    if (getApiSession()?.accessToken !== token || revision !== revisionCarga) return;
    if (!respuesta) {
      // 304: el servidor confirmó que la copia aplicada sigue vigente.
      if (estado.error) {
        estado = { ...estado, error: null, workspace: { ...estado.workspace, aviso: null } };
        publicar();
      }
      return estado.datos ?? undefined;
    }
    aplicarEstadoApi(respuesta.datos);
    etagEstado = respuesta.etag;
    return respuesta.datos;
  } catch (e) {
    if (getApiSession()?.accessToken !== token || revision !== revisionCarga) return;
    const mensaje = e instanceof Error ? e.message : 'No se pudo cargar la tutoría del servidor.';
    estado = { ...estado, error: mensaje, workspace: { ...estado.workspace, aviso: mensaje } };
    publicar();
    throw e;
  }
}
function documentoAceptado(result: Instrumento) {
  modificarLocal();
  if (!estado.datos) return;
  const registros = [...estado.datos.registros.filter((r) => r.id !== result.id), result];
  estado = {
    ...estado,
    datos: { ...estado.datos, registros },
    workspace: { ...estado.workspace, registros },
  };
  publicar();
}
function sesionAceptada(result: Sesion) {
  modificarLocal();
  if (!estado.datos) return;
  const sesiones = [...estado.datos.sesiones.filter((s) => s.id !== result.id), result];
  const registros = [...estado.datos.registros];
  estado = {
    ...estado,
    datos: { ...estado.datos, sesiones, registros },
    workspace: { ...estado.workspace, registros },
  };
  publicar();
}
// La escritura ya fue confirmada. Un fallo posterior al recargar la bandeja se
// comunica como falta de actualización; no se presenta como un guardado fallido.
async function actualizarTrasEscritura() {
  revisionCarga++;
  await refrescarApi().catch(() => undefined);
}
export async function crearFormularioApi(formato: CodigoFormato, estudianteId?: string | null) {
  const result = await apiJson<Instrumento>('/api/formularios', 'POST', {
    formato,
    estudianteId: estudianteId ?? null,
  });
  documentoAceptado(result);
  void actualizarTrasEscritura();
  return result;
}
export async function guardarFormularioApi(
  registro: Instrumento,
  respuestas: Record<string, string>,
  enviar: boolean,
  version: number,
) {
  const result = await apiJson<Instrumento>(
    `/api/formularios/${encodeURIComponent(registro.id)}`,
    'PUT',
    {
      respuestas,
      enviar,
      version,
      versionFormato: (registro.definicion ?? definicionPorCodigo(registro.formato))?.revision ?? 1,
    },
  );
  documentoAceptado(result);
  void actualizarTrasEscritura();
  return result;
}
export async function revisarFormularioApi(
  registro: Instrumento,
  decision: string,
  comentario: string,
) {
  const result = await apiJson<Instrumento>(
    `/api/formularios/${encodeURIComponent(registro.id)}/revision`,
    'POST',
    { version: registro.version, decision, comentario },
  );
  documentoAceptado(result);
  void actualizarTrasEscritura();
}
export async function programarSesionApi(input: ProgramacionSesion) {
  const result = await apiJson<Sesion>('/api/sesiones', 'POST', input);
  sesionAceptada(result);
  void actualizarTrasEscritura();
  return result;
}
export async function guardarAsistenciaApi(
  sesion: Sesion,
  asistentes: Sesion['asistentes'],
  mensaje: string,
  tipoTutoria = 'Académica',
  evidencia?: EvidenciaAsistencia,
) {
  const result = await apiJson<Sesion>(
    `/api/sesiones/${encodeURIComponent(sesion.id)}/asistencia`,
    'PUT',
    { version: sesion.version, asistentes, mensaje, tipoTutoria, evidencia },
  );
  sesionAceptada(result);
  void actualizarTrasEscritura();
  return result;
}
export async function cambiarMomentoApi(momento: MomentoTutoria) {
  await apiJson('/api/tutoria/periodo', 'PUT', { version: estado.datos?.periodoVersion, momento });
  await actualizarTrasEscritura();
}
export async function asignarTutorApi(input: {
  estudianteId: string;
  tutorId: string;
  grupo: string | null;
  referencia?: string;
  version?: number;
}) {
  await apiJson('/api/tutoria/asignaciones', 'POST', input);
  await actualizarTrasEscritura();
}
