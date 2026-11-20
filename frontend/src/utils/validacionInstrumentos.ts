import * as v from 'valibot';
import type { CampoFormato, DefinicionFormato } from '../types/domain';

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
const listaSchema = v.array(v.string());
const filasSchema = v.array(v.record(v.string(), v.string()));

export function listaRespuesta(valor: string): string[] {
  try {
    const resultado = v.safeParse(listaSchema, JSON.parse(valor));
    return resultado.success ? resultado.output : [];
  } catch {
    return valor ? [valor] : [];
  }
}

export function filasRespuesta(valor: string): RespuestasInstrumento[] {
  try {
    const resultado = v.safeParse(filasSchema, JSON.parse(valor));
    return resultado.success ? resultado.output : [];
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

const MENSAJE_FECHA = 'Selecciona una fecha válida.';
const fechaSchema = v.pipe(
  v.string(MENSAJE_FECHA),
  v.isoDate(MENSAJE_FECHA),
  // isoDate acepta días inexistentes (31 de febrero): se comprueba el calendario real.
  v.check((valor) => {
    const fecha = new Date(`${valor}T12:00:00Z`);
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
  }, MENSAJE_FECHA),
);
const horaSchema = v.pipe(
  v.string(),
  v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Selecciona una hora válida.'),
);
const numeroSchema = v.pipe(
  v.string(),
  v.check(
    (texto) => Boolean(texto.trim()) && Number.isFinite(Number(texto)) && Number(texto) >= 0,
    'Ingresa un número válido, igual o mayor que cero.',
  ),
);

/** Elemento de ruta de un issue personalizado: el resolver lo traduce a «campo.subcampo». */
function itemRuta(input: Record<string, unknown>, key: string): v.ObjectPathItem {
  return { type: 'object', origin: 'value', input, key, value: input[key] };
}

/** Mismas reglas para el resolver de la UI, el progreso y el adaptador de guardado. */
export function crearEsquemaRespuestas(definicion: DefinicionFormato) {
  return v.pipe(
    v.record(v.string(), v.string()),
    v.rawCheck(({ dataset, addIssue }) => {
      if (!dataset.typed) return;
      const valores = dataset.value;
      const error = (codigo: string, mensaje: string) => {
        addIssue({ message: mensaje, path: [itemRuta(valores, codigo)] });
      };
      const visibles = camposVisibles(definicion, valores);
      for (const campo of visibles) {
        const valor = valores[campo.codigo]?.trim() ?? '';
        if (!valor) {
          if (campo.obligatorio) error(campo.codigo, 'Completa esta respuesta para enviar.');
          continue;
        }
        let esquema: v.GenericSchema<string> = v.string();
        if (campo.tipo === 'numero') esquema = numeroSchema;
        else if (campo.tipo === 'fecha') esquema = fechaSchema;
        else if (campo.tipo === 'hora') esquema = horaSchema;
        else if (campo.codigo === 'correo')
          esquema = v.pipe(
            v.string('Revisa el correo electrónico.'),
            v.email('Revisa el correo electrónico.'),
          );
        else if (campo.tipo === 'texto-largo')
          esquema = v.pipe(v.string(), v.maxLength(1000, 'Usa como máximo 1000 caracteres.'));
        else if (campo.tipo === 'texto')
          esquema = v.pipe(v.string(), v.maxLength(200, 'Usa como máximo 200 caracteres.'));
        const validado = v.safeParse(esquema, valor);
        if (!validado.success) error(campo.codigo, validado.issues[0].message);
        if (campo.codigo === 'promedioSecundaria' && Number(valor) > 20)
          error(campo.codigo, 'El promedio debe estar entre 0 y 20.');
        if (campo.codigo === 'horasEstudio' && Number(valor) > 24)
          error(campo.codigo, 'Un día tiene como máximo 24 horas.');
        const opciones = campo.tipo === 'booleano' ? ['Sí', 'No'] : campo.opciones;
        let lista: string[] = [];
        if (campo.tipo === 'multiple') {
          try {
            const resultado = v.safeParse(listaSchema, JSON.parse(valor));
            if (!resultado.success) error(campo.codigo, 'Selecciona las opciones de la lista.');
            else lista = resultado.output;
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
            const resultado = v.safeParse(filasSchema, JSON.parse(valor));
            if (!resultado.success) error(campo.codigo, 'Revisa los registros de la tabla.');
            else filas = resultado.output;
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
                  (col.tipo === 'numero' && !v.safeParse(numeroSchema, contenido).success) ||
                  (col.tipo === 'fecha' && !v.safeParse(fechaSchema, contenido).success) ||
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
          else if (otro.length > 200)
            error(`${campo.codigo}__otro`, 'Usa como máximo 200 caracteres.');
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
    }),
  );
}

export function erroresInstrumento(
  definicion: DefinicionFormato,
  valores: RespuestasInstrumento,
): RespuestasInstrumento {
  const resultado = v.safeParse(crearEsquemaRespuestas(definicion), valores);
  if (resultado.success) return {};
  const errores: RespuestasInstrumento = {};
  for (const issue of resultado.issues) {
    const codigo = String(issue.path?.[0]?.key ?? 'formulario');
    errores[codigo] ??= issue.message;
  }
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
export function crearEsquemaFormulario(definicion: DefinicionFormato) {
  const esquema = crearEsquemaRespuestas(definicion);
  const tablas = new Set(
    definicion.secciones
      .flatMap((s) => s.campos)
      .filter((c) => c.tipo === 'tabla')
      .map((c) => c.codigo),
  );
  return v.pipe(
    v.object({
      respuestas: v.record(v.string(), v.string()),
      tablas: v.record(v.string(), filasSchema),
    }),
    v.rawCheck(({ dataset, addIssue }) => {
      if (!dataset.typed) return;
      const valores = dataset.value;
      const resultado = v.safeParse(esquema, serializarFormulario(valores));
      if (resultado.success) return;
      for (const issue of resultado.issues) {
        const codigo = String(issue.path?.[0]?.key);
        const grupo = tablas.has(codigo) ? 'tablas' : 'respuestas';
        addIssue({
          message: issue.message,
          path: [itemRuta(valores, grupo), itemRuta(valores[grupo], codigo)],
        });
      }
    }),
  );
}
