import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CampoFormato, DefinicionFormato } from '../../../types/domain';
import {
  mover,
  nuevaPregunta,
  quitarPregunta,
  reemplazarPregunta,
} from '../../../utils/editorFormatos';
import { etiquetaBreve } from '../../../data/presentacionFormatos';
import { BotonEditor, EditorPregunta, VistaRespuesta } from './EditorPregunta';

type CambiarDefinicion = Dispatch<SetStateAction<DefinicionFormato>>;

export function EditorEstructura({
  definicion,
  setDefinicion,
  camposIntegrados,
}: {
  definicion: DefinicionFormato;
  setDefinicion: CambiarDefinicion;
  camposIntegrados: string[];
}) {
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [vista, setVista] = useState('');
  const navegador = useRef<HTMLDivElement>(null);
  const campos = definicion.secciones.flatMap((s) => s.campos);
  const pasos = definicion.secciones.flatMap((s, seccion) =>
    s.campos.length
      ? s.campos.map((campo) => ({ valor: campo.codigo, seccion }))
      : [{ valor: `seccion:${seccion}`, seccion }],
  );
  const indiceVista = Math.max(
    0,
    pasos.findIndex((p) => p.valor === vista),
  );
  const actual = pasos[indiceVista];
  const numero = campos.findIndex((c) => c.codigo === actual?.valor) + 1;
  const integrados = new Set(camposIntegrados);
  function ir(valor: string) {
    setVista(valor);
    setSeleccion(null);
    const cuerpo = navegador.current?.closest('.fe-content');
    if (cuerpo) cuerpo.scrollTop = 0;
  }
  function actualizarSeccion(
    indice: number,
    cambio: Partial<DefinicionFormato['secciones'][number]>,
  ) {
    setDefinicion((d) => ({
      ...d,
      secciones: d.secciones.map((s, i) => (i === indice ? { ...s, ...cambio } : s)),
    }));
  }
  function agregar(indice: number, copia?: CampoFormato) {
    const nueva = { ...(copia ?? nuevaPregunta()), codigo: nuevaPregunta().codigo };
    actualizarSeccion(indice, { campos: [...definicion.secciones[indice]!.campos, nueva] });
    setSeleccion(nueva.codigo);
    setVista(nueva.codigo);
  }
  function trasladar(campo: CampoFormato, destino: number) {
    setDefinicion((d) => ({
      ...d,
      secciones: d.secciones.map((s, i) => ({
        ...s,
        campos:
          i === destino ? [...s.campos, campo] : s.campos.filter((c) => c.codigo !== campo.codigo),
      })),
    }));
  }
  return (
    <div className="fe-flow">
      <div className="fe-question-navigation" ref={navegador}>
        <select
          className="select"
          aria-label="Ir a pregunta"
          value={actual?.valor ?? ''}
          onChange={(e) => ir(e.target.value)}
        >
          {definicion.secciones.map((s, i) => (
            <optgroup key={i} label={s.titulo}>
              {s.campos.length ? (
                s.campos.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {campos.findIndex((p) => p.codigo === c.codigo) + 1}.{' '}
                    {etiquetaBreve(definicion.codigo, c)}
                  </option>
                ))
              ) : (
                <option value={`seccion:${i}`}>Sección sin preguntas</option>
              )}
            </optgroup>
          ))}
        </select>
        <span role="status">
          {numero ? `Pregunta ${numero} de ${campos.length}` : 'Sección vacía'}
        </span>
        <div className="fe-step-buttons">
          <BotonEditor
            etiqueta="Pregunta anterior"
            icono="chevron-left"
            disabled={indiceVista === 0}
            onClick={() => ir(pasos[indiceVista - 1]!.valor)}
          />
          <BotonEditor
            etiqueta="Pregunta siguiente"
            icono="chevron-right"
            disabled={indiceVista === pasos.length - 1}
            onClick={() => ir(pasos[indiceVista + 1]!.valor)}
          />
        </div>
      </div>
      {definicion.secciones.map(
        (seccion, indice) =>
          indice === actual?.seccion && (
            <section className="fe-section" key={indice} aria-label={`Sección ${indice + 1}`}>
              <div className="fe-section-heading">
                <span className="fe-section-number">{indice + 1}</span>
                <input
                  className="fe-section-title"
                  aria-label={`Sección ${indice + 1}`}
                  value={seccion.titulo}
                  maxLength={200}
                  onChange={(e) => actualizarSeccion(indice, { titulo: e.target.value })}
                />
                <details className="fe-menu">
                  <summary aria-label={`Opciones de sección ${indice + 1}`}>
                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                  </summary>
                  <div>
                    <button
                      type="button"
                      disabled={indice === 0}
                      onClick={() =>
                        setDefinicion((d) => ({ ...d, secciones: mover(d.secciones, indice, -1) }))
                      }
                    >
                      Subir sección
                    </button>
                    <button
                      type="button"
                      disabled={indice === definicion.secciones.length - 1}
                      onClick={() =>
                        setDefinicion((d) => ({ ...d, secciones: mover(d.secciones, indice, 1) }))
                      }
                    >
                      Bajar sección
                    </button>
                    <button
                      type="button"
                      disabled={definicion.secciones.length === 1 || seccion.campos.length > 0}
                      onClick={() =>
                        setDefinicion((d) => ({
                          ...d,
                          secciones: d.secciones.filter((_, i) => i !== indice),
                        }))
                      }
                    >
                      Eliminar sección vacía
                    </button>
                  </div>
                </details>
              </div>
              {seccion.campos.map((campo, posicion) => {
                if (campo.codigo !== actual.valor) return null;
                const orden = numero;
                const activa = seleccion === campo.codigo;
                return (
                  <article
                    className={`fe-item${activa ? ' is-editing' : ''}`}
                    key={campo.codigo}
                    data-question={campo.codigo}
                  >
                    <div className="fe-item-title">
                      <span className="fe-question-number">{orden}.</span>
                      {activa ? (
                        <input
                          className="fe-question-title"
                          aria-label="Texto de la pregunta"
                          value={etiquetaBreve(definicion.codigo, campo)}
                          maxLength={500}
                          onChange={(e) =>
                            setDefinicion((d) =>
                              reemplazarPregunta(d, campo.codigo, {
                                ...campo,
                                etiqueta: e.target.value,
                                personalizado: true,
                              }),
                            )
                          }
                        />
                      ) : (
                        <button
                          type="button"
                          className="fe-question-label"
                          onClick={() => setSeleccion(campo.codigo)}
                        >
                          {etiquetaBreve(definicion.codigo, campo)}
                          {campo.obligatorio && (
                            <span className="fe-required" aria-label="Obligatoria">
                              {' '}
                              *
                            </span>
                          )}
                        </button>
                      )}
                      {!activa && (
                        <BotonEditor
                          etiqueta={`Editar pregunta ${orden}`}
                          icono="pen"
                          onClick={() => setSeleccion(campo.codigo)}
                        />
                      )}
                    </div>
                    {activa ? (
                      <EditorPregunta
                        campo={campo}
                        formato={definicion.codigo}
                        campos={campos}
                        integrado={integrados.has(campo.codigo)}
                        onChange={(siguiente) =>
                          setDefinicion((d) => reemplazarPregunta(d, campo.codigo, siguiente))
                        }
                        herramientas={
                          <>
                            <BotonEditor
                              etiqueta={`Subir pregunta ${orden}`}
                              icono="arrow-up"
                              disabled={posicion === 0}
                              onClick={() =>
                                actualizarSeccion(indice, {
                                  campos: mover(seccion.campos, posicion, -1),
                                })
                              }
                            />
                            <BotonEditor
                              etiqueta={`Bajar pregunta ${orden}`}
                              icono="arrow-down"
                              disabled={posicion === seccion.campos.length - 1}
                              onClick={() =>
                                actualizarSeccion(indice, {
                                  campos: mover(seccion.campos, posicion, 1),
                                })
                              }
                            />
                            <BotonEditor
                              etiqueta={`Duplicar pregunta ${orden}`}
                              icono="copy"
                              onClick={() => agregar(indice, structuredClone(campo))}
                            />
                            <BotonEditor
                              etiqueta={`Eliminar pregunta ${orden}`}
                              icono="trash-can"
                              disabled={integrados.has(campo.codigo)}
                              onClick={() => {
                                const siguiente = campos[numero] ?? campos[numero - 2];
                                setDefinicion((d) => quitarPregunta(d, campo.codigo));
                                setSeleccion(null);
                                setVista(siguiente?.codigo ?? '');
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-falcon-default"
                              onClick={() => setSeleccion(null)}
                            >
                              Listo
                            </button>
                          </>
                        }
                        destino={
                          <label className="fe-field">
                            <span>Sección</span>
                            <select
                              className="select"
                              value={indice}
                              onChange={(e) => trasladar(campo, Number(e.target.value))}
                            >
                              {definicion.secciones.map((s, i) => (
                                <option key={i} value={i}>
                                  {s.titulo}
                                </option>
                              ))}
                            </select>
                          </label>
                        }
                      />
                    ) : (
                      <VistaRespuesta campo={campo} formato={definicion.codigo} />
                    )}
                  </article>
                );
              })}
            </section>
          ),
      )}
      <div className="fe-structure-actions">
        <button
          type="button"
          className="fe-add"
          disabled={!actual}
          onClick={() => {
            if (actual) agregar(actual.seccion);
          }}
        >
          <i className="fa-solid fa-plus" aria-hidden="true" /> Añadir pregunta
        </button>
        <button
          type="button"
          className="fe-add fe-add-section"
          onClick={() => {
            const campo = nuevaPregunta();
            setDefinicion((d) => ({
              ...d,
              secciones: [...d.secciones, { titulo: 'Nueva sección', campos: [campo] }],
            }));
            setSeleccion(campo.codigo);
            setVista(campo.codigo);
          }}
        >
          <i className="fa-solid fa-layer-group" aria-hidden="true" /> Añadir sección
        </button>
      </div>
    </div>
  );
}
