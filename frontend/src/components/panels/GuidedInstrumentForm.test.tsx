import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { definicionPorCodigo } from '../../data/formatos';
import { asignaciones } from '../../data/tutoria';
import { estudiantePorId, nombreCompleto } from '../../data/personas';
import type { Instrumento } from '../../types/domain';
import { ApiError } from '../../services/apiClient';
import { GuidedInstrumentForm } from './GuidedInstrumentForm';
import { bloquesPresentacion } from '../../data/presentacionFormatos';

function irPregunta(formato: Instrumento['formato'], codigo: string) {
  const indice = bloquesPresentacion(definicionPorCodigo(formato)!).findIndex((s) =>
    s.campos.some((c) => c.codigo === codigo),
  );
  fireEvent.change(screen.getByLabelText('Sección del formulario'), {
    target: { value: String(indice) },
  });
}

vi.mock('../../hooks/usePortal', () => ({ usePortal: () => ({ sesiones: [], instrumentos: [] }) }));
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
const participantes = asignaciones
  .filter((a) => a.tutorId === 'DOC-0421')
  .slice(0, 3)
  .map((a) => ({
    nombre: nombreCompleto(estudiantePorId(a.estudianteId)!),
    grupo: a.grupo ?? '',
    ciclo: String(estudiantePorId(a.estudianteId)!.ciclo),
    estudianteId: a.estudianteId,
  }));
function registro(formato: Instrumento['formato'] = 'F07'): Instrumento {
  return {
    id: 'formulario-rhf',
    formato,
    tutorId: 'DOC-0421',
    estudianteId: null,
    semestreId: '2026-II',
    sesionId: null,
    estado: 'borrador',
    avance: 0,
    version: 1,
    creado: '2026-10-27',
    actualizado: '2026-10-27',
    enviado: null,
    revisadoPor: null,
    observaciones: [],
    descargaDisponible: false,
    respuestas: {
      asistentes: JSON.stringify(participantes),
      fecha: '2026-10-10',
      tema: 'Actividad ficticia',
    },
  };
}

