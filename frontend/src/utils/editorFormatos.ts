import type { CampoFormato, DefinicionFormato } from '../types/domain';

export const tiposPregunta: { id: CampoFormato['tipo']; nombre: string }[] = [
  { id: 'texto', nombre: 'Texto corto' },
  { id: 'texto-largo', nombre: 'Texto largo' },
  { id: 'seleccion', nombre: 'Lista desplegable' },
  { id: 'escala', nombre: 'Opción única' },
  { id: 'multiple', nombre: 'Varias opciones' },
  { id: 'booleano', nombre: 'Sí / No' },
  { id: 'numero', nombre: 'Número' },
  { id: 'fecha', nombre: 'Fecha' },
  { id: 'hora', nombre: 'Hora' },
  { id: 'tabla', nombre: 'Tabla de respuestas' },
];
export const usaOpciones = (tipo: CampoFormato['tipo']) =>
  ['seleccion', 'escala', 'multiple'].includes(tipo);
export function cambiarTipo(campo: CampoFormato, tipo: CampoFormato['tipo']): CampoFormato {
  return {
    codigo: campo.codigo,
    etiqueta: campo.etiqueta,
    obligatorio: campo.obligatorio,
    ayuda: campo.ayuda,
    personalizado: campo.personalizado,
    tipo,
    ...(usaOpciones(tipo)
      ? { opciones: campo.opciones?.length ? campo.opciones : ['Opción 1', 'Opción 2'] }
      : {}),
    ...(tipo === 'tabla'
      ? {
          columnas: campo.columnas ?? [
            { codigo: 'columna1', etiqueta: 'Respuesta', tipo: 'texto' },
          ],
        }
      : {}),
  };
}
export function mover<T>(elementos: readonly T[], posicion: number, desplazamiento: number): T[] {
  const destino = posicion + desplazamiento;
  if (destino < 0 || destino >= elementos.length) return [...elementos];
  const copia = [...elementos];
  const [elemento] = copia.splice(posicion, 1);
  copia.splice(destino, 0, elemento!);
  return copia;
}
export function reemplazarPregunta(
  definicion: DefinicionFormato,
  codigo: string,
  siguiente: CampoFormato,
) {
  return {
    ...definicion,
    secciones: definicion.secciones.map((s) => ({
      ...s,
      campos: s.campos.map((c) => (c.codigo === codigo ? siguiente : c)),
    })),
  };
}
export function quitarPregunta(definicion: DefinicionFormato, codigo: string): DefinicionFormato {
  return {
    ...definicion,
    secciones: definicion.secciones.map((s) => ({
      ...s,
      campos: s.campos
        .filter((c) => c.codigo !== codigo)
        .map((c) => {
          if (c.visibleSi?.campo !== codigo) return c;
          const { visibleSi: condicionEliminada, ...resto } = c;
          void condicionEliminada;
          return resto;
        }),
    })),
  };
}
export function nuevaPregunta(): CampoFormato {
  return {
    codigo: `pregunta_${crypto.randomUUID().replaceAll('-', '')}`,
    etiqueta: 'Nueva pregunta',
    tipo: 'texto',
    obligatorio: false,
    personalizado: true,
  };
}
