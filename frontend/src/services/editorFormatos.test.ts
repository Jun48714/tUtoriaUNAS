import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiJson } from './apiClient';
import {
  cargarEditorFormato,
  cargarVersionFormato,
  guardarDefinicion,
  publicarDefinicion,
} from './editorFormatos';
import { definicionPorCodigo } from '../data/formatos';
import type { EstadoEditorFormato } from '../types/editorFormatos';

vi.mock('./apiClient', () => ({ apiJson: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe('contrato del editor con la API', () => {
  const estado: EstadoEditorFormato = {
    publicada: definicionPorCodigo('F03')!,
    version: 4,
    versionPublicada: 2,
    borrador: null,
    actualizado: null,
    historial: [],
    camposIntegrados: [],
  };
  it('transmite las dos versiones al guardar y al publicar', async () => {
    await guardarDefinicion(estado, estado.publicada);
    expect(apiJson).toHaveBeenLastCalledWith('/api/formatos/F03/borrador', 'PUT', {
      version: 4,
      versionPublicada: 2,
      definicion: estado.publicada,
    });
    await publicarDefinicion(estado);
    expect(apiJson).toHaveBeenLastCalledWith('/api/formatos/F03/publicar', 'POST', {
      version: 4,
      versionPublicada: 2,
    });
  });
  it('cancela cargas al cerrar y recupera la revisión elegida', async () => {
    const controller = new AbortController();
    await cargarEditorFormato('F03', controller.signal);
    expect(apiJson).toHaveBeenLastCalledWith(
      '/api/formatos/F03/editor',
      'GET',
      undefined,
      controller.signal,
    );
    await cargarVersionFormato('F03', 1);
    expect(apiJson).toHaveBeenLastCalledWith('/api/formatos/F03/versiones/1');
  });
});
