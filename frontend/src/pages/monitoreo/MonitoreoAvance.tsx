import { useMemo, useState } from 'react';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import type { Column } from '../../components/ui/DataTable';
import { DirectoryToolbar } from '../../components/ui/DirectoryToolbar';
import { DirectoryViews } from '../../components/ui/DirectoryPage';
import { MetricGroup } from '../../components/ui/MetricGroup';
import { PersonCell } from '../../components/ui/PersonCell';
import { Progress } from '../../components/ui/Progress';
import { Stat } from '../../components/ui/Stat';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { CalendarCheck, ClipboardCheck, FileText, Send, Users } from '../../components/ui/icons';
import { useFiltro } from '../../hooks/useFiltro';
import type { DefinicionSelect } from '../../hooks/useFiltro';
import { iniciales } from '../../data/personas';
import { formatFecha } from '../../utils/fechas';
import type {
  AvanceDocente,
  AvanceEstudiante,
  MonitoreoApi,
  PersonaMonitoreo,
} from '../../types/monitoreo';
import { MonitoreoMarco } from './MonitoreoMarco';

type Ayudas = {
  estudiante(id: string | null | undefined): PersonaMonitoreo | undefined;
  docente(id: string | null | undefined): PersonaMonitoreo | undefined;
  nombreDocente(id: string | null | undefined): string;
};

const ENTREVISTAS = [
  { valor: 'sin-habilitar', etiqueta: 'Sin habilitar' },
  { valor: 'no-iniciado', etiqueta: 'Sin iniciar' },
  { valor: 'borrador', etiqueta: 'En borrador' },
  { valor: 'enviado', etiqueta: 'Enviada (por revisar)' },
  { valor: 'observado', etiqueta: 'Observada' },
  { valor: 'aprobado', etiqueta: 'Aprobada' },
];

function EstadoEntrevista({ estado, avance }: { estado: string; avance: number }) {
  if (estado === 'sin-habilitar') return <Badge tone="neutro">Sin habilitar</Badge>;
  return (
    <span className="stack" style={{ gap: 2 }}>
      <StatusBadge estado={estado} />
      {estado === 'borrador' && <small className="cell-note">{avance}% completado</small>}
    </span>
  );
}

const estadoInforme = (estado: string) =>
  estado === 'sin-iniciar' ? (
    <Badge tone="neutro">Sin iniciar</Badge>
  ) : (
    <StatusBadge estado={estado} />
  );

