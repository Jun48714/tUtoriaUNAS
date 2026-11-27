import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../ui/Sheet';
import { Alert } from '../ui/Alert';
import { apiJson } from '../../services/apiClient';
import { refrescarApi } from '../../services/apiTutoria';
import type { CuentaAdmin, CuentaEditada } from '../../services/cuentas';
import '../../styles/coord-modals.css';

/** Edita los mismos datos que se registran al crear la cuenta; el ciclo define la entrevista inicial. */
export function EditarCuenta({ cuenta, onClose }: { cuenta: CuentaAdmin; onClose(): void }) {
  const queryClient = useQueryClient();
  const formId = useId();
  const esEstudiante = cuenta.rol === 'estudiante';
  const [correo, setCorreo] = useState(cuenta.correo);
  const [nombres, setNombres] = useState(cuenta.nombres);
  const [apellidos, setApellidos] = useState(cuenta.apellidos);
  const [codigo, setCodigo] = useState(cuenta.codigo);
  const [ciclo, setCiclo] = useState(cuenta.ciclo === null ? '' : String(cuenta.ciclo));
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editada, setEditada] = useState<CuentaEditada | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function guardar() {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      const resultado = await apiJson<CuentaEditada>(
        `/api/cuentas/${encodeURIComponent(cuenta.id)}/datos`,
        'PUT',
        {
          version: cuenta.version,
          correo,
          nombres,
          apellidos,
          codigo: codigo || null,
          ciclo: esEstudiante && ciclo ? Number(ciclo) : null,
        },
      );
      await queryClient.invalidateQueries({ queryKey: ['cuentas-administracion'] });
      await refrescarApi();
      if (resultado.passwordTemporal) setEditada(resultado);
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar los cambios.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Sheet
      className="coord-form-sheet"
      title={editada ? 'Datos guardados' : esEstudiante ? 'Editar estudiante' : 'Editar docente'}
      onClose={onClose}
      footer={
        !editada ? (
          <>
            <button type="button" className="btn btn-link" onClick={onClose} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" form={formId} className="btn btn-primary" disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        ) : undefined
      }
    >
      {editada ? (
        <div className="stack">
          <p role="status">
            Cambiaste el correo de una cuenta que aún no verificó su acceso. El acceso temporal
            anterior dejó de funcionar y el nuevo quedó en la cola de correo. Vence en 48 horas.
          </p>
          <dl className="def-list">
            <div>
              <dt>Usuario</dt>
              <dd>{editada.identifier}</dd>
            </div>
          </dl>
          <label>
            Nueva contraseña temporal
            <input
              className="form-control mono"
              readOnly
              type="text"
              value={editada.passwordTemporal ?? ''}
            />
          </label>
          <button
            type="button"
            className="btn btn-falcon-default"
            onClick={() =>
              void navigator.clipboard
                .writeText(editada.passwordTemporal ?? '')
                .then(() => setCopiado(true))
                .catch(() => setError('Selecciona la contraseña y cópiala manualmente.'))
            }
          >
            {copiado ? 'Copiada' : 'Copiar contraseña temporal'}
          </button>
          <p className="small muted">Se muestra una sola vez.</p>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      ) : (
        <form
          id={formId}
          className="coord-account-form"
          aria-busy={ocupado}
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <label className="field">
            Correo institucional
            <input
              className="form-control"
              type="email"
              maxLength={254}
              required
              disabled={ocupado}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="nombre@unas.edu.pe"
            />
          </label>
          <div className="coord-modal-grid">
            <label className="field">
              Nombres
              <input
                className="form-control"
                maxLength={150}
                required
                disabled={ocupado}
                value={nombres}
                onChange={(e) => setNombres(e.target.value)}
              />
            </label>
            <label className="field">
              Apellidos
              <input
                className="form-control"
                maxLength={150}
                required
                disabled={ocupado}
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
              />
            </label>
          </div>
          <div className="coord-modal-grid">
            <label className="field">
              {esEstudiante ? 'Código de alumno' : 'Código de docente'} (opcional)
              <input
                className="form-control"
                maxLength={40}
                disabled={ocupado}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </label>
            {esEstudiante && (
              <label className="field">
                Ciclo
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  max={10}
                  disabled={ocupado}
                  value={ciclo}
                  onChange={(e) => setCiclo(e.target.value)}
                />
              </label>
            )}
          </div>
          {esEstudiante && (
            <p className="small muted">
              El ciclo define su entrevista inicial: al guardarlo, el formulario aparece en su panel
              si ya tiene tutor asignado.
            </p>
          )}
          {error && (
            <Alert tone="riesgo" title="No se guardaron los cambios">
              {error}
            </Alert>
          )}
        </form>
      )}
    </Sheet>
  );
}
