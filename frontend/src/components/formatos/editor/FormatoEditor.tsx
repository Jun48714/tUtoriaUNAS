import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CodigoFormato } from '../../../types/domain';
import type { EstadoEditorFormato } from '../../../types/editorFormatos';
import {
  cargarEditorFormato,
  cargarVersionFormato,
  guardarDefinicion,
  publicarDefinicion,
} from '../../../services/editorFormatos';
import { refrescarApi } from '../../../services/apiTutoria';
import { ApiError } from '../../../services/apiClient';

import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { PageLoading } from '../../ui/PageLoading';
import { Tabs } from '../../ui/Tabs';

import { EditorMetadatos } from './EditorMetadatos';
import { EditorEstructura } from './EditorEstructura';
import { PreviaFormato } from './PreviaFormato';
import '../../../styles/editor-formatos.css';

export function FormatoEditor({ codigo, onClose }: { codigo: CodigoFormato; onClose(): void }) {
  const consulta = useQuery({
    queryKey: ['editor-formato', codigo],
    queryFn: ({ signal }) => cargarEditorFormato(codigo, signal),
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  if (consulta.data) return <ContenidoEditor inicial={consulta.data} onClose={onClose} />;
  return (
    <Sheet title={`Editar formato ${codigo.slice(1)}`} onClose={onClose} wide className="fe-sheet">
      {consulta.error ? (
        <Alert tone="riesgo" title="No se pudo abrir el editor">
          {consulta.error.message}
          <button className="btn btn-falcon-default" onClick={() => void consulta.refetch()}>
            Reintentar
          </button>
        </Alert>
      ) : (
        <PageLoading />
      )}
    </Sheet>
  );
}

function ContenidoEditor({ inicial, onClose }: { inicial: EstadoEditorFormato; onClose(): void }) {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState(inicial);
  const [definicion, setDefinicion] = useState(inicial.borrador ?? inicial.publicada);
  const [guardado, setGuardado] = useState(JSON.stringify(inicial.borrador ?? inicial.publicada));
  const [tab, setTab] = useState('editar');
  const contenido = useRef<HTMLFieldSetElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [confirmacion, setConfirmacion] = useState<'cerrar' | 'publicar' | 'recargar' | null>(null);
  const cambios = JSON.stringify(definicion) !== guardado;
  const pendientePublicar =
    estado.borrador !== null &&
    JSON.stringify(estado.borrador) !== JSON.stringify(estado.publicada);
  const cerrar = () => (cambios || ocupado ? setConfirmacion('cerrar') : onClose());
  function aceptar(siguiente: EstadoEditorFormato) {
    queryClient.setQueryData(['editor-formato', siguiente.publicada.codigo], siguiente);
    setEstado(siguiente);
    setDefinicion(siguiente.borrador ?? siguiente.publicada);
    setGuardado(JSON.stringify(siguiente.borrador ?? siguiente.publicada));
  }
  async function ejecutar(operacion: () => Promise<void>) {
    setOcupado(true);
    setError('');
    setMensaje('');
    setConfirmacion(null);
    try {
      await operacion();
    } catch (e) {
      const detalle = e instanceof ApiError ? Object.values(e.errors).flat().join(' ') : '';
      setError(
        e instanceof Error
          ? `${e.message}${detalle && !e.message.includes(detalle) ? ` ${detalle}` : ''}`
          : 'No se pudo completar la operación.',
      );
    } finally {
      setOcupado(false);
    }
  }
  const guardar = () =>
    ejecutar(async () => {
      aceptar(await guardarDefinicion(estado, definicion));
      setMensaje('Borrador guardado. Los portales conservan la versión publicada.');
    });
  const publicar = () =>
    ejecutar(async () => {
      const siguiente = await publicarDefinicion(estado);
      aceptar(siguiente);
      await refrescarApi().catch(() => undefined);
      setMensaje(`Versión ${siguiente.versionPublicada} publicada para todos los portales.`);
    });
  const recuperar = (revision: number) =>
    ejecutar(async () => {
      const anterior = await cargarVersionFormato(definicion.codigo, revision);
      setDefinicion({ ...anterior, revision: estado.versionPublicada });
      setTab('editar');
      setMensaje(`Versión ${revision} recuperada como edición. Guarda y publica para aplicarla.`);
    });
  return (
    <Sheet
      title={`Editar formato ${definicion.numero}`}
      onClose={cerrar}
      wide
      className="fe-sheet"
      footer={
        <div className="fe-actions">
          <span role="status">
            {ocupado
              ? 'Procesando…'
              : cambios
                ? 'Sin guardar'
                : pendientePublicar
                  ? 'Borrador guardado'
                  : 'Publicado'}
          </span>
          <button
            className="btn btn-falcon-default"
            disabled={ocupado || !cambios}
            onClick={() => void guardar()}
          >
            Guardar borrador
          </button>
          <button
            className="btn btn-primary"
            disabled={ocupado || cambios || !pendientePublicar}
            onClick={() => setConfirmacion('publicar')}
          >
            Publicar cambios
          </button>
        </div>
      }
    >
      <Tabs
        etiqueta="Editor de formulario"
        activo={tab}
        onChange={(destino) => {
          setTab(destino);
          if (contenido.current) contenido.current.scrollTop = 0;
        }}
        items={[
          { id: 'editar', label: 'Preguntas' },
          { id: 'previa', label: 'Vista previa' },
          { id: 'formulario', label: 'Formulario' },
          { id: 'historial', label: 'Historial' },
        ]}
      />
      <fieldset
        ref={contenido}
        className="fe-content app-scroll"
        disabled={ocupado}
        tabIndex={0}
        aria-label="Contenido del formato"
      >
        {tab === 'formulario' && (
          <div className="fe-status">
            <span>
              Versión publicada <strong>{estado.versionPublicada}</strong>
            </span>
            <span>{definicion.actorEtiqueta} · Todas las escuelas</span>
            <button
              className="btn btn-falcon-default"
              disabled={ocupado}
              onClick={() => setConfirmacion('recargar')}
            >
              Recargar
            </button>
          </div>
        )}
        {error && (
          <Alert tone="riesgo" title="Revisa la edición">
            {error} Tus cambios siguen en el editor.
          </Alert>
        )}
        {mensaje && (
          <p className="fe-message" role="status">
            {mensaje}
          </p>
        )}
        {confirmacion && (
          <div className="fe-confirm" role="alert">
            <p>
              {confirmacion === 'publicar'
                ? '¿Publicar los cambios para todos los usuarios?'
                : confirmacion === 'cerrar'
                  ? 'Hay cambios sin guardar. ¿Cerrar y descartarlos?'
                  : '¿Recargar el borrador guardado? Se descartarán los cambios sin guardar.'}
            </p>
            <div className="fe-actions">
              <button
                className="btn btn-primary"
                disabled={ocupado}
                onClick={() => {
                  if (confirmacion === 'cerrar') onClose();
                  else if (confirmacion === 'publicar') void publicar();
                  else
                    void ejecutar(async () =>
                      aceptar(await cargarEditorFormato(definicion.codigo)),
                    );
                }}
              >
                {confirmacion === 'publicar' ? 'Sí, publicar' : 'Continuar'}
              </button>
              <button className="btn btn-falcon-default" onClick={() => setConfirmacion(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'editar' && (
            <EditorEstructura
              definicion={definicion}
              setDefinicion={setDefinicion}
              camposIntegrados={estado.camposIntegrados}
            />
          )}
          {tab === 'formulario' && (
            <EditorMetadatos definicion={definicion} setDefinicion={setDefinicion} />
          )}
          {tab === 'previa' && <PreviaFormato definicion={definicion} />}
          {tab === 'historial' && (
            <div className="fe-history">
              <h3>Versiones publicadas</h3>
              <p>Recuperar una versión la abre como edición; se publica después de guardarla.</p>
              {estado.historial.length ? (
                <ol>
                  {estado.historial.map((p) => (
                    <li key={p.revision}>
                      <span>
                        <strong>Versión {p.revision}</strong>
                        <small>{new Date(p.publicado).toLocaleString('es-PE')}</small>
                      </span>
                      <button
                        className="btn btn-falcon-default"
                        disabled={cambios}
                        onClick={() => void recuperar(p.revision)}
                      >
                        Recuperar versión {p.revision}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>El historial se registra desde la primera publicación del editor.</p>
              )}
            </div>
          )}
        </div>
      </fieldset>
    </Sheet>
  );
}
