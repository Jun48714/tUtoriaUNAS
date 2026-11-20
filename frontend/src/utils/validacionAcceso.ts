import { API_MODE } from '../services/apiConfig';

export interface ErroresAcceso {
  identifier?: string;
  password?: string;
}

/**
 * Reglas del formulario de acceso. Son funciones simples, sin react-hook-form ni valibot, para que
 * la pantalla de login no descargue ~60 KB de JavaScript antes de mostrarse (ver LoginPage).
 */
export function validarCampoAcceso(campo: keyof ErroresAcceso, valor: string): string | undefined {
  if (campo === 'identifier') {
    const texto = valor.trim();
    if (!texto)
      return API_MODE
        ? 'Ingresa tu correo institucional o usuario.'
        : 'Ingresa tu usuario de prueba.';
    if (texto.length > 254) return 'El usuario es demasiado largo.';
    return undefined;
  }
  if (!valor) return API_MODE ? 'Ingresa tu contraseña.' : 'Ingresa tu contraseña de prueba.';
  if (valor.length > 128) return 'La contraseña es demasiado larga.';
  return undefined;
}

export function validarAcceso(identifier: string, password: string): ErroresAcceso {
  const errores: ErroresAcceso = {};
  const errorUsuario = validarCampoAcceso('identifier', identifier);
  const errorClave = validarCampoAcceso('password', password);
  if (errorUsuario) errores.identifier = errorUsuario;
  if (errorClave) errores.password = errorClave;
  return errores;
}
