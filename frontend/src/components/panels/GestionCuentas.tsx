import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, CardHead } from '../ui/Card';
import { Sheet } from '../ui/Sheet';
import { Alert } from '../ui/Alert';
import { Badge, type TonoBadge } from '../ui/StatusBadge';
import { DataTable, type Column } from '../ui/DataTable';
import { DirectoryToolbar } from '../ui/DirectoryToolbar';
import { DirectoryViews } from '../ui/DirectoryPage';
import { PersonCell } from '../ui/PersonCell';
import { apiJson } from '../../services/apiClient';
import { refrescarApi } from '../../services/apiTutoria';
import type { CuentaAdmin, CuentaCreada } from '../../services/cuentas';
import { usePermiso } from '../../hooks/usePermiso';
import { useFiltro, type DefinicionSelect } from '../../hooks/useFiltro';
import type { Role } from '../../types/auth';
import { CrearCuenta } from './CrearCuenta';
import { useSistema } from '../../hooks/useSistema';
import { useAuth } from '../../hooks/useAuth';
import { escuelaDe } from '../../data/personas';

const perfiles: Record<Role, string> = {
  estudiante: 'Estudiante',
  tutor: 'Docente',
  coordinacion: 'Coordinación',
};
const vistas: { rol: Role; etiqueta: string }[] = [
  { rol: 'estudiante', etiqueta: 'Estudiantes' },
  { rol: 'tutor', etiqueta: 'Docentes' },
  { rol: 'coordinacion', etiqueta: 'Coordinación' },
];
const correoTexto: Record<string, string> = {
  enviado: 'Enviado',
  pendiente: 'En cola',
  'no-entregado': 'No entregado',
  'sin-envio': '—',
};
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
const estadoAcceso = (c: CuentaAdmin) =>
  c.pendienteVinculacion ? 'pendiente' : c.activo ? 'habilitada' : 'deshabilitada';
const estadoVerificacion = (c: CuentaAdmin) =>
  c.verificada === null ? 'prueba' : c.verificada ? 'verificada' : 'pendiente';
