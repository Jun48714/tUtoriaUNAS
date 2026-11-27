import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asignacion, Instrumento, Sesion } from '../types/domain';
import { asignaciones } from '../data/tutoria';
import { apiJson, apiJsonSiCambio } from './apiClient';
import {
  guardarFormularioApi,
  aplicarEstadoApi,
  programarSesionApi,
  refrescarApi,
  snapshotApi,
  suscribirApi,
  vaciarApi,
} from './apiTutoria';
import type { EstadoApi } from './apiTutoria';

vi.mock('./apiClient', () => {
  const apiJson = vi.fn();
  return {
    apiJson,
    RUTA_ESTADO: '/api/tutoria/estado',
    // Por defecto la consulta condicional devuelve el estado completo sin etiqueta.
    apiJsonSiCambio: vi.fn(async (path: string) => ({ datos: await apiJson(path), etag: null })),
    getApiSession: () => ({ accessToken: 'cuenta-ficticia' }),
  };
});
const document: Instrumento = {
  id: 'INST-FICTICIO',
  formato: 'F03',
  tutorId: 'DOC-FICTICIO',
  estudianteId: 'EST-FICTICIO',
  semestreId: '2026-II',
  sesionId: null,
  estado: 'borrador',
  avance: 10,
  version: 2,
  creado: '2026-10-28',
  actualizado: '2026-10-28',
  enviado: null,
  revisadoPor: null,
  observaciones: [],
  descargaDisponible: false,
  respuestas: { apoderado: 'Dato anterior' },
};
function state(record = document): EstadoApi {
  return {
    usuario: {
      id: 'EST-FICTICIO',
      role: 'estudiante',
      name: 'Ficticio',
      identifier: 'ficticio',
      email: 'ficticio@example.test',
    },
    semestreId: '2026-II',
    momento: 'inicio',
    periodoVersion: 1,
    estudiantes: [],
    docentes: [],
    asignaciones: [],
    matriculas: [],
    horarios: [],
    registros: [record],
    sesiones: [],
    precargas: {},
  };
}
describe('estado remoto del expediente', () => {
  beforeEach(() => {
    vaciarApi();
    vi.mocked(apiJson).mockReset();
  });
  it('una escritura rechazada no cambia la versión ni las respuestas de la bandeja', async () => {
    vi.mocked(apiJson).mockResolvedValueOnce(state());
    await refrescarApi();
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('El registro cambió en otro cliente.'));
    await expect(
      guardarFormularioApi(document, { apoderado: 'Sin confirmar' }, false, 2),
    ).rejects.toThrow('El registro cambió');
    expect(snapshotApi().workspace.registros[0]).toEqual(document);
  });
  it('confirma la escritura aunque la recarga siga pendiente e informa si falla', async () => {
    vi.mocked(apiJson).mockResolvedValueOnce(state());
    await refrescarApi();
    const saved = { ...document, version: 3, respuestas: { apoderado: 'Dato confirmado' } };
    let fallarRecarga!: (error: Error) => void;
    vi.mocked(apiJson)
      .mockResolvedValueOnce(saved)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fallarRecarga = reject;
          }),
      );
    await expect(guardarFormularioApi(document, saved.respuestas, false, 2)).resolves.toEqual(
      saved,
    );
    expect(snapshotApi().workspace.registros[0]).toEqual(saved);
    expect(snapshotApi().error).toBeNull();
    fallarRecarga(new Error('No se pudo actualizar la bandeja'));
    await vi.waitFor(() => expect(snapshotApi().error).toContain('No se pudo actualizar'));
    const session: Sesion = {
      id: 'SES-FICTICIA',
      codigo: 'TUT-FICTICIA',
      tipo: 'individual',
      tutorId: 'DOC-FICTICIO',
      semestreId: '2026-II',
      fecha: '2026-11-01',
      horaInicio: '10:00',
      horaFin: '11:00',
      modalidad: 'presencial',
      lugar: 'Sala ficticia',
      tema: 'Prueba de persistencia',
      objetivo: 'Comprobar una confirmación',
      estado: 'programada',
      asistentes: [],
      acuerdos: [],
      instrumentoId: null,
      observacion: null,
      version: 1,
    };
    vi.mocked(apiJson)
      .mockResolvedValueOnce(session)
      .mockRejectedValueOnce(new Error('No se pudo actualizar la agenda'));
    await programarSesionApi({ ...session, estudiantes: ['EST-FICTICIO'] });
    expect(snapshotApi().datos?.sesiones).toEqual([session]);
  });
  it('una consulta más antigua no sobrescribe los datos de una consulta reciente', async () => {
    let finishOld!: (value: unknown) => void;
    vi.mocked(apiJson).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const old = refrescarApi();
    const latest = { ...document, version: 5 };
    vi.mocked(apiJson).mockResolvedValueOnce(state(latest));
    await refrescarApi();
    finishOld(state());
    await old;
    expect(snapshotApi().workspace.registros[0]?.version).toBe(5);
  });
  it('una consulta pendiente no resucita el expediente después de cerrar la cuenta', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(apiJson).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = refrescarApi();
    vaciarApi();
    finish(state());
    await pending;
    expect(snapshotApi().datos).toBeNull();
    expect(snapshotApi().workspace.registros).toEqual([]);
  });
  it('un estado sin cambios (304) no vuelve a publicar ni a pintar el portal', async () => {
    const condicional = vi.mocked(apiJsonSiCambio);
    condicional.mockResolvedValueOnce({ datos: state(), etag: 'W/"estado-1"' });
    await refrescarApi();
    expect(condicional).toHaveBeenLastCalledWith('/api/tutoria/estado', null);
    const aplicado = snapshotApi();
    const avisos = vi.fn();
    const cancelar = suscribirApi(avisos);
    condicional.mockResolvedValueOnce(null);
    await expect(refrescarApi()).resolves.toBe(aplicado.datos);
    expect(condicional).toHaveBeenLastCalledWith('/api/tutoria/estado', 'W/"estado-1"');
    expect(snapshotApi()).toBe(aplicado);
    expect(avisos).not.toHaveBeenCalled();
    cancelar();
  });
  it('tras un cambio local la siguiente consulta pide el estado completo', async () => {
    const condicional = vi.mocked(apiJsonSiCambio);
    condicional.mockResolvedValueOnce({ datos: state(), etag: 'W/"estado-1"' });
    await refrescarApi();
    const saved = { ...document, version: 3 };
    vi.mocked(apiJson).mockResolvedValueOnce(saved).mockResolvedValueOnce(state(saved));
    await guardarFormularioApi(document, saved.respuestas, false, 2);
    expect(condicional).toHaveBeenLastCalledWith('/api/tutoria/estado', null);
  });
  it.each([undefined, null, {}])(
    'carga asignaciones históricas con historial %s sin romper los portales',
    async (historial) => {
      const antigua = {
        id: 'ASG-ANTIGUA',
        estudianteId: 'EST-FICTICIO',
        tutorId: 'DOC-FICTICIO',
        escuelaId: 'E-IIS',
        semestreId: '2026-II',
        grupo: null,
        estado: 'activa',
        version: 4,
        historial,
      };
      const respuesta = { ...state(), asignaciones: [antigua] } as EstadoApi;
      vi.mocked(apiJson).mockResolvedValueOnce(respuesta);
      await refrescarApi();
      const esperada = {
        ...antigua,
        historial: [],
        fechaInicio: '',
        fechaFin: null,
        criterio: '',
        referenciaAprobacion: '',
      };
      expect(snapshotApi().datos?.asignaciones).toEqual([esperada]);
      expect(asignaciones).toEqual([esperada]);
      expect([...asignaciones[0]!.historial]).toEqual([]);
      expect(respuesta.asignaciones[0]?.historial).toBe(historial);
    },
  );
  it('conserva el historial y los metadatos existentes al aplicar el estado del login', () => {
    const asignacion: Asignacion = {
      id: 'ASG-COMPLETA',
      estudianteId: 'EST-FICTICIO',
      tutorId: 'DOC-FICTICIO',
      escuelaId: 'E-IIS',
      semestreId: '2026-II',
      grupo: 'G-01',
      estado: 'activa',
      version: 2,
      fechaInicio: '2026-09-07',
      fechaFin: null,
      criterio: 'afinidad de curso',
      referenciaAprobacion: 'Acta ficticia',
      historial: [
        {
          fecha: '2026-09-07',
          tutorAnteriorId: null,
          tutorNuevoId: 'DOC-FICTICIO',
          motivo: 'Alta ficticia',
          responsable: 'Comisión ficticia',
        },
      ],
    };
    aplicarEstadoApi({ ...state(), asignaciones: [asignacion] });
    expect(snapshotApi().datos?.asignaciones).toEqual([asignacion]);
    expect(asignaciones).toEqual([asignacion]);
  });
  it('normaliza docentes parciales sin inventar contacto ni cursos', () => {
    const docente = {
      id: 'DOC-ANTIGUO',
      nombres: 'Tutor ficticio',
      apellidos: 'Prueba',
      escuelaId: 'E-IIS',
      activo: true,
    };
    aplicarEstadoApi({ ...state(), docentes: [docente] } as EstadoApi);
    expect(snapshotApi().datos?.docentes[0]).toMatchObject({
      id: docente.id,
      telefono: '',
      cursosAsignados: [],
      correo: '',
      aforoMaximo: null,
    });
  });
});