function TablaEstudiantes({ datos, ayudas }: { datos: MonitoreoApi; ayudas: Ayudas }) {
  const selects = useMemo<DefinicionSelect<AvanceEstudiante>[]>(
    () => [
      {
        id: 'docente',
        etiqueta: 'Docente tutor',
        opciones: [...new Set(datos.avanceEstudiantes.map((a) => a.tutorId))]
          .map((id) => ({ valor: id, etiqueta: ayudas.nombreDocente(id) }))
          .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
        valorDe: (a) => a.tutorId,
      },
      {
        id: 'entrevista',
        etiqueta: 'Entrevista inicial',
        opciones: ENTREVISTAS,
        valorDe: (a) => a.entrevistaEstado,
      },
      {
        id: 'pendientes',
        etiqueta: 'Evaluaciones',
        opciones: [
          { valor: 'pendientes', etiqueta: 'Con evaluaciones pendientes' },
          { valor: 'al-dia', etiqueta: 'Al día' },
        ],
        valorDe: (a) => (a.evaluacionesPendientes > 0 ? 'pendientes' : 'al-dia'),
      },
    ],
    [datos.avanceEstudiantes, ayudas],
  );
  const buscarEn = useMemo(
    () => (a: AvanceEstudiante) => {
      const e = ayudas.estudiante(a.estudianteId);
      return `${e?.nombres ?? ''} ${e?.apellidos ?? ''} ${e?.codigo ?? ''} ${a.grupo ?? ''}`;
    },
    [ayudas],
  );
  const filtro = useFiltro(datos.avanceEstudiantes, buscarEn, selects);
  const columnas: Column<AvanceEstudiante>[] = [
    {
      key: 'estudiante',
      header: 'Estudiante',
      sortable: true,
      sortValue: (a) => ayudas.estudiante(a.estudianteId)?.apellidos ?? '',
      render: (a) => {
        const e = ayudas.estudiante(a.estudianteId);
        return e ? (
          <PersonCell
            nombres={e.nombres}
            apellidos={e.apellidos}
            detalle={`${e.codigo} · ${a.ciclo ? `Ciclo ${a.ciclo}` : 'Ciclo por confirmar'}${a.grupo ? ` · ${a.grupo}` : ''}`}
            iniciales={iniciales(e)}
            tono={a.evaluacionesPendientes > 0 ? 'dorado' : 'verde'}
          />
        ) : (
          a.estudianteId
        );
      },
    },
    {
      key: 'docente',
      header: 'Docente tutor',
      sortable: true,
      sortValue: (a) => ayudas.nombreDocente(a.tutorId),
      render: (a) => ayudas.nombreDocente(a.tutorId),
    },
    {
      key: 'entrevista',
      header: 'Entrevista inicial',
      sortable: true,
      sortValue: (a) => a.entrevistaEstado,
      render: (a) => <EstadoEntrevista estado={a.entrevistaEstado} avance={a.entrevistaAvance} />,
    },
    {
      key: 'sesiones',
      header: 'Sesiones',
      sortable: true,
      sortValue: (a) => a.sesionesAsistidas,
      render: (a) => `${a.sesionesAsistidas} asistidas`,
    },
    {
      key: 'evaluaciones',
      header: 'Evaluaciones',
      sortable: true,
      sortValue: (a) => a.evaluacionesPendientes,
      render: (a) => (
        <span className="stack" style={{ gap: 1 }}>
          <strong className="cell-strong">{a.evaluacionesEnviadas} enviadas</strong>
          {a.evaluacionesPendientes > 0 && (
            <small className="text-danger">{a.evaluacionesPendientes} pendientes</small>
          )}
        </span>
      ),
    },
    {
      key: 'formatos',
      header: 'Formatos',
      sortable: true,
      sortValue: (a) => a.formatosEnviados,
      render: (a) => a.formatosEnviados,
    },
    {
      key: 'derivaciones',
      header: 'Derivaciones',
      sortable: true,
      sortValue: (a) => a.derivaciones,
      render: (a) => a.derivaciones || '—',
    },
    {
      key: 'actividad',
      header: 'Última actividad',
      sortable: true,
      sortValue: (a) => a.ultimaActividad ?? '',
      render: (a) => formatFecha(a.ultimaActividad),
    },
  ];
  return (
    <>
      <DirectoryToolbar
        busqueda={filtro.busqueda}
        onBusqueda={filtro.setBusqueda}
        selects={selects}
        valores={filtro.valores}
        onValores={filtro.setValores}
        mostrados={filtro.filtrados.length}
        total={datos.avanceEstudiantes.length}
        onLimpiar={filtro.limpiar}
        etiqueta="Filtros de avance de estudiantes"
        placeholder="Buscar por nombre, código o grupo…"
      />
      <DataTable<AvanceEstudiante>
        rows={filtro.filtrados}
        columns={columnas}
        caption="Avance de los estudiantes con tutor asignado"
        rowKey={(a) => a.estudianteId}
        pageSize={10}
        paginationPosition="bottom"
        initialSort={{ key: 'estudiante', direction: 'asc' }}
        emptyTitle="Sin estudiantes con estos filtros"
        emptyDescription="Prueba con otro docente o estado de entrevista."
      />
    </>
  );
}

function TablaDocentes({ datos, ayudas }: { datos: MonitoreoApi; ayudas: Ayudas }) {
  const [buscar, setBuscar] = useState('');
  const filas = datos.avanceDocentes.filter((d) =>
    ayudas.nombreDocente(d.docenteId).toLowerCase().includes(buscar.trim().toLowerCase()),
  );
  const columnas: Column<AvanceDocente>[] = [
    {
      key: 'docente',
      header: 'Docente',
      sortable: true,
      sortValue: (d) => ayudas.docente(d.docenteId)?.apellidos ?? '',
      render: (d) => {
        const p = ayudas.docente(d.docenteId);
        return p ? (
          <PersonCell
            nombres={p.nombres}
            apellidos={p.apellidos}
            detalle={p.codigo || p.correo}
            iniciales={iniciales(p)}
            tono="slate"
          />
        ) : (
          d.docenteId
        );
      },
    },
    {
      key: 'tutorados',
      header: 'Tutorados',
      sortable: true,
      sortValue: (d) => d.tutorados,
      render: (d) => d.tutorados,
    },
    {
      key: 'avance',
      header: 'Avance de entrevistas',
      sortable: true,
      sortValue: (d) => (d.tutorados ? d.entrevistasEnviadas / d.tutorados : -1),
      render: (d) =>
        d.tutorados ? (
          <Progress
            valor={(100 * d.entrevistasEnviadas) / d.tutorados}
            etiqueta={`${d.entrevistasEnviadas} de ${d.tutorados}`}
          />
        ) : (
          <span className="cell-note">Sin tutorados</span>
        ),
    },
    {
      key: 'entrevistas',
      header: 'Entrevistas',
      render: (d) => (
        <span className="stack" style={{ gap: 1 }}>
          <small>{d.entrevistasAprobadas} aprobadas</small>
          {d.entrevistasObservadas > 0 && (
            <small className="text-danger">{d.entrevistasObservadas} observadas</small>
          )}
        </span>
      ),
    },
    {
      key: 'sesiones',
      header: 'Sesiones',
      sortable: true,
      sortValue: (d) => d.sesionesRealizadas,
      render: (d) => (
        <span className="stack" style={{ gap: 1 }}>
          <strong className="cell-strong">{d.sesionesRealizadas} realizadas</strong>
          <small className="cell-note">{d.sesionesProgramadas} programadas</small>
          {d.sesionesSinCerrar > 0 && (
            <small className="text-danger">{d.sesionesSinCerrar} sin cerrar</small>
          )}
        </span>
      ),
    },
    {
      key: 'formatos',
      header: 'Formatos enviados',
      sortable: true,
      sortValue: (d) => d.formatosEnviados,
      render: (d) => d.formatosEnviados,
    },
    {
      key: 'atenciones',
      header: 'Atenciones',
      sortable: true,
      sortValue: (d) => d.atenciones,
      render: (d) => d.atenciones || '—',
    },
    {
      key: 'derivaciones',
      header: 'Derivaciones',
      sortable: true,
      sortValue: (d) => d.derivaciones,
      render: (d) => d.derivaciones || '—',
    },
    {
      key: 'informes',
      header: 'Informes del semestre',
      render: (d) => (
        <span className="stack" style={{ gap: 3 }}>
          <span>F02 {estadoInforme(d.informeF02)}</span>
          <span>F09 {estadoInforme(d.autoevaluacionF09)}</span>
        </span>
      ),
    },
  ];
  return (
    <>
      <div className="directory-toolbar__search" role="search" aria-label="Buscar docente">
        <label className="directory-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar docente…"
            aria-label="Buscar docente"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </label>
      </div>
      <DataTable<AvanceDocente>
        rows={filas}
        columns={columnas}
        caption="Avance de la tutoría por docente"
        rowKey={(d) => d.docenteId}
        pageSize={10}
        paginationPosition="bottom"
        initialSort={{ key: 'docente', direction: 'asc' }}
        emptyTitle="Sin docentes"
        emptyDescription="Prueba con otro nombre."
      />
    </>
  );
}