export function GestionCuentas() {
  const queryClient = useQueryClient();
  const institucional = Boolean(useSistema()?.periodosEscuela?.length);
  const consulta = useQuery({
    queryKey: ['cuentas-administracion'],
    queryFn: () => apiJson<CuentaAdmin[]>('/api/cuentas'),
  });
  const [vista, setVista] = useState<Role>('estudiante');
  const [crear, setCrear] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [renovada, setRenovada] = useState<CuentaCreada | null>(null);
  const puedeCrear = usePermiso('cuentas', 'crear');
  const esAdmin = Boolean(useAuth().user?.adminInstitucional);
  async function actualizar() {
    await queryClient.invalidateQueries({ queryKey: ['cuentas-administracion'] });
    await refrescarApi();
  }
  async function accion(cuenta: CuentaAdmin, vincular = false) {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await apiJson(
        `/api/cuentas/${encodeURIComponent(cuenta.id)}/${vincular ? 'vinculacion' : 'estado'}`,
        'PUT',
        { version: cuenta.version, activo: !cuenta.activo },
      );
      await actualizar();
      setMensaje(vincular ? 'Cuenta vinculada a tu escuela.' : 'Acceso actualizado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la cuenta.');
    } finally {
      setOcupado(false);
    }
  }
  async function designarCoordinador(c: CuentaAdmin) {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await apiJson(`/api/cuentas/${encodeURIComponent(c.id)}/coordinador-escuela`, 'PUT', {
        version: c.version,
        activo: !c.coordinadorEscuela,
      });
      await actualizar();
      setMensaje(
        c.coordinadorEscuela
          ? 'Se retiró la designación. Ya no verá el monitoreo.'
          : 'Docente designado coordinador de escuela. Debe volver a iniciar sesión para ver el monitoreo.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la designación.');
    } finally {
      setOcupado(false);
    }
  }
  async function renovar(c: CuentaAdmin) {
    setOcupado(true);
    setError('');
    try {
      const result = await apiJson<CuentaCreada>(
        `/api/cuentas/${encodeURIComponent(c.id)}/temporal`,
        'POST',
        { version: c.version },
      );
      setRenovada(result);
      await actualizar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo renovar el acceso.');
    } finally {
      setOcupado(false);
    }
  }
  const todas = useMemo(() => consulta.data ?? [], [consulta.data]);
  const cuentasDeVista = useMemo(() => todas.filter((c) => c.rol === vista), [todas, vista]);
  const selects = useMemo<DefinicionSelect<CuentaAdmin>[]>(
    () => [
      {
        id: 'acceso',
        etiqueta: 'Acceso',
        opciones: [
          { valor: 'habilitada', etiqueta: 'Habilitada' },
          { valor: 'deshabilitada', etiqueta: 'Deshabilitada' },
          { valor: 'pendiente', etiqueta: 'Escuela pendiente' },
        ],
        valorDe: estadoAcceso,
      },
      {
        id: 'verificacion',
        etiqueta: 'Verificación',
        opciones: [
          { valor: 'verificada', etiqueta: 'Verificada' },
          { valor: 'pendiente', etiqueta: 'Pendiente de verificar' },
          { valor: 'prueba', etiqueta: 'Cuenta de prueba' },
        ],
        valorDe: estadoVerificacion,
      },
      ...(institucional
        ? [
            {
              id: 'escuela',
              etiqueta: 'Escuela',
              opciones: Array.from(
                new Set(cuentasDeVista.flatMap((c) => (c.escuelaId ? [c.escuelaId] : []))),
                (id) => ({ valor: id, etiqueta: escuelaDe(id) }),
              ),
              valorDe: (c: CuentaAdmin) => c.escuelaId ?? '',
            },
          ]
        : []),
    ],
    [institucional, cuentasDeVista],
  );
  const buscarEn = useMemo(
    () => (c: CuentaAdmin) =>
      `${c.nombre} ${c.correo} ${c.identifier} ${c.escuelaId ? escuelaDe(c.escuelaId) : ''}`,
    [],
  );
  const filtro = useFiltro(cuentasDeVista, buscarEn, selects);
  const conteo = (rol: Role) => todas.filter((c) => c.rol === rol).length;
  const sinVistaVacia = vistas.filter(
    (v) => v.rol !== 'coordinacion' || conteo('coordinacion') > 0,
  );

  const columnas: Column<CuentaAdmin>[] = [
    {
      key: 'cuenta',
      header:
        vista === 'estudiante' ? 'Estudiante' : vista === 'tutor' ? 'Docente' : 'Coordinación',
      sortable: true,
      sortValue: (c) => c.nombre,
      render: (c) => (
        <PersonCell
          nombres={c.nombre}
          detalle={`${
            institucional
              ? `${c.correo} · ${c.escuelaId ? escuelaDe(c.escuelaId) : 'Sin escuela vinculada'}`
              : c.correo
          }${c.coordinadorEscuela ? ' · Coordinador de escuela' : ''}`}
          iniciales={iniciales(c.nombre)}
          tono={c.pendienteVinculacion ? 'dorado' : c.activo ? 'verde' : 'slate'}
        />
      ),
    },
    {
      key: 'verificacion',
      header: 'Verificación',
      sortable: true,
      sortValue: estadoVerificacion,
      render: (c) => {
        const tono: TonoBadge = c.verificada ? 'ok' : c.verificada === false ? 'alerta' : 'neutro';
        return (
          <Badge tone={tono}>
            {c.verificada === null
              ? 'Cuenta de prueba'
              : c.verificada
                ? 'Verificada'
                : 'Pendiente de verificar'}
          </Badge>
        );
      },
    },
    {
      key: 'estado',
      header: 'Acceso',
      sortable: true,
      sortValue: estadoAcceso,
      render: (c) => {
        const estado = estadoAcceso(c);
        return (
          <Badge
            tone={estado === 'habilitada' ? 'ok' : estado === 'pendiente' ? 'alerta' : 'riesgo'}
          >
            {estado === 'habilitada'
              ? 'Habilitada'
              : estado === 'pendiente'
                ? 'Escuela pendiente'
                : 'Deshabilitada'}
          </Badge>
        );
      },
    },
    {
      key: 'correo',
      header: 'Último correo',
      sortable: true,
      sortValue: (c) => c.correoEstado,
      render: (c) => <span className="cell-note">{correoTexto[c.correoEstado] ?? '—'}</span>,
    },
    {
      key: 'acciones',
      header: 'Acción',
      render: (c) =>
        c.propia ? (
          <span className="cell-note">Tu cuenta</span>
        ) : (
          <span className="cell-actions">
            <button
              className="btn btn-falcon-default btn-sm"
              type="button"
              disabled={ocupado || (institucional && c.pendienteVinculacion)}
              aria-label={`${c.pendienteVinculacion ? 'Vincular a mi escuela' : c.activo ? 'Deshabilitar' : 'Habilitar'} · ${c.identifier}`}
              title={
                institucional && c.pendienteVinculacion
                  ? 'Selecciona la escuela de destino en Ámbito'
                  : undefined
              }
              onClick={() => void accion(c, c.pendienteVinculacion)}
            >
              {c.pendienteVinculacion
                ? 'Vincular a mi escuela'
                : c.activo
                  ? 'Deshabilitar'
                  : 'Habilitar'}
            </button>
            {esAdmin && c.rol === 'tutor' && c.activo && !c.pendienteVinculacion && (
              <button
                type="button"
                className="btn btn-link btn-sm"
                disabled={ocupado}
                onClick={() => void designarCoordinador(c)}
              >
                {c.coordinadorEscuela
                  ? 'Quitar coordinador de escuela'
                  : 'Designar coordinador de escuela'}
              </button>
            )}
            {c.verificada === false && c.activo && (
              <button
                type="button"
                className="btn btn-link btn-sm"
                disabled={ocupado}
                onClick={() => void renovar(c)}
              >
                Renovar acceso temporal
              </button>
            )}
          </span>
        ),
    },
  ];
  return (
    <>
      <Card>
        <CardHead
          title="Cuentas de acceso"
          actions={
            puedeCrear && (
              <button type="button" className="btn btn-primary" onClick={() => setCrear(true)}>
                <i className="fa-solid fa-user-plus" aria-hidden="true" /> Crear cuenta
              </button>
            )
          }
        />
        <CardBody>
          {consulta.isPending ? (
            <p role="status">Cargando cuentas…</p>
          ) : consulta.isError ? (
            <Alert tone="riesgo" title="No se pudieron cargar las cuentas">
              <p>{consulta.error.message}</p>
              <button
                type="button"
                className="btn btn-falcon-default"
                onClick={() => void consulta.refetch()}
              >
                Reintentar
              </button>
            </Alert>
          ) : (
            <div className="stack">
              <DirectoryToolbar
                busqueda={filtro.busqueda}
                onBusqueda={filtro.setBusqueda}
                selects={selects}
                valores={filtro.valores}
                onValores={filtro.setValores}
                mostrados={filtro.filtrados.length}
                total={cuentasDeVista.length}
                onLimpiar={filtro.limpiar}
                etiqueta={`Filtros de cuentas de ${perfiles[vista].toLowerCase()}`}
                placeholder="Buscar por nombre, correo o código…"
                views={
                  <DirectoryViews
                    views={sinVistaVacia.map((v) => ({
                      label: v.etiqueta,
                      count: conteo(v.rol),
                      active: vista === v.rol,
                      onClick: () => {
                        setVista(v.rol);
                        filtro.limpiar();
                      },
                    }))}
                  />
                }
              />
              <DataTable<CuentaAdmin>
                key={vista}
                rows={filtro.filtrados}
                columns={columnas}
                rowKey={(c) => c.id}
                caption={`Cuentas de acceso de ${perfiles[vista].toLowerCase()}`}
                pageSize={10}
                paginationPosition="bottom"
                inlineActions
                initialSort={{ key: 'cuenta', direction: 'asc' }}
                emptyTitle="Sin cuentas con estos filtros"
                emptyDescription="Prueba con otro nombre, correo o estado de acceso."
              />
            </div>
          )}
          {error && (
            <Alert tone="riesgo" title="No se cambió el acceso">
              {error}
            </Alert>
          )}
          {mensaje && <p role="status">{mensaje}</p>}
        </CardBody>
      </Card>
      {crear && <CrearCuenta onClose={() => setCrear(false)} />}
      {renovada && (
        <Sheet title="Acceso temporal renovado" onClose={() => setRenovada(null)}>
          <div className="stack">
            <p>Usuario: {renovada.identifier}</p>
            <label>
              Nueva contraseña temporal
              <input className="form-control mono" readOnly value={renovada.passwordTemporal} />
            </label>
            <p>
              La clave anterior dejó de funcionar. El nuevo acceso vence en 48 horas y quedó en la
              cola de correo.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
