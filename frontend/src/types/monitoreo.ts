import type { CodigoFormato, Instrumento, Sesion } from './domain';

/** Persona de la escuela tal como la entrega el monitoreo (solo lo necesario para mostrar nombres). */
export interface PersonaMonitoreo {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  correo: string;
  ciclo?: number | null;
  escuelaId: string;
}

export interface ResumenMonitoreo {
  estudiantes: number;
  conTutor: number;
  entrevistasCompletadas: number;
  entrevistasPendientes: number;
  docentes: number;
  docentesConTutorados: number;
  sesionesRealizadas: number;
  sesionesProgramadas: number;
  formatosEnviados: number;
  derivaciones: number;
}

export interface AvanceEstudiante {
  estudianteId: string;
  tutorId: string;
  grupo: string | null;
  ciclo: number | null;
  entrevistaFormato: string | null;
  /** sin-habilitar | no-iniciado | borrador | enviado | observado | aprobado */
  entrevistaEstado: string;
  entrevistaAvance: number;
  sesionesAsistidas: number;
  evaluacionesEnviadas: number;
  evaluacionesPendientes: number;
  formatosEnviados: number;
  derivaciones: number;
  ultimaActividad: string | null;
}

export interface AvanceDocente {
  docenteId: string;
  tutorados: number;
  sesionesRealizadas: number;
  sesionesProgramadas: number;
  sesionesSinCerrar: number;
  entrevistasEnviadas: number;
  entrevistasAprobadas: number;
  entrevistasObservadas: number;
  formatosEnviados: number;
  atenciones: number;
  derivaciones: number;
  informeF02: string;
  autoevaluacionF09: string;
}

export interface ResumenFormato {
  formato: CodigoFormato;
  total: number;
  enviados: number;
  aprobados: number;
  observados: number;
  enCurso: number;
}

export interface DerivacionMonitoreo {
  id: string;
  estudianteId: string | null;
  tutorId: string;
  area: string;
  motivo: string;
  fecha: string;
  prioridad: string;
  estado: string;
  responsableArea: string;
  siguienteAccion: string;
  fechaCita: string | null;
}

export interface MonitoreoApi {
  escuelaId: string;
  semestreId: string;
  momento: string;
  generado: string;
  resumen: ResumenMonitoreo;
  estudiantes: PersonaMonitoreo[];
  docentes: PersonaMonitoreo[];
  avanceEstudiantes: AvanceEstudiante[];
  avanceDocentes: AvanceDocente[];
  porFormato: ResumenFormato[];
  registros: Instrumento[];
  derivaciones: DerivacionMonitoreo[];
  sesiones: Sesion[];
}
