import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormatoOficial } from './FormatoOficial';
import { definicionPorCodigo } from '../../data/formatos';
import { muestrasFormatos } from '../../data/muestrasFormatos';

describe('exportación de formatos publicados', () => {
  it('incluye preguntas nuevas, rótulos de opciones y columnas con la definición del envío', () => {
    const documento = {
      ...muestrasFormatos.find((d) => d.formato === 'F03')!,
      definicion: {
        ...definicionPorCodigo('F03')!,
        nombre: 'Entrevista personalizada',
        revision: 2,
        secciones: [
          {
            titulo: 'Apoyo',
            campos: [
              {
                codigo: 'nuevo',
                etiqueta: 'Apoyo elegido',
                tipo: 'seleccion' as const,
                obligatorio: true,
                opciones: ['uno'],
                rotulosOpciones: { uno: 'Acompañamiento individual' },
              },
              {
                codigo: 'tabla',
                etiqueta: 'Acuerdos personalizados',
                tipo: 'tabla' as const,
                obligatorio: false,
                columnas: [{ codigo: 'detalle', etiqueta: 'Acuerdo' }],
              },
              {
                codigo: 'oculto',
                etiqueta: 'Pregunta oculta',
                tipo: 'texto' as const,
                obligatorio: false,
                visibleSi: { campo: 'nuevo', valores: ['dos'] },
              },
            ],
          },
        ],
      },
      respuestas: { nuevo: 'uno', tabla: '[{"detalle":"Revisar el plan de estudios"}]' },
    };
    render(<FormatoOficial documento={documento} />);
    expect(screen.getByRole('heading', { name: 'Entrevista personalizada' })).toBeVisible();
    expect(screen.getByText('Acompañamiento individual')).toBeVisible();
    expect(screen.getByText('Revisar el plan de estudios')).toBeVisible();
    expect(screen.queryByText('Pregunta oculta')).not.toBeInTheDocument();
  });
});