describe('formulario guiado con RHF y resolver Zod', () => {
  it('agrupa la vista de lectura compacta por secciones sin perder respuestas', () => {
    const definicion = definicionPorCodigo('F09')!;
    const instrumento = {
      ...registro('F09'),
      respuestas: { nombreTutor: 'Tutor ficticio', actividad1: 'Realizada' },
    };
    render(<GuidedInstrumentForm definicion={definicion} instrumento={instrumento} compacto />);
    const selector = screen.getByLabelText('Pregunta del formulario');
    expect(screen.getByRole('region', { name: 'Respuesta seleccionada' })).toHaveTextContent(
      'Docente tutor',
    );
    const indice = bloquesPresentacion(definicion).findIndex((s) =>
      s.campos.some((c) => c.codigo === 'actividad1'),
    );
    fireEvent.change(selector, { target: { value: String(indice) } });
    expect(
      within(screen.getByRole('region', { name: 'Respuesta seleccionada' })).getByText('Realizada'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Respuesta anterior' }));
    expect(selector).toHaveValue(String(indice - 1));
  });
  function editarSeccion(indice: number) {
    const definicion = definicionPorCodigo('F04')!;
    const selector = screen.getByLabelText('Sección del formulario') as HTMLSelectElement;
    fireEvent.change(selector, {
      target: { value: selector.options[selector.options.length - 1]!.value },
    });
    const titulo = screen.getByText(definicion.secciones[indice]!.titulo, {
      selector: 'summary > span',
    });
    fireEvent.click(titulo);
    fireEvent.click(
      within(titulo.closest('details')!).getByRole('button', { name: 'Editar esta sección' }),
    );
  }
  it('conserva la precarga sin mostrar el bloque de datos disponibles y permite editar desde la revisión', async () => {
    const guardar = vi.fn();
    const instrumento = {
      ...registro('F04'),
      estudianteId: 'EST-2023010456',
      respuestas: { colegio: 'I.E. ficticia', apoderado: 'Contacto ficticio' },
    };
    const { container } = render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F04')!}
        instrumento={instrumento}
        editable
        compacto
        onGuardar={guardar}
      />,
    );
    expect(container.querySelector('details.tutoring-known-data')).not.toBeInTheDocument();
    expect(screen.queryByText(/Datos ya disponibles/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Colegio de procedencia/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre del estudiante/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(guardar).toHaveBeenCalled());
    expect(guardar.mock.lastCall![0]).toMatchObject({
      colegio: 'I.E. ficticia',
      apoderado: 'Contacto ficticio',
    });
    editarSeccion(1);
    expect(screen.getByLabelText(/Colegio de procedencia/)).toHaveValue('I.E. ficticia');
  });
  it.each(['F06', 'F07'] as const)(
    '%s conserva los datos y el nodo de la última fila al quitar la intermedia',
    async (formato) => {
      const guardar = vi.fn();
      const instrumento = registro(formato);
      const { container, rerender } = render(
        <GuidedInstrumentForm
          definicion={definicionPorCodigo(formato)!}
          instrumento={instrumento}
          editable
          compacto
          onGuardar={guardar}
        />,
      );
      irPregunta(formato, 'asistentes');
      const filas = container.querySelectorAll('.tutoring-edit-row');
      expect(filas).toHaveLength(3);
      const ultima = filas[2]!;
      const campo = ultima.querySelector<HTMLInputElement>('input')!;
      fireEvent.change(campo, { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: /Quitar registro 2/ }));
      expect(container.querySelectorAll('.tutoring-edit-row')).toHaveLength(2);
      expect(container.querySelectorAll('.tutoring-edit-row')[1]).toBe(ultima);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
      const respuestas = guardar.mock.lastCall![0] as Record<string, string>;
      const guardadas = JSON.parse(respuestas.asistentes!) as Record<string, string>[];
      expect(guardadas.map((f) => f.estudianteId)).toEqual([
        participantes[0]!.estudianteId,
        participantes[2]!.estudianteId,
      ]);
      expect(guardadas[1]![formato === 'F07' ? 'ciclo' : 'grupo']).toBe('7');
      expect(guardadas.every((f) => !('id' in f))).toBe(true);
      rerender(
        <GuidedInstrumentForm
          definicion={definicionPorCodigo(formato)!}
          instrumento={{
            ...instrumento,
            version: 2,
            respuestas: { ...instrumento.respuestas, fecha: '2026-10-11' },
          }}
          editable
          compacto
          onGuardar={guardar}
        />,
      );
      expect(container.querySelectorAll('.tutoring-edit-row')).toHaveLength(2);
      fireEvent.change(screen.getByLabelText('Sección del formulario'), { target: { value: '0' } });
      irPregunta(formato, 'asistentes');
      expect(container.querySelectorAll('.tutoring-edit-row')).toHaveLength(2);
      await waitFor(() =>
        expect(screen.getAllByLabelText('Apellidos y nombres')[1]).toHaveValue(
          participantes[2]!.nombre,
        ),
      );
    },
  );

  it('el borrador acepta incompletos; avanzar exige los campos del paso y muestra mensajes accesibles', async () => {
    const guardar = vi.fn();
    render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F07')!}
        instrumento={registro()}
        editable
        compacto
        onGuardar={guardar}
      />,
    );
    irPregunta('F07', 'horaInicio');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(guardar).toHaveBeenCalledWith(expect.any(Object), false, registro().version);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled());
    guardar.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Revisa las respuestas señaladas'),
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Hora de inicio/)).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText(/^Hora de inicio/), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByLabelText(/^Hora de fin/);
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({ horaInicio: '10:00' }),
      false,
      registro().version,
    );
  });

  it('al cambiar a una respuesta que oculta el seguimiento no guarda el texto oculto', async () => {
    const guardar = vi.fn();
    const instrumento = {
      ...registro('F04'),
      estudianteId: 'EST-2023010456',
      respuestas: { expectativas: 'No', motivoExpectativas: 'Texto anterior' },
    };
    render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F04')!}
        instrumento={instrumento}
        editable
        compacto
        onGuardar={guardar}
      />,
    );
    editarSeccion(2);
    expect(screen.getByLabelText('¿Qué te faltó recibir? *')).toHaveValue('Texto anterior');
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }));
    expect(screen.queryByLabelText('¿Qué te faltó recibir? *')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(guardar.mock.lastCall![0]).not.toHaveProperty('motivoExpectativas');
  });

  it('retira del resumen el error de una pregunta que deja de corresponder', async () => {
    const instrumento = {
      ...registro('F04'),
      estudianteId: 'EST-2023010456',
      respuestas: { expectativas: 'No', motivoExpectativas: '' },
    };
    render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F04')!}
        instrumento={instrumento}
        editable
        compacto
        onGuardar={vi.fn()}
      />,
    );
    editarSeccion(2);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Qué te faltó recibir/ })).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }));
    expect(screen.queryByRole('button', { name: /Qué te faltó recibir/ })).not.toBeInTheDocument();
  });
});

