import { apiJson } from './apiClient';

/** Fila del Excel que no se importa y por qué. */
export interface FilaExcluida {
  hoja: 'Alumnos' | 'Docentes';
  fila: number;
  motivo: string;
  detalle: string;
}

export interface EscuelaVistaPrevia {
  id: string;
  nombre: string;
  alumnos: number;
  nueva: boolean;
}

/** Resultado de leer y validar el libro, sin haber guardado nada todavía. */
export interface VistaPreviaPadron {
  token: string;
  expira: string;
  archivo: string;
  tamano: number;
  sha256: string;
  semestre: string;
  semestreFuente: string;
  yaImportado: boolean;
  segundosLectura: number;
  hojas: { alumnos: boolean; docentes: boolean };
  alumnos: {
    filas: number;
    importables: number;
    filasExcluidas: number;
    nuevos: number;
    actualizados: number;
    sinPpa: number;
    sinCelular: number;
  };
  matriculas: number;
  cursos: number;
  cursosMatriculados: number;
  horarios: number;
  horariosDuplicados: number;
  horariosSinNormalizar: number;
  docentes: {
    filas: number;
    importables: number;
    excluidos: number;
    duplicados: number;
    nuevos: number;
    actualizados: number;
  };
  escuelas: EscuelaVistaPrevia[];
  advertencias: string[];
  excluidas: FilaExcluida[];
  totalExcluidas: number;
}

export interface ResultadoImportacion {
  importado: boolean;
  alumnos: number;
  docentes: number;
  matriculas: number;
  cursos: number;
  horarios: number;
  /** Bloques de un padrón anterior que ya no figuran en este archivo y se retiraron. */
  horariosRetirados: number;
  escuelas: number;
  segundos: number;
  semestre: string;
}

/** Sube el Excel y recibe la vista previa. No modifica la base de datos. */
export function analizarPadron(archivo: File) {
  const formulario = new FormData();
  formulario.append('archivo', archivo, archivo.name);
  return apiJson<VistaPreviaPadron>('/api/padron/importar/analizar', 'POST', formulario);
}

/** Guarda en la base de datos la vista previa aprobada. */
export function confirmarPadron(token: string) {
  return apiJson<ResultadoImportacion>('/api/padron/importar/confirmar', 'POST', { token });
}

/** CSV (UTF-8 con BOM, para que Excel respete las tildes) de las filas que no se importan. */
export function csvExcluidas(filas: FilaExcluida[]) {
  const celda = (valor: string | number) => `"${String(valor).replaceAll('"', '""')}"`;
  const lineas = [
    ['Hoja', 'Fila', 'Motivo', 'Detalle'].map(celda).join(','),
    ...filas.map((f) => [f.hoja, f.fila, f.motivo, f.detalle].map(celda).join(',')),
  ];
  return '\uFEFF' + lineas.join('\r\n');
}
