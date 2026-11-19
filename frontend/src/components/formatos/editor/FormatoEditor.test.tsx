import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormatoEditor } from './FormatoEditor';
import { ApiError } from '../../../services/apiClient';
import {
  cargarEditorFormato,
  guardarDefinicion,
  publicarDefinicion,
} from '../../../services/editorFormatos';
import { definicionPorCodigo } from '../../../data/formatos';
import type { EstadoEditorFormato } from '../../../types/editorFormatos';
import { etiquetaBreve } from '../../../data/presentacionFormatos';

vi.mock('../../../services/editorFormatos', () => ({
  cargarEditorFormato: vi.fn(),
  guardarDefinicion: vi.fn(),
  publicarDefinicion: vi.fn(),
  cargarVersionFormato: vi.fn(),
}));
vi.mock('../../../services/apiTutoria', () => ({
  refrescarApi: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../hooks/usePortal', () => ({
  usePortal: () => ({ sesiones: [], instrumentos: [] }),
}));
const originalMostrar = HTMLDialogElement.prototype.showModal;
const originalCerrar = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalMostrar;
  HTMLDialogElement.prototype.close = originalCerrar;
});
const inicial = (): EstadoEditorFormato => ({
  publicada: structuredClone(definicionPorCodigo('F03')!),
  versionPublicada: 1,
  borrador: null,
  version: 0,
  actualizado: null,
  historial: [],
  camposIntegrados: ['nombreEstudiante', 'correo'],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cargarEditorFormato).mockResolvedValue(inicial());
});
function montar(onClose = vi.fn()) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <FormatoEditor codigo="F03" onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('editor de coordinación', () => {
  it('presenta las preguntas en el orden del estudiante y edita en el mismo lugar', async () => {
    montar();
    await screen.findByLabelText('Ir a pregunta');
    const esperadas = inicial()
      .publicada.secciones.flatMap((s) => s.campos)
      .map((c) => etiquetaBreve('F03', c));
    const selector = screen.getByLabelText('Ir a pregunta') as HTMLSelectElement;
    expect(Array.from(selector.options).map((o) => o.text.replace(/^\d+\. /, ''))).toEqual(
      esperadas,
    );
    expect(document.querySelectorAll('.fe-item')).toHaveLength(1);
    fireEvent.change(selector, { target: { value: selector.options[5]!.value } });
    fireEvent.click(screen.getByRole('button', { name: 'Editar pregunta 6' }));
    expect(screen.getByLabelText('Texto de la pregunta')).toHaveValue(esperadas[5]);
    fireEvent.change(screen.getByLabelText('Texto de la pregunta'), {
      target: { value: 'Colegio actualizado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(document.querySelector('.fe-question-label')).toHaveTextContent('Colegio actualizado');
    fireEvent.click(screen.getByRole('button', { name: 'Pregunta siguiente' }));
    expect(document.querySelectorAll('.fe-item')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pregunta anterior' }));
    expect(document.querySelector('.fe-question-label')).toHaveTextContent('Colegio actualizado');
  });
  it('separa guardar de publicar y conserva la edición ante un conflicto', async () => {
    montar();
    await screen.findByLabelText('Ir a pregunta');
    fireEvent.click(screen.getByRole('tab', { name: /^Formulario$/ }));
    const titulo = await screen.findByLabelText('Título del formulario');
    fireEvent.change(titulo, { target: { value: 'Entrevista editada' } });
    expect(screen.getByRole('button', { name: 'Publicar cambios' })).toBeDisabled();
    vi.mocked(guardarDefinicion).mockRejectedValueOnce(
      new ApiError('El registro cambió en otro cliente.', 409),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText(/El registro cambió/);
    expect(titulo).toHaveValue('Entrevista editada');
    const guardado = {
      ...inicial(),
      version: 1,
      borrador: { ...inicial().publicada, nombre: 'Entrevista editada' },
    };
    vi.mocked(guardarDefinicion).mockResolvedValueOnce(guardado);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publicar cambios' })).toBeEnabled(),
    );
    expect(publicarDefinicion).not.toHaveBeenCalled();
    vi.mocked(publicarDefinicion).mockResolvedValueOnce({
      ...guardado,
      version: 2,
      versionPublicada: 2,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar cambios' }));
    expect(publicarDefinicion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, publicar' }));
    await screen.findByText('Versión 2 publicada para todos los portales.');
    expect(publicarDefinicion).toHaveBeenCalledOnce();
  });
  it('protege cambios sin guardar al cerrar y permite editar nuevas preguntas', async () => {
    const cerrar = montar();
    await screen.findByLabelText('Ir a pregunta');
    fireEvent.click(screen.getAllByRole('button', { name: 'Añadir pregunta' })[0]!);
    fireEvent.change(screen.getByLabelText('Texto de la pregunta'), {
      target: { value: 'Pregunta nueva de práctica' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de respuesta'), { target: { value: 'multiple' } });
    expect(screen.getByLabelText('Opción 1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(cerrar).not.toHaveBeenCalled();
    expect(screen.getByText(/Hay cambios sin guardar/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(cerrar).toHaveBeenCalledOnce();
  });
});
