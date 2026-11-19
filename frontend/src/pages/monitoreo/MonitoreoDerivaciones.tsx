import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import type { Column } from '../../components/ui/DataTable';
import { DirectoryToolbar } from '../../components/ui/DirectoryToolbar';
import { PersonCell } from '../../components/ui/PersonCell';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useFiltro } from '../../hooks/useFiltro';
import type { DefinicionSelect } from '../../hooks/useFiltro';
import { iniciales } from '../../data/personas';
import { formatFecha } from '../../utils/fechas';
import type { DerivacionMonitoreo, MonitoreoApi } from '../../types/monitoreo';
import { MonitoreoMarco } from './MonitoreoMarco';

type Ayudas = Parameters<Parameters<typeof MonitoreoMarco>[0]['children']>[1];

function Tabla({ datos, ayudas }: { datos: MonitoreoApi; ayudas: Ayudas }) {
  const selects = useMemo<DefinicionSelect<DerivacionMonitoreo>[]>(
    () => [
      {
        id: 'estado',
        etiqueta: 'Estado',
        opciones: [...new Set(datos.derivaciones.map((d) => d.estado))].map((valor) => ({
          valor,
          etiqueta: valor,
        })),
        valorDe: (d) => d.estado,
      },
      {
        id: 'area',
        etiqueta: 'Área',
        opciones: [...new Set(datos.derivaciones.map((d) => d.area).filter(Boolean))].map(
          (valor) => ({ valor, etiqueta: valor }),
        ),
        valorDe: (d) => d.area,
      },
      {
        id: 'prioridad',
        etiqueta: 'Prioridad',
        opciones: [
          { valor: 'alta', etiqueta: 'Alta' },
          { valor: 'media', etiqueta: 'Media' },
          { valor: 'baja', etiqueta: 'Baja' },
        ],
        valorDe: (d) => d.prioridad,
      },
    ],
    [datos.derivaciones],
  );
  const buscarEn = useMemo(
    () => (d: DerivacionMonitoreo) =>
      `${ayudas.nombreEstudiante(d.estudianteId)} ${ayudas.nombreDocente(d.tutorId)} ${d.area} ${d.motivo}`,
    [ayudas],
  );
  const filtro = useFiltro(datos.derivaciones, buscarEn, selects);
  const columnas: Column<DerivacionMonitoreo>[] = [
    {
      key: 'estudiante',
      header: 'Estudiante',
      sortable: true,
      sortValue: (d) => ayudas.nombreEstudiante(d.estudianteId),
      render: (d) => {
        const e = ayudas.estudiante(d.estudianteId);
        return e ? (
          <PersonCell
            nombres={e.nombres}
            apellidos={e.apellidos}
            detalle={e.codigo}
            iniciales={iniciales(e)}
          />
        ) : (
          '—'
        );
      },
    },
    {
      key: 'docente',
      header: 'Derivó',
      sortable: true,
      sortValue: (d) => ayudas.nombreDocente(d.tutorId),
      render: (d) => ayudas.nombreDocente(d.tutorId),
    },
    {
      key: 'area',
      header: 'Área y motivo',
      sortable: true,
      sortValue: (d) => d.area,
      render: (d) => (
        <span className="stack" style={{ gap: 1 }}>
          <strong className="cell-strong">{d.area || 'Sin área'}</strong>
          <small className="cell-note">{d.motivo || 'Sin motivo indicado'}</small>
        </span>
      ),
    },
    {
      key: 'prioridad',
      header: 'Prioridad',
      sortable: true,
      sortValue: (d) => d.prioridad,
      render: (d) => <StatusBadge estado={d.prioridad} />,
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      sortValue: (d) => d.estado,
      render: (d) => <StatusBadge estado={d.estado} />,
    },
    {
      key: 'fecha',
      header: 'Fecha',
      sortable: true,
      sortValue: (d) => d.fecha,
      render: (d) => formatFecha(d.fecha),
    },
    {
      key: 'seguimiento',
      header: 'Seguimiento',
      render: (d) => (
        <span className="stack" style={{ gap: 1 }}>
          <small>{d.siguienteAccion}</small>
          <small className="cell-note">
            {d.responsableArea}
            {d.fechaCita ? ` · cita ${formatFecha(d.fechaCita)}` : ''}
          </small>
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Formato',
      render: (d) => (
        <Link
          className="btn btn-falcon-default btn-sm"
          to={`/tutor/monitoreo/formatos?formato=F12&doc=${encodeURIComponent(d.id)}`}
        >
          Ver ficha
        </Link>
      ),
    },
  ];
  return (
    <div className="stack">
      <DirectoryToolbar
        busqueda={filtro.busqueda}
        onBusqueda={filtro.setBusqueda}
        selects={selects}
        valores={filtro.valores}
        onValores={filtro.setValores}
        mostrados={filtro.filtrados.length}
        total={datos.derivaciones.length}
        onLimpiar={filtro.limpiar}
        etiqueta="Filtros de derivaciones"
        placeholder="Buscar por estudiante, docente o área…"
      />
      <DataTable<DerivacionMonitoreo>
        rows={filtro.filtrados}
        columns={columnas}
        caption="Derivaciones registradas por los docentes de la escuela"
        rowKey={(d) => d.id}
        pageSize={10}
        paginationPosition="bottom"
        inlineActions
        initialSort={{ key: 'fecha', direction: 'desc' }}
        emptyTitle="Sin derivaciones"
        emptyDescription="Aparecerán cuando un docente derive a un estudiante."
      />
    </div>
  );
}

/** Derivaciones de los docentes de la escuela y su seguimiento (solo lectura). */
export function MonitoreoDerivaciones() {
  return (
    <MonitoreoMarco vista="derivaciones">
      {(datos, ayudas) => (
        <Card>
          <CardHead title="Derivaciones" />
          <CardBody>
            <Tabla datos={datos} ayudas={ayudas} />
          </CardBody>
        </Card>
      )}
    </MonitoreoMarco>
  );
}
