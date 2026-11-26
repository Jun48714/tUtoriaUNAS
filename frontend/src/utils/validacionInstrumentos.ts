import { get, set } from 'react-hook-form';
import type { FieldError, FieldErrors, Resolver } from 'react-hook-form';
import type { CampoFormato, DefinicionFormato } from '../types/domain';
import { esCorreo, esFechaIsoReal, esHora24, leerMapaTextos } from './validacion';

export type RespuestasInstrumento = Record<string, string>;
export interface ValoresFormularioInstrumento {
  respuestas: RespuestasInstrumento;
  tablas: Record<string, RespuestasInstrumento[]>;
}

export const OPCIONES_EXCLUSIVAS = [
  'Ninguna',
  'Ninguno',
  'Solo estudio',
  'Aún ninguno',
  'No he tenido',
  'No',
  'Prefiero conversarlo con mi tutor',
];

function leerListaTextos(valor: unknown): string[] | null {
  return Array.isArray(valor) && valor.every((item) => typeof item === 'string') ? valor : null;
}

function leerFilas(valor: unknown): RespuestasInstrumento[] | null {
  if (!Array.isArray(valor)) return null;
  const filas: RespuestasInstrumento[] = [];
  for (const item of valor) {
    const fila = leerMapaTextos(item);
    if (!fila) return null;
    filas.push(fila);
  }
  return filas;
}

function esNumeroNoNegativo(texto: string): boolean {
  return Boolean(texto.trim()) && Number.isFinite(Number(texto)) && Number(texto) >= 0;
}

export function listaRespuesta(valor: string): string[] {
  try {
    return leerListaTextos(JSON.parse(valor)) ?? [];
  } catch {
    return valor ? [valor] : [];
  }
}

export function filasRespuesta(valor: string): RespuestasInstrumento[] {
  try {
    return leerFilas(JSON.parse(valor)) ?? [];
  } catch {
    return [];
  }
}

export function campoVisible(campo: CampoFormato, valores: RespuestasInstrumento): boolean {
  return !campo.visibleSi || campo.visibleSi.valores.includes(valores[campo.visibleSi.campo] ?? '');
}
export function camposVisibles(definicion: DefinicionFormato, valores: RespuestasInstrumento) {
  return definicion.secciones.flatMap((s) => s.campos).filter((c) => campoVisible(c, valores));
}
export function fechaTutoria(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
}

/** Mismas reglas para el resolver de la UI, el progreso y el adaptador de guardado. */
export function erroresInstrumento(
  definicion: DefinicionFormato,
  valores: RespuestasInstrumento,
): RespuestasInstrumento {
  const errores: RespuestasInstrumento = {};
  const error = (codigo: string, mensaje: string) => {
    errores[codigo] ??= mensaje;
  };
  const visibles = camposVisibles(definicion, valores);
  for (const campo of visibles) {
    const valor = valores[campo.codigo]?.trim() ?? '';
    if (!valor) {
      if (campo.obligatorio) error(campo.codigo, 'Completa esta respuesta para enviar.');
      continue;
    }
    if (campo.tipo === 'numero' && !esNumeroNoNegativo(valor))
      error(campo.codigo, 'Ingresa un número válido, igual o mayor que cero.');
    else if (campo.tipo === 'fecha' && !esFechaIsoReal(valor))
      error(campo.codigo, 'Selecciona una fecha válida.');
    else if (campo.tipo === 'hora' && !esHora24(valor))
      error(campo.codigo, 'Selecciona una hora válida.');
    else if (campo.codigo === 'correo' && !esCorreo(valor))
      error(campo.codigo, 'Revisa el correo electrónico.');
    else if (campo.tipo === 'texto-largo' && valor.length > 1000)
      error(campo.codigo, 'Usa como máximo 1000 caracteres.');
    else if (campo.tipo === 'texto' && valor.length > 200)
      error(campo.codigo, 'Usa como máximo 200 caracteres.');

    if (campo.codigo === 'promedioSecundaria' && Number(valor) > 20)
      error(campo.codigo, 'El promedio debe estar entre 0 y 20.');
    if (campo.codigo === 'horasEstudio' && Number(valor) > 24)
      error(campo.codigo, 'Un día tiene como máximo 24 horas.');

    const opciones = campo.tipo === 'booleano' ? ['Sí', 'No'] : campo.opciones;
    let lista: string[] = [];
    if (campo.tipo === 'multiple') {
      try {
        const parsed = leerListaTextos(JSON.parse(valor));
        if (!parsed) error(campo.codigo, 'Selecciona las opciones de la lista.');
        else lista = parsed;
      } catch {
        // Las primeras versiones guardaban una selección múltiple como texto simple.
        lista = [valor];
      }
      if (campo.obligatorio && !lista.length)
        error(campo.codigo, 'Completa esta respuesta para enviar.');
      if (
        new Set(lista).size !== lista.length ||
        (lista.length > 1 && lista.some((opcion) => OPCIONES_EXCLUSIVAS.includes(opcion)))
      )
        error(
          campo.codigo,
          'Revisa las opciones: no combines respuestas excluyentes ni las repitas.',
        );
    }
    if (
      opciones?.length &&
      campo.tipo !== 'tabla' &&
      (campo.tipo === 'multiple'
        ? lista.some((opcion) => !opciones.includes(opcion))
        : !opciones.includes(valor))
    )
      error(campo.codigo, 'Selecciona una opción válida de la lista.');
    if (campo.tipo === 'tabla') {
      let filas: RespuestasInstrumento[] = [];
      try {
        const parsed = leerFilas(JSON.parse(valor));
        if (!parsed) error(campo.codigo, 'Revisa los registros de la tabla.');
        else filas = parsed;
      } catch {
        error(campo.codigo, 'Revisa los registros de la tabla.');
      }
      if (
        (campo.obligatorio && !filas.length) ||
        filas.some((fila) =>
          campo.columnas?.some((col) => {
            const contenido = fila[col.codigo]?.trim() ?? '';
            return (
              !contenido ||
              (col.tipo === 'numero' && !esNumeroNoNegativo(contenido)) ||
              (col.tipo === 'fecha' && !esFechaIsoReal(contenido)) ||
              (col.tipo === 'seleccion' && !col.opciones?.includes(contenido))
            );
          }),
        )
      )
        error(campo.codigo, 'Completa las columnas de cada fila o elimina la fila vacía.');
      if (
        campo.codigo === 'administracionTiempo' &&
        filas.reduce((total, fila) => total + Number(fila.horas || 0), 0) > 24
      )
        error(campo.codigo, 'Revisa las horas: el total de un día no puede superar 24.');
      if (campo.codigo === 'asistentes') {
        const ids = filas.map((f) => f.estudianteId || f.nombre?.trim()).filter(Boolean);
        if (new Set(ids).size !== ids.length)
          error(campo.codigo, 'No repitas al mismo estudiante en la asistencia.');
      }
    }
    if (opciones?.includes('Otro') && (valor === 'Otro' || lista.includes('Otro'))) {
      const otro = valores[`${campo.codigo}__otro`]?.trim() ?? '';
      if (!otro) error(`${campo.codigo}__otro`, 'Indica brevemente tu otra respuesta.');
      else if (otro.length > 200) error(`${campo.codigo}__otro`, 'Usa como máximo 200 caracteres.');
    }
  }
  const codigos = new Set(visibles.map((c) => c.codigo));
  if (
    codigos.has('horaFin') &&
    valores.horaInicio &&
    valores.horaFin &&
    valores.horaFin <= valores.horaInicio
  )
    error('horaFin', 'La hora de fin debe ser posterior al inicio.');
  if (valores.resultado === 'Se programa nueva cita para seguimiento') {
    if (valores.proximaCita && valores.proximaCita < fechaTutoria())
      error('proximaCita', 'La cita de seguimiento no puede estar en el pasado.');
    if (valores.horaCita && valores.horaFinCita && valores.horaFinCita <= valores.horaCita)
      error('horaFinCita', 'La hora de fin debe ser posterior al inicio.');
  }
  if (
    ['F06', 'F07', 'F08', 'F12'].includes(definicion.codigo) &&
    valores.fecha &&
    valores.fecha > fechaTutoria()
  )
    error('fecha', 'Registra una atención ya realizada; la fecha no puede ser futura.');

  return errores;
}

