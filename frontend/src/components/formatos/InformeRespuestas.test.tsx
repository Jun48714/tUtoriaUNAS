import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { definicionPorCodigo } from '../../data/formatos';
import { InformeRespuestas } from './InformeRespuestas';

describe('InformeRespuestas', () => {
  const definicion = {
    ...definicionPorCodigo('F01')!,
    secciones: [
      {
        titulo: 'Actividad',
        campos: [
          { codigo: 'nombre', etiqueta: 'Nombre', tipo: 'texto' as const, obligatorio: false },
          {
            codigo: 'actividades',
            etiqueta: 'Actividades',
            tipo: 'tabla' as const,
            obligatorio: false,
            columnas: [
              { codigo: 'meta', etiqueta: 'Meta' },
              { codigo: 'evidencia', etiqueta: 'Evidencia' },
            ],
          },
        ],
      },
    ],
  };

  it('permite recorrer preguntas y registros sin comprimir ni perder valores', () => {
    render(
      <InformeRespuestas
        definicion={definicion}
        respuestas={{
          nombre: 'Escuela',
          actividades: JSON.stringify([
            { meta: 'Primera meta', evidencia: 'Acta' },
            { meta: 'Segunda meta', evidencia: '' },
          ]),
        }}
      />,
    );
    expect(screen.getByText('Escuela')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Registro 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Primera meta')).toBeInTheDocument();
    expect(screen.queryByText('Segunda meta')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registro siguiente' }));
    expect(screen.getByText('Registro 2 de 2')).toBeInTheDocument();
    expect(screen.getByText('Segunda meta')).toBeInTheDocument();
    const registro = screen.getByText('Segunda meta').closest('dl')!;
    expect(within(registro).getByText('Evidencia')).toBeInTheDocument();
    expect(within(registro).getByText('—')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registro anterior' }));
    expect(screen.getByText('Acta')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Seleccionar pregunta' }), {
      target: { value: '0' },
    });
    expect(screen.getByText('Escuela')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando una tabla no tiene registros', () => {
    render(<InformeRespuestas definicion={definicion} respuestas={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Sin registros')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registro siguiente' })).not.toBeInTheDocument();
  });
});
