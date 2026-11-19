import { apiJson } from './apiClient';
import type { CodigoFormato, DefinicionFormato } from '../types/domain';
import type { EstadoEditorFormato } from '../types/editorFormatos';

const ruta = (codigo: CodigoFormato) => `/api/formatos/${encodeURIComponent(codigo)}`;
export const cargarEditorFormato = (codigo: CodigoFormato, signal?: AbortSignal) =>
  apiJson<EstadoEditorFormato>(`${ruta(codigo)}/editor`, 'GET', undefined, signal);
export const guardarDefinicion = (estado: EstadoEditorFormato, definicion: DefinicionFormato) =>
  apiJson<EstadoEditorFormato>(`${ruta(definicion.codigo)}/borrador`, 'PUT', {
    version: estado.version,
    versionPublicada: estado.versionPublicada,
    definicion,
  });
export const publicarDefinicion = (estado: EstadoEditorFormato) =>
  apiJson<EstadoEditorFormato>(`${ruta(estado.publicada.codigo)}/publicar`, 'POST', {
    version: estado.version,
    versionPublicada: estado.versionPublicada,
  });
export const cargarVersionFormato = (codigo: CodigoFormato, revision: number) =>
  apiJson<DefinicionFormato>(`${ruta(codigo)}/versiones/${revision}`);