/** Se normalizan las tablas solo en el editor; el contrato guardado sigue siendo compatible. */
export function deserializarFormulario(
  definicion: DefinicionFormato,
  valores: RespuestasInstrumento,
): ValoresFormularioInstrumento {
  const respuestas = { ...valores };
  const tablas: ValoresFormularioInstrumento['tablas'] = {};
  for (const campo of definicion.secciones.flatMap((s) => s.campos)) {
    if (campo.tipo !== 'tabla') continue;
    tablas[campo.codigo] = filasRespuesta(valores[campo.codigo] ?? '');
    delete respuestas[campo.codigo];
  }
  return { respuestas, tablas };
}
export function serializarFormulario(valores: ValoresFormularioInstrumento): RespuestasInstrumento {
  return {
    ...valores.respuestas,
    ...Object.fromEntries(
      Object.entries(valores.tablas).map(([codigo, filas]) => [
        codigo,
        filas.length ? JSON.stringify(filas) : '',
      ]),
    ),
  };
}
export function crearResolverFormulario(
  definicion: DefinicionFormato,
): Resolver<ValoresFormularioInstrumento> {
  const tablas = new Set(
    definicion.secciones
      .flatMap((s) => s.campos)
      .filter((c) => c.tipo === 'tabla')
      .map((c) => c.codigo),
  );
  return async (valores, _context, options) => {
    const encontrados = erroresInstrumento(definicion, serializarFormulario(valores));
    const entradas = Object.entries(encontrados);
    if (!entradas.length) return { values: valores, errors: {} };
    const errors: FieldErrors<ValoresFormularioInstrumento> = {};
    const nombres = options.names ?? [];
    for (const [codigo, message] of entradas) {
      const grupo = tablas.has(codigo) ? 'tablas' : 'respuestas';
      const ruta = `${grupo}.${codigo}`;
      const field = get(options.fields, ruta) as
        { ref?: FieldError['ref']; refs?: Array<FieldError['ref']> } | undefined;
      const errorCampo: FieldError = {
        type: 'validate',
        message,
        ref: field?.refs?.[0] ?? field?.ref,
      };
      if (
        grupo === 'tablas' &&
        nombres.some(
          (nombre) =>
            nombre.startsWith(`${ruta}.`) && /^\d+(?:\.|$)/.test(nombre.slice(ruta.length + 1)),
        )
      ) {
        set(errors, `${ruta}.root`, errorCampo);
      } else {
        set(errors, ruta, errorCampo);
      }
    }
    return { values: {}, errors };
  };
}
