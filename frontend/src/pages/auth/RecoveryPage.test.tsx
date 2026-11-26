import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryPage } from './RecoveryPage';

afterEach(() => {
  vi.useRealTimers();
});

describe('recuperación de contraseña en modo demostración', () => {
  it('valida el correo, enfoca el campo al fallar, revalida al escribir y envía al corregir', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <RecoveryPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('Correo institucional');
    fireEvent.change(input, { target: { value: 'a@b' } });
    fireEvent.submit(input.closest('form')!);

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Ingresa un correo válido.');
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'ana@demo.example' } });
    expect(screen.queryByText('Ingresa un correo válido.')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');

    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('button', { name: /Enviando/ })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByRole('heading', { name: '¡Enlace enviado!' })).toBeVisible();
    expect(screen.getByText('ana@demo.example')).toBeVisible();
  });
});
