import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChartDataDialog } from './ChartDataDialog';

const originalMostrar = HTMLDialogElement.prototype.showModal;
const originalCerrar = HTMLDialogElement.prototype.close;
const originalScroll = HTMLElement.prototype.scrollTo;
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterAll(() => {
  vi.unstubAllGlobals();
  HTMLDialogElement.prototype.showModal = originalMostrar;
  HTMLDialogElement.prototype.close = originalCerrar;
  HTMLElement.prototype.scrollTo = originalScroll;
});
const tabla = {
  columnas: ['Periodo', 'Realizadas', 'Programadas'],
  filas: Array.from({ length: 10 }, (_, i) => [`Semana ${i + 1}`, i, i + 2]),
};

describe('consulta de datos de gráficos', () => {
  it('pagina los registros conservando todas las columnas y permite volver', () => {
    render(<ChartDataDialog title="Sesiones de tutoría" tabla={tabla} onClose={vi.fn()} />);
    const datos = within(screen.getByRole('table'));
    expect(datos.getAllByRole('columnheader')).toHaveLength(3);
    expect(datos.getAllByRole('row')).toHaveLength(7);
    expect(screen.getByRole('status')).toHaveTextContent('1–6 de 10');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('status')).toHaveTextContent('7–10 de 10');
    expect(datos.getByText('Semana 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(datos.getByText('Semana 1')).toBeInTheDocument();
  });
  it('ajusta la página si el servidor actualiza la cantidad de registros', () => {
    const { rerender } = render(
      <ChartDataDialog title="Sesiones" tabla={tabla} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(
      <ChartDataDialog
        title="Sesiones"
        tabla={{ ...tabla, filas: tabla.filas.slice(0, 2) }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('1–2 de 2');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('ofrece un cierre directo y muestra el estado vacío sin paginación', () => {
    const cerrar = vi.fn();
    render(
      <ChartDataDialog
        title="Formularios"
        tabla={{ columnas: ['Estado'], filas: [] }}
        onClose={cerrar}
      />,
    );
    expect(screen.getByText('Sin datos en este periodo')).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(cerrar).toHaveBeenCalledOnce();
  });
});