describe('confirmación de entrega y feedback de respuesta', () => {
  const completa = () => ({
    ...registro('F09'),
    respuestas: {
      nombreTutor: 'Tutor ficticio',
      gruposAsignados: '1',
      estudiantesAsignados: '3',
      ...Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `actividad${i + 1}`,
          i % 2 ? 'No realizada' : 'Realizada',
        ]),
      ),
    },
  });
  function revisar() {
    const selector = screen.getByLabelText('Sección del formulario') as HTMLSelectElement;
    fireEvent.change(selector, {
      target: { value: selector.options[selector.options.length - 1]!.value },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /He revisado/ }));
  }
  it('espera el servidor, impide doble envío y mantiene el cierre aunque el padre actualice a enviado', async () => {
    let resolver!: (value: Instrumento) => void;
    const guardar = vi.fn(
      () =>
        new Promise<Instrumento>((resolve) => {
          resolver = resolve;
        }),
    );
    const reg = completa(),
      terminar = vi.fn();
    const { container, rerender } = render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F09')!}
        instrumento={reg}
        editable
        onGuardar={guardar}
        onFinalizar={terminar}
      />,
    );
    revisar();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar formulario' }));
    await waitFor(() => expect(guardar).toHaveBeenCalledOnce());
    expect(container.querySelector('.form-completion')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar formulario' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar formulario' }));
    expect(guardar).toHaveBeenCalledOnce();
    const enviado = { ...reg, estado: 'enviado' as const, version: 2 };
    await act(async () => resolver(enviado));
    expect(screen.getByRole('heading', { name: '¡Enviado!' })).toBeVisible();
    const stage = container.querySelector('.fc-stage');
    rerender(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F09')!}
        instrumento={enviado}
        onFinalizar={terminar}
      />,
    );
    expect(container.querySelector('.fc-stage')).toBe(stage);
    fireEvent.click(screen.getByRole('button', { name: /Volver al listado/ }));
    expect(terminar).toHaveBeenCalledOnce();
  });
  it.each([409, 422, 500])(
    'no celebra un fallo HTTP %s ni pierde las respuestas',
    async (status) => {
      const guardar = vi.fn().mockRejectedValue(new ApiError('No se pudo confirmar.', status));
      const { container } = render(
        <GuidedInstrumentForm
          definicion={definicionPorCodigo('F09')!}
          instrumento={completa()}
          editable
          onGuardar={guardar}
        />,
      );
      revisar();
      fireEvent.click(screen.getByRole('button', { name: 'Enviar formulario' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('No se pudo confirmar.'),
      );
      expect(container.querySelector('.form-completion')).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /He revisado/ })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Enviar formulario' })).toBeEnabled();
    },
  );
  it('no reproduce un cierre al abrir un envío histórico', () => {
    const { container } = render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F09')!}
        instrumento={{ ...completa(), estado: 'enviado' }}
      />,
    );
    expect(container.querySelector('.form-completion')).not.toBeInTheDocument();
  });
  it('confirma del mismo modo una respuesta negativa', () => {
    const { container } = render(
      <GuidedInstrumentForm
        definicion={definicionPorCodigo('F09')!}
        instrumento={registro('F09')}
        editable
        onGuardar={vi.fn()}
      />,
    );
    const selector = screen.getByLabelText('Sección del formulario') as HTMLSelectElement;
    const actividades = Array.from(selector.options).find((o) =>
      o.textContent?.includes('Actividades realizadas'),
    )!;
    fireEvent.change(selector, { target: { value: actividades.value } });
    const campo = container.querySelector('[data-field="actividad1"]')!;
    expect(within(campo as HTMLElement).queryByText('Respondida')).not.toBeInTheDocument();
    fireEvent.click(within(campo as HTMLElement).getByRole('radio', { name: 'No realizada' }));
    expect(within(campo as HTMLElement).getByText('Respondida')).toBeVisible();
  });
});

it('espera el detalle de Otro y el blur de los textos antes de confirmar la respuesta', () => {
  const { container } = render(
    <GuidedInstrumentForm
      definicion={definicionPorCodigo('F03')!}
      instrumento={{ ...registro('F03'), estudianteId: 'EST-2023010456', respuestas: {} }}
      editable
      onGuardar={vi.fn()}
    />,
  );
  irPregunta('F03', 'colegio');
  const colegio = container.querySelector('[data-field="colegio"]') as HTMLElement;
  fireEvent.change(within(colegio).getByRole('textbox'), { target: { value: 'Colegio ficticio' } });
  expect(within(colegio).queryByText('Respondida')).not.toBeInTheDocument();
  fireEvent.blur(within(colegio).getByRole('textbox'));
  expect(within(colegio).getByText('Respondida')).toBeVisible();
  irPregunta('F03', 'expectativas');
  const expectativas = container.querySelector('[data-field="expectativas"]') as HTMLElement;
  fireEvent.click(within(expectativas).getByRole('checkbox', { name: 'Otro' }));
  expect(within(expectativas).queryByText('Respondida')).not.toBeInTheDocument();
  const detalle = within(expectativas).getByRole('textbox');
  fireEvent.change(detalle, { target: { value: 'Organizar mejor mis estudios' } });
  fireEvent.blur(detalle);
  expect(within(expectativas).getByText('Respondida')).toBeVisible();
});

it('las caritas guardan el valor oficial negativo A–D y no una puntuación nueva', async () => {
  const guardar = vi.fn();
  const { container } = render(
    <GuidedInstrumentForm
      definicion={definicionPorCodigo('F10')!}
      instrumento={{ ...registro('F10'), estudianteId: 'EST-2023010456', respuestas: {} }}
      editable
      onGuardar={guardar}
    />,
  );
  irPregunta('F10', 'p01');
  const pregunta = container.querySelector('[data-field="p01"]') as HTMLElement;
  expect(pregunta.querySelectorAll('.form-choice-face')).toHaveLength(4);
  fireEvent.click(within(pregunta).getByRole('radio', { name: 'Totalmente en desacuerdo' }));
  expect(within(pregunta).getByText('Respondida')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  await waitFor(() => expect(guardar).toHaveBeenCalled());
  expect(guardar.mock.lastCall![0].p01).toBe('D · Totalmente en desacuerdo');
});
