import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Instrumento } from '../../types/domain';
import type { MonitoreoApi } from '../../types/monitoreo';
import { MonitoreoAvance } from './MonitoreoAvance';
import { MonitoreoDerivaciones } from './MonitoreoDerivaciones';
import { MonitoreoFormatos } from './MonitoreoFormatos';

const datos = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock('../../services/apiClient', () => ({
  apiJson: () => Promise.resolve(datos.valor),
}));

const entrevista: Instrumento = {
  id: 'INST-F03-2026-II-EST-1',
  formato: 'F03',
  semestreId: '2026-II',
  tutorId: 'DOC-1',
  estudianteId: 'EST-1',
  sesionId: null,
  estado: 'enviado',
  avance: 100,
  version: 3,
  creado: '2026-11-10',
  actualizado: '2026-11-17',
  enviado: '2026-11-17',
  revisadoPor: null,
  observaciones: [],
  descargaDisponible: false,
  respuestas: {
    nombreEstudiante: 'Ana Quispe Rojas',
    grupo: 'G-1',
    correo: 'ana@unas.edu.pe',
    telefono: '999 999 999',
  },
};

const monitoreo: MonitoreoApi = {
  escuelaId: 'E-IIS',
  semestreId: '2026-II',
  momento: 'durante',
  generado: '2026-11-17T18:00:00Z',
  resumen: {
    estudiantes: 40,
    conTutor: 2,
    entrevistasCompletadas: 1,
    entrevistasPendientes: 1,
    docentes: 3,
    docentesConTutorados: 1,
    sesionesRealizadas: 4,
    sesionesProgramadas: 2,
    formatosEnviados: 1,
    derivaciones: 1,
  },
  estudiantes: [
    {
      id: 'EST-1',
      codigo: '2023010457',
      nombres: 'Ana',
      apellidos: 'Quispe Rojas',
      correo: 'ana@unas.edu.pe',
      ciclo: 3,
      escuelaId: 'E-IIS',
    },
    {
      id: 'EST-2',
      codigo: '2023010458',
      nombres: 'Luis',
      apellidos: 'Vela Ríos',
      correo: 'luis@unas.edu.pe',
      ciclo: 5,
      escuelaId: 'E-IIS',
    },
  ],
  docentes: [
    {
      id: 'DOC-1',
      codigo: 'DOC-0421',
      nombres: 'Marta',
      apellidos: 'Paredes Auqui',
      correo: 'marta@unas.edu.pe',
      escuelaId: 'E-IIS',
    },
  ],
  avanceEstudiantes: [
    {
      estudianteId: 'EST-1',
      tutorId: 'DOC-1',
      grupo: 'G-1',
      ciclo: 3,
      entrevistaFormato: 'F03',
      entrevistaEstado: 'enviado',
      entrevistaAvance: 100,
      sesionesAsistidas: 2,
      evaluacionesEnviadas: 1,
      evaluacionesPendientes: 1,
      formatosEnviados: 2,
      derivaciones: 1,
      ultimaActividad: '2026-11-17',
    },
    {
      estudianteId: 'EST-2',
      tutorId: 'DOC-1',
      grupo: 'G-1',
      ciclo: 5,
      entrevistaFormato: null,
      entrevistaEstado: 'sin-habilitar',
      entrevistaAvance: 0,
      sesionesAsistidas: 0,
      evaluacionesEnviadas: 0,
      evaluacionesPendientes: 0,
      formatosEnviados: 0,
      derivaciones: 0,
      ultimaActividad: null,
    },
  ],
  avanceDocentes: [
    {
      docenteId: 'DOC-1',
      tutorados: 2,
      sesionesRealizadas: 4,
      sesionesProgramadas: 2,
      sesionesSinCerrar: 1,
      entrevistasEnviadas: 1,
      entrevistasAprobadas: 0,
      entrevistasObservadas: 0,
      formatosEnviados: 3,
      atenciones: 1,
      derivaciones: 1,
      informeF02: 'borrador',
      autoevaluacionF09: 'sin-iniciar',
    },
  ],
  porFormato: Array.from({ length: 12 }, (_, i) => ({
    formato: `F${String(i + 1).padStart(2, '0')}` as MonitoreoApi['porFormato'][number]['formato'],
    total: i === 2 ? 2 : 0,
    enviados: i === 2 ? 1 : 0,
    aprobados: 0,
    observados: 0,
    enCurso: i === 2 ? 1 : 0,
  })),
  registros: [entrevista],
  derivaciones: [
    {
      id: 'INST-F12-1',
      estudianteId: 'EST-1',
      tutorId: 'DOC-1',
      area: 'psicologia',
      motivo: 'Ansiedad ante exámenes',
      fecha: '2026-11-16',
      prioridad: 'alta',
      estado: 'registrada',
      responsableArea: 'Pendiente de recepción por el área',
      siguienteAccion: 'El área debe comunicar la recepción.',
      fechaCita: null,
    },
  ],
  sesiones: [],
};

function pagina(ui: React.ReactElement, ruta = '/tutor/monitoreo') {
  datos.valor = monitoreo;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('monitoreo de escuela (solo lectura)', () => {
  it('muestra el avance de estudiantes y docentes de toda la escuela', async () => {
    pagina(<MonitoreoAvance />);
    expect(await screen.findByText(/Quispe Rojas, Ana/)).toBeVisible();
    expect(screen.getByText('Entrevistas completadas')).toBeVisible();
    expect(screen.getByText('Sin habilitar')).toBeVisible();
    expect(screen.getByText('1 pendientes')).toBeVisible();
    // cambia a la vista de docentes
    screen.getByRole('button', { name: /Docentes/ }).click();
    expect(await screen.findByText(/Paredes Auqui, Marta/)).toBeVisible();
    expect(screen.getByText('1 sin cerrar')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Guardar|Enviar|Aprobar/ })).toBeNull();
  });

  it('elige un formato y muestra la plantilla con lo que llenó el estudiante', async () => {
    pagina(<MonitoreoFormatos />, '/tutor/monitoreo/formatos');
    expect(
      await screen.findByRole('heading', { name: /Formato 03 · Entrevista inicial/ }),
    ).toBeVisible();
    expect(screen.getByText('1 enviado · 1 en curso')).toBeVisible();
    await waitFor(() => expect(screen.getAllByText(/Ana Quispe Rojas/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/RESOLUCIÓN N° 500-2022-CU-R-UNAS/i).length).toBeGreaterThan(0);
    // otro formato sin envíos
    within(screen.getByRole('list', { name: /Formatos de la Resolución/ }))
      .getByRole('button', { name: /Registro de asistencia: tutoría individual/ })
      .click();
    expect(await screen.findByText('Aún no hay formatos enviados')).toBeVisible();
  });

  it('lista las derivaciones con su seguimiento y enlaza a la ficha', async () => {
    pagina(<MonitoreoDerivaciones />, '/tutor/monitoreo/derivaciones');
    expect(await screen.findByText('Ansiedad ante exámenes')).toBeVisible();
    expect(screen.getByText('El área debe comunicar la recepción.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute(
      'href',
      '/tutor/monitoreo/formatos?formato=F12&doc=INST-F12-1',
    );
  });
});
