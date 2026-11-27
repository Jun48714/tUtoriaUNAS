import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Topbar } from '../components/layout/Topbar';
import {
  CoordPadron,
  MonitoreoAvance,
  MonitoreoDerivaciones,
  MonitoreoFormatos,
  MonitoreoSesiones,
  StudentInstrumentFill,
  StudentInstruments,
  preloadPortalRoute,
} from './portalPages';

const mockUseAuth = vi.fn();
const mockUsePortal = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/usePortal', () => ({
  usePortal: () => mockUsePortal(),
}));

describe('integración multi-rol en precarga y barra superior', () => {
  it('precarga la bandeja y el formulario al abrir un instrumento por enlace directo', () => {
    const componente = { default: () => <></> };
    const bandeja = vi.spyOn(StudentInstruments, 'preload').mockResolvedValue(componente);
    const formulario = vi.spyOn(StudentInstrumentFill, 'preload').mockResolvedValue(componente);

    preloadPortalRoute('/estudiante/instrumentos/formato-01?estado=pendiente');

    expect(bandeja).toHaveBeenCalledOnce();
    expect(formulario).toHaveBeenCalledOnce();
    bandeja.mockRestore();
    formulario.mockRestore();
  });

  it('precarga padrón de coordinación y todas las vistas de monitoreo del coordinador de escuela', () => {
    const espias = [
      vi.spyOn(CoordPadron, 'preload').mockResolvedValue({ default: () => <></> }),
      vi.spyOn(MonitoreoAvance, 'preload').mockResolvedValue({ default: () => <></> }),
      vi.spyOn(MonitoreoSesiones, 'preload').mockResolvedValue({ default: () => <></> }),
      vi.spyOn(MonitoreoFormatos, 'preload').mockResolvedValue({ default: () => <></> }),
      vi.spyOn(MonitoreoDerivaciones, 'preload').mockResolvedValue({ default: () => <></> }),
    ];

    preloadPortalRoute('/coordinacion/padron');
    preloadPortalRoute('/tutor/monitoreo');
    preloadPortalRoute('/tutor/monitoreo/sesiones');
    preloadPortalRoute('/tutor/monitoreo/formatos');
    preloadPortalRoute('/tutor/monitoreo/derivaciones');

    for (const espia of espias) {
      expect(espia).toHaveBeenCalledTimes(1);
      espia.mockRestore();
    }
  });

  it('muestra Monitoreo de escuela en Topbar y buscador solo cuando el tutor es coordinador de escuela', () => {
    mockUsePortal.mockReturnValue({
      avisosSinLeer: 0,
      notificaciones: [],
      tutorados: [],
      contadores: { sesiones: 0, observados: 0 },
    });

    mockUseAuth.mockReturnValue({
      user: {
        id: 'DOC-0421',
        name: 'Docente Coordinador',
        email: 'docente@unas.edu.pe',
        role: 'tutor',
        coordinadorEscuela: true,
      },
      logout: vi.fn(),
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/tutor/monitoreo/sesiones']}>
        <Topbar
          menuOpen={false}
          menuExpanded={true}
          onToggleMenu={vi.fn()}
          scopeHostRef={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Monitoreo de escuela')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar módulos y personas' }), {
      target: { value: 'monitoreo' },
    });
    expect(screen.getByRole('link', { name: /Monitoreo de escuela/i })).toHaveAttribute(
      'href',
      '/tutor/monitoreo',
    );
    unmount();

    mockUseAuth.mockReturnValue({
      user: {
        id: 'DOC-0422',
        name: 'Docente Regular',
        email: 'regular@unas.edu.pe',
        role: 'tutor',
        coordinadorEscuela: false,
      },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/tutor/dashboard']}>
        <Topbar
          menuOpen={false}
          menuExpanded={true}
          onToggleMenu={vi.fn()}
          scopeHostRef={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar módulos y personas' }), {
      target: { value: 'monitoreo' },
    });
    expect(screen.queryByRole('link', { name: /Monitoreo de escuela/i })).not.toBeInTheDocument();
  });
});