/** Avance de estudiantes y docentes de la escuela (solo lectura). */
export function MonitoreoAvance() {
  const [vista, setVista] = useState<'estudiantes' | 'docentes'>('estudiantes');
  return (
    <MonitoreoMarco vista="avance">
      {(datos, ayudas) => {
        const r = datos.resumen;
        const porcentaje = r.conTutor
          ? Math.round((100 * r.entrevistasCompletadas) / r.conTutor)
          : 0;
        return (
          <>
            <MetricGroup label="Resumen de la escuela">
              <Stat
                label="Estudiantes con tutor"
                value={`${r.conTutor} / ${r.estudiantes}`}
                note="estudiantes de la escuela con docente asignado"
                icon={<Users aria-hidden="true" />}
              />
              <Stat
                label="Entrevistas completadas"
                value={`${porcentaje}%`}
                note={`${r.entrevistasCompletadas} de ${r.conTutor} · ${r.entrevistasPendientes} pendientes`}
                icon={<ClipboardCheck aria-hidden="true" />}
                ratio={porcentaje}
              />
              <Stat
                label="Docentes con tutorados"
                value={`${r.docentesConTutorados} / ${r.docentes}`}
                note="docentes con estudiantes asignados"
                icon={<Users aria-hidden="true" />}
              />
              <Stat
                label="Sesiones"
                value={r.sesionesRealizadas}
                note={`${r.sesionesProgramadas} programadas`}
                icon={<CalendarCheck aria-hidden="true" />}
              />
              <Stat
                label="Formatos enviados"
                value={r.formatosEnviados}
                note="enviados o aprobados en el semestre"
                icon={<FileText aria-hidden="true" />}
              />
              <Stat
                label="Derivaciones"
                value={r.derivaciones}
                note="fichas de derivación enviadas"
                icon={<Send aria-hidden="true" />}
                tone="dorado"
              />
            </MetricGroup>
            <Card>
              <CardHead
                title="Avance de la tutoría"
                description="Estado de cada estudiante y de cada docente en el semestre. Solo lectura."
              />
              <CardBody>
                <div className="stack">
                  <DirectoryViews
                    views={[
                      {
                        label: 'Estudiantes',
                        count: datos.avanceEstudiantes.length,
                        active: vista === 'estudiantes',
                        onClick: () => setVista('estudiantes'),
                      },
                      {
                        label: 'Docentes',
                        count: datos.avanceDocentes.length,
                        active: vista === 'docentes',
                        onClick: () => setVista('docentes'),
                      },
                    ]}
                  />
                  {vista === 'estudiantes' ? (
                    <TablaEstudiantes datos={datos} ayudas={ayudas} />
                  ) : (
                    <TablaDocentes datos={datos} ayudas={ayudas} />
                  )}
                </div>
              </CardBody>
            </Card>
          </>
        );
      }}
    </MonitoreoMarco>
  );
}
