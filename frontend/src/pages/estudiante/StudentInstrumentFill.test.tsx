import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Instrumento, Sesion } from '../../types/domain';
import { estudiantes } from '../../data/personas';
import { semestreVigente } from '../../data/catalogos';
import { StudentInstrumentFill } from './StudentInstrumentFill';

const estudiante = estudiantes.find((e) => e.ciclo !== null && e.ciclo <= 3)!;
const portal = {
  estudiante,
  instrumentos: [] as Instrumento[],
  sesiones: [] as Sesion[],
};
vi.mock('../../hooks/usePortal', () => ({ usePortal: () => portal }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: estudiante.id, role: 'estudiante', name: 'Prueba' } }),
}));
vi.mock('../../hooks/useInstrumentWorkspace', () => ({
  useInstrumentWorkspace: () => ({ registros: [], momento: 'durante', aviso: null }),
}));

function instrumento(parcial: Partial<Instrumento>): Instrumento {
  return {
    id: 'INST-PRUEBA',
    formato: 'F03',
    semestreId: semestreVigente.id,
    tutorId: 'DOC-0421',
    estudianteId: estudiante.id,
    sesionId: null,
    estado: 'no-iniciado',
    avance: 0,
    version: 1,
    creado: '2026-10-01',
    actualizado: '2026-10-01',
    enviado: null,
    revisadoPor: null,
    observaciones: [],
    descargaDisponible: false,
    respuestas: {},
    ...parcial,
  };
}

function abrir(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/estudiante/instrumentos/${encodeURIComponent(id)}`]}>
      <Routes>
        <Route path="/estudiante/instrumentos/:instrumentoId" element={<StudentInstrumentFill />} />
        <Route path="/estudiante/instrumentos" element={<p>Lista</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Modal para responder un formulario', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  });
  beforeEach(() => {
    portal.instrumentos = [];
    portal.sesiones = [];
  });

  it('abre la entrevista en el modal común y vuelve a la lista al cerrarlo', () => {
    portal.instrumentos = [instrumento({ id: 'ENT' })];
    abrir('ENT');
    expect(screen.getByRole('dialog', { name: 'Entrevista de ingreso' })).toHaveClass(
      'sheet--instrumento',
    );
    expect(screen.getByText(`Formato 03 · ${semestreVigente.id}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument();
    // La cabecera ya dice el formato: el paso no lo repite.
    expect(screen.queryByText(/Paso 1 de \d+ · Formato/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(screen.getByText('Lista')).toBeVisible();
  });

  it('una evaluación aún no habilitada se muestra como vista previa, sin guardar', () => {
    portal.sesiones = [
      {
        id: 'SES-1',
        codigo: 'SES-1',
        tipo: 'individual',
        tutorId: 'DOC-0421',
        semestreId: semestreVigente.id,
        fecha: '2026-10-20',
        horaInicio: '10:00',
        horaFin: '11:00',
        modalidad: 'presencial',
        lugar: 'Aula',
        tema: 'Técnicas de estudio',
        objetivo: '',
        estado: 'realizada',
        asistentes: [
          { estudianteId: estudiante.id, estado: 'asistio', horaRegistro: null, observacion: null },
        ],
        acuerdos: [],
        instrumentoId: null,
        observacion: null,
        asistenciaConfirmada: false,
      },
    ];
    portal.instrumentos = [instrumento({ id: 'EV', formato: 'F10', sesionId: 'SES-1' })];
    abrir('EV');
    expect(
      screen.getByRole('dialog', { name: 'Evaluación de la tutoría individual' }),
    ).toBeVisible();
    expect(screen.getByText(/Técnicas de estudio/)).toBeInTheDocument();
    expect(screen.getByText('Aún no puedes responder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument();
  });

  it('un formulario inexistente ofrece volver a la lista', () => {
    abrir('NO-EXISTE');
    expect(screen.getByText('No encontramos este formulario')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver mis formularios' })).toHaveAttribute(
      'href',
      '/estudiante/instrumentos',
    );
  });
});
