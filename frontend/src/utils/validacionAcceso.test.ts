import { describe, expect, it } from 'vitest';
import { validarAcceso, validarCampoAcceso } from './validacionAcceso';

describe('validación del formulario de acceso', () => {
  it('exige usuario y contraseña, y el usuario se recorta antes de validar', () => {
    expect(validarAcceso('', '')).toEqual({
      identifier: expect.stringContaining('usuario'),
      password: expect.stringContaining('contraseña'),
    });
    expect(validarCampoAcceso('identifier', '   ')).toMatch(/usuario/);
    expect(validarAcceso('  tutor@unas.edu.pe  ', 'clave')).toEqual({});
  });
  it('limita la longitud de ambos campos', () => {
    expect(validarCampoAcceso('identifier', 'a'.repeat(254))).toBeUndefined();
    expect(validarCampoAcceso('identifier', 'a'.repeat(255))).toBe(
      'El usuario es demasiado largo.',
    );
    expect(validarCampoAcceso('password', 'a'.repeat(128))).toBeUndefined();
    expect(validarCampoAcceso('password', 'a'.repeat(129))).toBe(
      'La contraseña es demasiado larga.',
    );
  });
  it('no recorta la contraseña: un espacio es un carácter válido', () => {
    expect(validarCampoAcceso('password', ' ')).toBeUndefined();
  });
});
