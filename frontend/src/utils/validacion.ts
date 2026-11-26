import type { Role } from '../types/auth';

const CLAVES_PROHIBIDAS = new Set(['__proto__', 'prototype', 'constructor']);

// Conserva la expresión de Valibot 1.5; <input type="email"> acepta direcciones sin TLD (a@b).
export const EMAIL_REGEX = /^[\w+-]+(?:\.[\w+-]+)*@[\da-zA-Z]+(?:[.-][\da-zA-Z]+)*\.[a-zA-Z]{2,}$/u;
export const ISO_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:[12]\d|0[1-9]|3[01])$/u;
export const HORA_24_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

export function esCorreo(valor: string): boolean {
  return EMAIL_REGEX.test(valor);
}

export function esFechaIsoReal(valor: string): boolean {
  if (!ISO_DATE_REGEX.test(valor)) return false;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function esHora24(valor: string): boolean {
  return HORA_24_REGEX.test(valor);
}

export function esRol(valor: unknown): valor is Role {
  return valor === 'estudiante' || valor === 'tutor' || valor === 'coordinacion';
}

export function esModalidad(valor: unknown): valor is 'presencial' | 'virtual' | 'mixta' {
  return valor === 'presencial' || valor === 'virtual' || valor === 'mixta';
}

export function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

export function esEnteroEnRango(
  valor: unknown,
  min: number,
  max = Number.POSITIVE_INFINITY,
): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max;
}

export function leerMapaSeguro<T>(
  valor: unknown,
  validar: (item: unknown) => T | null,
): Record<string, T> | null {
  if (!esObjeto(valor)) return null;
  const entradas: Array<[string, T]> = [];
  for (const [clave, item] of Object.entries(valor)) {
    if (CLAVES_PROHIBIDAS.has(clave)) continue;
    const validado = validar(item);
    if (validado === null) return null;
    entradas.push([clave, validado]);
  }
  return Object.fromEntries(entradas);
}

export function leerMapaTextos(valor: unknown): Record<string, string> | null {
  return leerMapaSeguro(valor, (item) => (typeof item === 'string' ? item : null));
}
