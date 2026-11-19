import type { DefinicionFormato } from './domain';

export interface EstadoEditorFormato {
  publicada: DefinicionFormato;
  versionPublicada: number;
  borrador: DefinicionFormato | null;
  version: number;
  actualizado: string | null;
  historial: { revision: number; publicado: string; usuarioId: string }[];
  camposIntegrados: string[];
}
