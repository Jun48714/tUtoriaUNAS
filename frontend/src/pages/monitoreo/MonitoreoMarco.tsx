import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert';
import { PageHeading } from '../../components/ui/PageHeading';
import { PageLoading } from '../../components/ui/PageLoading';
import { Tabs } from '../../components/ui/Tabs';
import { DirectoryPage } from '../../components/ui/DirectoryPage';
import { escuelaDe } from '../../data/personas';
import { formatFechaHora } from '../../utils/fechas';
import { useMonitoreo } from '../../hooks/useMonitoreo';
import type { MonitoreoApi } from '../../types/monitoreo';

export type VistaMonitoreo = 'avance' | 'sesiones' | 'formatos' | 'derivaciones';

const RUTAS: Record<VistaMonitoreo, string> = {
  avance: '/tutor/monitoreo',
  sesiones: '/tutor/monitoreo/sesiones',
  formatos: '/tutor/monitoreo/formatos',
  derivaciones: '/tutor/monitoreo/derivaciones',
};

/** Encabezado y pestañas comunes del monitoreo de escuela (solo lectura). */
export function MonitoreoMarco({
  vista,
  children,
}: {
  vista: VistaMonitoreo;
  children: (datos: MonitoreoApi, ayudas: ReturnType<typeof useMonitoreo>['ayudas']) => ReactNode;
}) {
  const navigate = useNavigate();
  const monitoreo = useMonitoreo();
  const datos = monitoreo.data;
  return (
    <DirectoryPage>
      <PageHeading
        eyebrow="Coordinador de escuela"
        title="Monitoreo de escuela"
        description={
          datos
            ? `${escuelaDe(datos.escuelaId)} · ${datos.semestreId} · Solo lectura · ${formatFechaHora(datos.generado)}`
            : undefined
        }
      />
      <Tabs
        etiqueta="Vistas del monitoreo"
        activo={vista}
        onChange={(id) => navigate(RUTAS[id as VistaMonitoreo])}
        items={[
          { id: 'avance', label: 'Avance' },
          { id: 'sesiones', label: 'Sesiones' },
          { id: 'formatos', label: 'Formatos' },
          { id: 'derivaciones', label: 'Derivaciones', count: datos?.derivaciones.length },
        ]}
      />
      {monitoreo.isPending ? (
        <PageLoading />
      ) : monitoreo.isError || !datos ? (
        <Alert tone="riesgo" title="No se pudo cargar el monitoreo">
          <p>{monitoreo.error?.message ?? 'Inténtalo nuevamente.'}</p>
          <button
            type="button"
            className="btn btn-falcon-default"
            onClick={() => void monitoreo.refetch()}
          >
            Reintentar
          </button>
        </Alert>
      ) : (
        children(datos, monitoreo.ayudas)
      )}
    </DirectoryPage>
  );
}
