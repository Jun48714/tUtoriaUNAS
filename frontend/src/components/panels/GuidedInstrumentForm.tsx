import { useId, useRef, useState } from 'react';
import {
  FormProvider,
  useController,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import type { ControllerRenderProps, FieldPath } from 'react-hook-form';
import { useFormularioInstrumento } from '../../hooks/useFormularioInstrumento';
import { ApiError } from '../../services/apiClient';
import { OPCIONES_EXCLUSIVAS, serializarFormulario } from '../../utils/validacionInstrumentos';
import type { ValoresFormularioInstrumento } from '../../utils/validacionInstrumentos';
import type { CampoFormato, DefinicionFormato, Instrumento } from '../../types/domain';
import { FormCompletion } from '../formatos/FormCompletion';
import { SuccessNotice } from '../ui/SuccessNotice';
import {
  bloquesPresentacion,
  etiquetaBreve,
  opcionBreve,
  caraOpcion,
  seccionBreve,
} from '../../data/presentacionFormatos';
import { useMotionPreference } from '../../hooks/useMotionPreference';
import { API_MODE } from '../../services/apiConfig';
import { erroresInstrumento } from '../../utils/validacionInstrumentos';
import '../../styles/form-presentation.css';
import { Alert } from '../ui/Alert';
import { Progress } from '../ui/Progress';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Plus, Send, Trash } from '../ui/icons';
import { asignaciones } from '../../data/tutoria';
import { estudiantePorId, nombreCompleto } from '../../data/personas';
import { usePortal } from '../../hooks/usePortal';
import { esEntrevista } from '../../utils/entrevistas';
import { preguntasRegistradas } from '../../utils/preguntasPendientes';
import '../../styles/tutoring-workspace.css';
import {
  avanceInstrumento,
  campoVisible,
  filasRespuesta,
  listaRespuesta,
  etapaDeFormato,
  respuestasVisibles,
} from '../../utils/instrumentos';

interface Props {
  definicion: DefinicionFormato;
  instrumento: Instrumento;
  editable?: boolean;
  puedeEnviar?: boolean;
  compacto?: boolean;
  /** Repite «Formato NN» junto al paso; se omite cuando la página ya lo muestra. */
  mostrarFormato?: boolean;
  onFinalizar?(): void;
  onGuardar?(
    respuestas: Record<string, string>,
    enviar: boolean,
    version?: number,
  ): void | Instrumento | Promise<void | Instrumento>;
}
const CAMPOS_ASISTENCIA = new Set([
  'nombreTutor',
  'fecha',
  'horaInicio',
  'horaFin',
  'tema',
  'grupo',
  'asistentes',
]);
const CAMPOS_CONTEXTO = new Set([
  'nombreEstudiante',
  'codigo',
  'ciclo',
  'escuela',
  'nombreTutor',
  'telefonoTutor',
  'semestre',
  'grupo',
  'fecha',
  'turno',
]);

/** Pasos breves y revisión explícita antes de compartir respuestas. */
export function GuidedInstrumentForm({
  definicion: publicada,
  instrumento,
  editable = false,
  puedeEnviar = true,
  compacto = false,
  mostrarFormato = !compacto,
  onGuardar,
  onFinalizar,
}: Props) {
  const definicion = instrumento.definicion ?? publicada;
  const portal = usePortal();
  const [seccionLectura, setSeccionLectura] = useState(0);
  const { formulario, contexto, valores, valoresIniciales, errores } = useFormularioInstrumento(
    definicion,
    instrumento,
    portal,
    editable,
  );
  const esEvaluacion = ['F10', 'F11'].includes(instrumento.formato);
  const entrevista = esEntrevista(instrumento.formato);
  const [entrega, setEntrega] = useState<{ respuestas: Record<string, string> } | null>(null);
  const asistenciaIntegrada =
    API_MODE && instrumento.sesionId && ['F06', 'F07'].includes(instrumento.formato);
  const seccionesVisibles =
    !editable || entrega
      ? contexto.secciones
      : contexto.secciones
          .map((seccion) => ({
            ...seccion,
            campos: seccion.campos.filter(
              (campo) =>
                !(
                  (CAMPOS_CONTEXTO.has(campo.codigo) ||
                    (asistenciaIntegrada && CAMPOS_ASISTENCIA.has(campo.codigo))) &&
                  valoresIniciales[campo.codigo]?.trim()
                ),
            ),
          }))
          .filter((seccion) => seccion.campos.length > 0);
  const deReferencia = new Set([
    'correo',
    'telefono',
    'apoderado',
    'facultad',
    'comision',
    'gruposAsignados',
    'estudiantesAsignados',
    'atendidosIndividual',
    'atendidosGrupal',
    'ciclosIndividual',
    'ciclosGrupal',
    'individuales',
    'grupales',
    ...(instrumento.formato === 'F12' ? ['area', 'motivo', 'detalle'] : []),
  ]);
  // La lista se fija al abrir. Un guardado no puede retirar preguntas bajo el cursor.
  const [registrados] = useState(
    () =>
      new Set(
        [...preguntasRegistradas(contexto, valoresIniciales)].filter(
          (c) => entrevista || deReferencia.has(c),
        ),
      ),
  );
  const [mostrarRegistrados, setMostrarRegistrados] = useState(false);
  const secciones = bloquesPresentacion({ ...contexto, secciones: seccionesVisibles });
  const lecturaActual = Math.min(seccionLectura, secciones.length - 1);
  const erroresActuales = erroresInstrumento(contexto, valores);
  const [consultarEntrega, setConsultarEntrega] = useState(false);
  const pasos = secciones.flatMap((s, i) =>
    s.campos.some(
      (c) => campoVisible(c, valores) && (mostrarRegistrados || !registrados.has(c.codigo)),
    )
      ? [i]
      : [],
  );
  const [pasoElegido, setPaso] = useState(() => pasos[0] ?? secciones.length);
  const paso =
    pasoElegido === -1
      ? secciones.length
      : pasos.includes(pasoElegido)
        ? pasoElegido
        : (pasos.find((i) => i >= pasoElegido) ?? secciones.length);
  const indicePaso = pasos.indexOf(paso);
  const [fallo, setFallo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardadoEnCurso = useRef(false);
  const versionVista = useRef(instrumento.version);
  const cabecera = useRef<HTMLHeadingElement>(null);
  const resumenError = useRef<HTMLDivElement>(null);
  const resumen = paso === secciones.length;
  const seccion = secciones[paso];
  function alEditar(codigo: string, tabla = false) {
    const limpiar: FieldPath<ValoresFormularioInstrumento>[] = [
      (tabla
        ? `tablas.${codigo}`
        : `respuestas.${codigo}`) as FieldPath<ValoresFormularioInstrumento>,
    ];
    const actuales = serializarFormulario(formulario.getValues());
    for (const campo of secciones.flatMap((s) => s.campos)) {
      if (!campoVisible(campo, actuales))
        limpiar.push(
          (campo.tipo === 'tabla'
            ? `tablas.${campo.codigo}`
            : `respuestas.${campo.codigo}`) as FieldPath<ValoresFormularioInstrumento>,
        );
      if (
        !campoVisible(campo, actuales) ||
        (actuales[campo.codigo] !== 'Otro' &&
          !listaRespuesta(actuales[campo.codigo] ?? '').includes('Otro'))
      )
        limpiar.push(`respuestas.${campo.codigo}__otro`);
    }
    formulario.clearErrors(limpiar);
    setFallo('');
  }
  function actualizar(codigo: string, valor: string) {
    formulario.setValue(`respuestas.${codigo}`, valor, { shouldDirty: true, shouldTouch: true });
    alEditar(codigo);
  }
  function ir(destino: number) {
    setPaso(destino === secciones.length ? -1 : destino);
    requestAnimationFrame(() => {
      cabecera.current?.focus({ preventScroll: true });
      cabecera.current
        ?.closest('.tutoring-form')
        ?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  async function guardar() {
    if (!onGuardar || guardadoEnCurso.current) return;
    guardadoEnCurso.current = true;
    setGuardando(true);
    setFallo('');
    try {
      const respuestas = respuestasVisibles(contexto, serializarFormulario(formulario.getValues()));
      const resultado = await onGuardar(respuestas, true, versionVista.current);
      if (resultado) versionVista.current = resultado.version;
      setEntrega({ respuestas: resultado?.respuestas ?? respuestas });
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [codigo, mensajes] of Object.entries(error.errors))
          formulario.setError(
            (contexto.secciones.some((s) =>
              s.campos.some((c) => c.codigo === codigo && c.tipo === 'tabla'),
            )
              ? `tablas.${codigo}`
              : `respuestas.${codigo}`) as FieldPath<ValoresFormularioInstrumento>,
            { type: 'server', message: mensajes[0] ?? 'Revisa la respuesta.' },
          );
      }
      setFallo(error instanceof Error ? error.message : 'No pudimos guardar. Intenta nuevamente.');
    } finally {
      guardadoEnCurso.current = false;
      setGuardando(false);
    }
  }
  async function continuar() {
    const campos: FieldPath<ValoresFormularioInstrumento>[] =
      seccion?.campos
        .filter((campo) => campoVisible(campo, valores))
        .flatMap(
          (campo) =>
            [
              campo.tipo === 'tabla' ? `tablas.${campo.codigo}` : `respuestas.${campo.codigo}`,
              `respuestas.${campo.codigo}__otro`,
            ] as FieldPath<ValoresFormularioInstrumento>[],
        ) ?? [];
    if (!(await formulario.trigger(campos))) {
      requestAnimationFrame(() => resumenError.current?.focus());
      return;
    }
    ir(pasos[indicePaso + 1] ?? secciones.length);
  }
  async function enviar() {
    if (!(await formulario.trigger())) {
      setFallo('Revisa las preguntas pendientes antes de enviar.');
      requestAnimationFrame(() => resumenError.current?.focus());
      return;
    }
    await guardar();
  }
  function bloque(
    seccionActual: (typeof secciones)[number],
    lectura: boolean,
    solo?: 'pendientes',
  ) {
    return (
      <div className="tutoring-fields">
        {seccionActual.campos
          .filter((campo) => campoVisible(campo, valores))
          .filter((campo) => !solo || !registrados.has(campo.codigo))
          .map((campo) => {
            const Campo = campo.tipo === 'tabla' ? RespuestaCampo : RespuestaRegistrada;
            const contenido = (
              <Campo
                key={campo.codigo}
                campo={campo}
                formato={definicion.codigo}
                completa={
                  Boolean(valores[campo.codigo]?.trim()) &&
                  !['[]', '{}'].includes(valores[campo.codigo] ?? '') &&
                  !erroresActuales[campo.codigo] &&
                  !erroresActuales[`${campo.codigo}__otro`]
                }
                valores={valores}
                mostrarAyuda={!lectura || !compacto}
                editable={
                  !lectura &&
                  !(asistenciaIntegrada && CAMPOS_ASISTENCIA.has(campo.codigo)) &&
                  !(
                    esEvaluacion &&
                    ['grupo', 'fecha', 'turno', 'nombreTutor'].includes(campo.codigo)
                  )
                }
                error={errores[campo.codigo]}
                otroError={errores[`${campo.codigo}__otro`]}
                onChange={actualizar}
                onTablaEditada={() => alEditar(campo.codigo, true)}
              />
            );
            return !lectura &&
              campo.tipo === 'texto-largo' &&
              !campo.obligatorio &&
              !(definicion.codigo === 'F08' && campo.codigo === 'detalleMotivo') ? (
              <details
                className="form-optional"
                key={campo.codigo}
                open={valoresIniciales[campo.codigo] ? true : undefined}
              >
                <summary>Añadir: {etiquetaBreve(definicion.codigo, campo)}</summary>
                {contenido}
              </details>
            ) : (
              contenido
            );
          })}
      </div>
    );
  }
  if (entrega && !consultarEntrega)
    return (
      <FormCompletion
        formato={definicion.codigo}
        respuestas={entrega.respuestas}
        onFinish={onFinalizar}
        onView={() => setConsultarEntrega(true)}
      />
    );
  if (!editable || entrega)
    return (
      <FormProvider {...formulario}>
        <div className="tutoring-form tutoring-form--read">
          {entrega && (
            <div className="form-read-actions">
              <SuccessNotice>Enviado</SuccessNotice>
              {onFinalizar && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  aria-label="Volver al listado"
                  onClick={onFinalizar}
                >
                  Volver
                </button>
              )}
            </div>
          )}
          <nav className="tutoring-read-navigation" aria-label="Consultar respuestas">
            <select
              className="select"
              aria-label="Pregunta del formulario"
              value={lecturaActual}
              onChange={(e) => setSeccionLectura(Number(e.target.value))}
            >
              {secciones.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1}. {s.titulo}
                </option>
              ))}
            </select>
            <span role="status">
              {lecturaActual + 1} de {secciones.length}
            </span>
            <button
              type="button"
              className="btn btn-falcon-default"
              aria-label="Respuesta anterior"
              disabled={lecturaActual <= 0}
              onClick={() => setSeccionLectura(lecturaActual - 1)}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-falcon-default"
              aria-label="Respuesta siguiente"
              disabled={lecturaActual === secciones.length - 1}
              onClick={() => setSeccionLectura(lecturaActual + 1)}
            >
              <ArrowRight aria-hidden="true" />
            </button>
          </nav>
          {secciones[lecturaActual] && (
            <section className="tutoring-read-section" aria-label="Respuesta seleccionada">
              {bloque(secciones[lecturaActual], true)}
            </section>
          )}
        </div>
      </FormProvider>
    );
  return (
    <FormProvider {...formulario}>
      <div className={`tutoring-form${resumen ? ' tutoring-form--review' : ''}`}>
        <div className="tutoring-form__toolbar">
          <label className="tutoring-section-picker">
            <span className="sr-only">Sección</span>
            <select
              className="select"
              aria-label="Sección del formulario"
              value={paso}
              onChange={(e) => ir(Number(e.target.value))}
            >
              {[...pasos, secciones.length].map((indice, i) => (
                <option
                  key={indice}
                  value={indice}
                  data-question-code={secciones[indice]?.campos[0]?.codigo}
                >
                  {secciones[indice] ? `${i + 1}. ${secciones[indice]!.titulo}` : 'Revisión'}
                </option>
              ))}
            </select>
          </label>
          <div className="tutoring-form__progress">
            <span className="small">
              {mostrarFormato && `F${definicion.numero} · `}
              {!resumen && `${indicePaso + 1}/${pasos.length} · `}
              {avanceInstrumento(contexto, valores)}%
            </span>
            <Progress valor={avanceInstrumento(contexto, valores)} mostrarValor={false} />
          </div>
        </div>
        <div className="sr-only">
          <h3 ref={cabecera} tabIndex={-1}>
            {resumen ? 'Revisa tus respuestas' : seccion?.titulo}
          </h3>
        </div>
        {Object.keys(errores).length > 0 && (
          <div className="tutoring-errors" role="alert" tabIndex={-1} ref={resumenError}>
            <strong>Revisa las respuestas señaladas.</strong>
            <ul>
              {Object.entries(errores).map(([codigo, error]) => {
                const indice = secciones.findIndex((s) =>
                  s.campos.some((c) => c.codigo === codigo.replace('__otro', '')),
                );
                const campo = secciones[indice]?.campos.find(
                  (c) => c.codigo === codigo.replace('__otro', ''),
                );
                return (
                  <li key={codigo}>
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarRegistrados(true);
                        ir(Math.max(indice, 0));
                      }}
                    >
                      {campo?.etiqueta}: {error}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {fallo && (
          <Alert tone="riesgo" title="Revisa el formulario">
            {fallo}
          </Alert>
        )}
        {resumen ? (
          <>
            <div className="form-review-list">
              {seccionesVisibles
                .filter((s) => s.campos.some((c) => campoVisible(c, valores)))
                .map((s) => (
                  <details className="tutoring-review-section" key={s.titulo}>
                    <summary>
                      <span>{seccionBreve(s.titulo)}</span>
                      <span
                        className="form-review-state"
                        aria-label={
                          s.campos.some(
                            (c) =>
                              erroresActuales[c.codigo] || erroresActuales[`${c.codigo}__otro`],
                          )
                            ? 'Por completar'
                            : 'Completo'
                        }
                      >
                        {s.campos.some(
                          (c) => erroresActuales[c.codigo] || erroresActuales[`${c.codigo}__otro`],
                        ) ? (
                          <span className="form-review-pending">Pendiente</span>
                        ) : (
                          <Check aria-hidden="true" />
                        )}
                      </span>
                      <ChevronRight className="form-review-chevron" aria-hidden="true" />
                    </summary>
                    {bloque(s, true)}
                    <button
                      type="button"
                      className="btn btn-link"
                      aria-label="Editar esta sección"
                      onClick={() => {
                        setMostrarRegistrados(true);
                        ir(
                          Math.max(
                            0,
                            secciones.findIndex((b) =>
                              b.campos.some(
                                (c) => s.campos.includes(c) && campoVisible(c, valores),
                              ),
                            ),
                          ),
                        );
                      }}
                    >
                      Editar
                    </button>
                  </details>
                ))}
            </div>
            {!puedeEnviar && (
              <Alert
                tone="info"
                title={
                  etapaDeFormato(definicion.codigo) === 'inicio'
                    ? 'Envío al inicio del semestre'
                    : 'Envío al cierre del semestre'
                }
              >
                {etapaDeFormato(definicion.codigo) === 'inicio'
                  ? 'La entrevista inicial se completa al inicio del semestre.'
                  : 'El envío se habilita al finalizar el semestre.'}
              </Alert>
            )}
          </>
        ) : (
          seccion && bloque(seccion, false, !mostrarRegistrados ? 'pendientes' : undefined)
        )}
        <div className="tutoring-form__actions">
          {(resumen ? pasos.length > 0 : indicePaso > 0) && (
            <button
              type="button"
              className="btn btn-falcon-default"
              disabled={guardando}
              onClick={() => ir(resumen ? pasos.at(-1)! : pasos[indicePaso - 1]!)}
            >
              <ArrowLeft aria-hidden="true" /> Atrás
            </button>
          )}
          {resumen ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={guardando || !puedeEnviar || !onGuardar}
              onClick={enviar}
              aria-label="Enviar formulario"
            >
              <Send aria-hidden="true" /> Enviar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={guardando}
              onClick={continuar}
            >
              Siguiente <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </FormProvider>
  );
}

function RespuestaRegistrada(props: Parameters<typeof RespuestaCampo>[0]) {
  const { control } = useFormContext<ValoresFormularioInstrumento>();
  const { field } = useController({
    control,
    name: `respuestas.${props.campo.codigo}`,
    defaultValue: props.valores[props.campo.codigo] ?? '',
  });
  return (
    <RespuestaCampo
      {...props}
      registro={{ name: field.name, ref: field.ref, onBlur: field.onBlur }}
      onChange={(codigo, valor) => {
        if (codigo === props.campo.codigo) field.onChange(valor);
        props.onChange(codigo, valor);
      }}
    />
  );
}

function RespuestaCampo({
  campo,
  formato,
  completa = false,
  valores,
  editable,
  mostrarAyuda = true,
  error,
  otroError,
  onChange,
  onTablaEditada,
  registro,
}: {
  campo: CampoFormato;
  formato: DefinicionFormato['codigo'];
  completa?: boolean;
  valores: Record<string, string>;
  editable: boolean;
  mostrarAyuda?: boolean;
  error?: string;
  otroError?: string;
  onChange(codigo: string, valor: string): void;
  onTablaEditada(): void;
  registro?: Pick<
    ControllerRenderProps<ValoresFormularioInstrumento, `respuestas.${string}`>,
    'name' | 'ref' | 'onBlur'
  >;
}) {
  const id = useId();
  const reduced = useMotionPreference();
  const [interactuada, setInteractuada] = useState(false);
  const [confirmada, setConfirmada] = useState(false);
  const etiqueta = etiquetaBreve(formato, campo);
  const alSalir = () => {
    setInteractuada(true);
    setConfirmada(true);
  };
  const valor = valores[campo.codigo] ?? '';
  const cambiar = (nuevo: string) => {
    setInteractuada(true);
    if (['multiple', 'escala', 'booleano', 'seleccion'].includes(campo.tipo)) setConfirmada(true);
    else setConfirmada(false);
    onChange(campo.codigo, nuevo);
  };
  const seleccionados = listaRespuesta(valor);
  const identidad = [
    'nombreEstudiante',
    'nombreTutor',
    'codigo',
    'escuela',
    'ciclo',
    'gruposAsignados',
    'estudiantesAsignados',
    'individuales',
    'grupales',
    'atendidosIndividual',
    'atendidosGrupal',
    'ciclosIndividual',
    'ciclosGrupal',
  ].includes(campo.codigo);
  const otro = valor === 'Otro' || (campo.tipo === 'multiple' && seleccionados.includes('Otro'));
  const descripcion =
    `${mostrarAyuda && campo.ayuda ? `${id}-ayuda ` : ''}${error ? `${id}-error` : ''}`.trim() ||
    undefined;
  const opciones = campo.tipo === 'booleano' ? ['Sí', 'No'] : (campo.opciones ?? []);
  const escoger = (opcion: string) => {
    const exclusivas = OPCIONES_EXCLUSIVAS;
    const nuevos = seleccionados.includes(opcion)
      ? seleccionados.filter((v) => v !== opcion)
      : exclusivas.includes(opcion)
        ? [opcion]
        : [...seleccionados.filter((v) => !exclusivas.includes(v)), opcion];
    cambiar(campo.tipo === 'multiple' ? JSON.stringify(nuevos) : opcion);
  };
  let control;
  if (!editable) {
    const texto =
      campo.tipo === 'multiple'
        ? seleccionados.map((o) => campo.rotulosOpciones?.[o] ?? o).join(' · ')
        : (campo.rotulosOpciones?.[valor] ?? valor);
    control =
      campo.tipo === 'tabla' ? (
        <div className="tutoring-rows">
          {filasRespuesta(valor).length ? (
            filasRespuesta(valor).map((fila, i) => (
              <dl className="tutoring-read-row" key={i}>
                {campo.columnas?.map((columna) => (
                  <div key={columna.codigo}>
                    <dt>{columna.etiqueta}</dt>
                    <dd>{fila[columna.codigo] || 'Sin respuesta'}</dd>
                  </div>
                ))}
              </dl>
            ))
          ) : (
            <p className="muted small">Sin registros</p>
          )}
        </div>
      ) : (
        <p className="tutoring-answer">
          {texto || 'Sin respuesta'}
          {otro && valores[`${campo.codigo}__otro`] ? `: ${valores[`${campo.codigo}__otro`]}` : ''}
        </p>
      );
  } else if (['multiple', 'escala', 'booleano'].includes(campo.tipo)) {
    control = (
      <div
        className={`tutoring-options${campo.tipo === 'multiple' ? ' tutoring-options--multi' : ''}`}
        role={campo.tipo === 'multiple' ? 'group' : 'radiogroup'}
        aria-labelledby={`${id}-label`}
        aria-required={campo.tipo === 'multiple' ? undefined : campo.obligatorio}
        aria-invalid={Boolean(error)}
        aria-describedby={descripcion}
      >
        {opciones.map((opcion) => (
          <label
            className={`tutoring-option${caraOpcion(formato, campo.codigo, opcion) ? ' tutoring-option--face' : ''}`}
            key={opcion}
          >
            <input
              {...registro}
              type={campo.tipo === 'multiple' ? 'checkbox' : 'radio'}
              name={id}
              value={opcion}
              checked={
                campo.tipo === 'multiple' ? seleccionados.includes(opcion) : valor === opcion
              }
              onChange={() => escoger(opcion)}
            />
            {caraOpcion(formato, campo.codigo, opcion) && (
              <i
                className={`form-choice-face fa-regular fa-${caraOpcion(formato, campo.codigo, opcion)}`}
                aria-hidden="true"
              />
            )}
            <span>
              {campo.rotulosOpciones?.[opcion] ?? opcionBreve(formato, campo.codigo, opcion)}
            </span>
          </label>
        ))}
      </div>
    );
  } else if (campo.tipo === 'tabla') {
    control = <TablaRespuestas campo={campo} onEditar={onTablaEditada} />;
  } else if (campo.tipo === 'seleccion') {
    control = (
      <select
        {...registro}
        id={id}
        className="select"
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        aria-required={campo.obligatorio}
        aria-invalid={Boolean(error)}
        aria-describedby={descripcion}
      >
        <option value="">Selecciona una opción</option>
        {valor && !opciones.includes(valor) && <option value={valor}>{valor}</option>}
        {opciones.map((o) => (
          <option key={o} value={o}>
            {campo.rotulosOpciones?.[o] ?? o}
          </option>
        ))}
      </select>
    );
  } else if (campo.tipo === 'texto-largo') {
    control = (
      <textarea
        {...registro}
        id={id}
        className="textarea"
        rows={3}
        value={valor}
        maxLength={1000}
        onChange={(e) => cambiar(e.target.value)}
        aria-required={campo.obligatorio}
        aria-invalid={Boolean(error)}
        aria-describedby={descripcion}
        placeholder="Una respuesta breve es suficiente."
      />
    );
  } else {
    const tipo =
      campo.tipo === 'numero'
        ? 'number'
        : campo.tipo === 'fecha'
          ? 'date'
          : campo.tipo === 'hora'
            ? 'time'
            : campo.codigo === 'correo'
              ? 'email'
              : campo.codigo.toLowerCase().includes('telefono')
                ? 'tel'
                : 'text';
    control = (
      <input
        {...registro}
        id={id}
        type={tipo}
        min={tipo === 'number' ? 0 : undefined}
        step={tipo === 'number' ? 'any' : undefined}
        className="input"
        value={valor}
        maxLength={tipo === 'text' ? 200 : undefined}
        readOnly={identidad}
        aria-required={campo.obligatorio}
        aria-invalid={Boolean(error)}
        aria-describedby={descripcion}
        onChange={(e) => cambiar(e.target.value)}
      />
    );
  }
  const grupo = ['multiple', 'escala', 'booleano', 'tabla'].includes(campo.tipo);
  return (
    <div
      onBlur={alSalir}
      data-reduced-motion={reduced}
      className={`tutoring-field${error ? ' tutoring-field--error' : ''}`}
      data-field={campo.codigo}
      data-tipo={campo.tipo}
    >
      {grupo ? (
        <div className="tutoring-field__label" id={`${id}-label`}>
          {etiqueta}
          {editable && campo.obligatorio && <span> *</span>}
        </div>
      ) : (
        <label className="tutoring-field__label" htmlFor={editable ? id : undefined}>
          {etiqueta}
          {editable && campo.obligatorio && <span> *</span>}
        </label>
      )}
      {control}
      {editable && (
        <div className="question-feedback-slot">
          {interactuada && confirmada && completa && (
            <span className="question-complete" data-animate={!reduced}>
              <Check aria-hidden="true" /> Respondida
            </span>
          )}
        </div>
      )}
      {mostrarAyuda && campo.ayuda && (
        <span id={`${id}-ayuda`} className="field__hint">
          {campo.ayuda}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
      {editable && otro && (
        <div className="tutoring-other">
          <label htmlFor={`${id}-otro`}>¿Cuál? *</label>
          <input
            id={`${id}-otro`}
            className="input"
            value={valores[`${campo.codigo}__otro`] ?? ''}
            maxLength={200}
            onChange={(e) => onChange(`${campo.codigo}__otro`, e.target.value)}
            aria-required="true"
            aria-invalid={Boolean(otroError)}
            aria-describedby={otroError ? `${id}-otro-error` : undefined}
          />
          {otroError && (
            <span className="field__error" id={`${id}-otro-error`}>
              {otroError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TablaRespuestas({ campo, onEditar }: { campo: CampoFormato; onEditar(): void }) {
  const { control, setValue } = useFormContext<ValoresFormularioInstrumento>();
  const name = `tablas.${campo.codigo}` as const;
  const { fields, append, remove } = useFieldArray({ control, name });
  const filas = useWatch({ control, name }) ?? [];
  const id = useId();
  function actualizar(indice: number, codigo: string, nuevo: string) {
    const estudiante =
      codigo === 'nombre'
        ? estudiantePorId(
            asignaciones.find((a) => {
              const e = estudiantePorId(a.estudianteId);
              return e && nombreCompleto(e) === nuevo;
            })?.estudianteId ?? '',
          )
        : undefined;
    const datos = estudiante
      ? {
          estudianteId: estudiante.id,
          ciclo: String(estudiante.ciclo),
          grupo: asignaciones.find((a) => a.estudianteId === estudiante.id)?.grupo ?? '',
        }
      : codigo === 'nombre'
        ? { estudianteId: '', ciclo: '', grupo: '' }
        : {};
    // setValue conserva el montaje y el foco de la fila; la clave de RHF es estable.
    for (const [clave, contenido] of Object.entries({ ...datos, [codigo]: nuevo })) {
      setValue(`${name}.${indice}.${clave}`, contenido, { shouldDirty: true, shouldTouch: true });
    }
    onEditar();
  }
  return (
    <div className="tutoring-rows">
      {fields.map((field, i) => {
        const fila = filas[i] ?? {};
        return (
          <div className="tutoring-edit-row" key={field.id}>
            <div className="tutoring-edit-row__head">
              <strong>Registro {i + 1}</strong>
              <button
                type="button"
                className="btn btn-link"
                aria-label={`Quitar registro ${i + 1} de ${campo.etiqueta}`}
                onClick={() => {
                  remove(i);
                  onEditar();
                }}
              >
                <Trash aria-hidden="true" /> Quitar
              </button>
            </div>
            <div className="tutoring-row-fields">
              {campo.columnas?.map((columna) => (
                <div className="field" key={columna.codigo}>
                  <label htmlFor={`${id}-${field.id}-${columna.codigo}`}>{columna.etiqueta}</label>
                  {columna.tipo === 'seleccion' ? (
                    <select
                      id={`${id}-${field.id}-${columna.codigo}`}
                      className="select"
                      value={fila[columna.codigo] ?? ''}
                      onChange={(e) => actualizar(i, columna.codigo, e.target.value)}
                    >
                      <option value="">Selecciona</option>
                      {columna.opciones?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`${id}-${field.id}-${columna.codigo}`}
                      className="input"
                      type={
                        columna.tipo === 'numero'
                          ? 'number'
                          : columna.tipo === 'fecha'
                            ? 'date'
                            : 'text'
                      }
                      min={0}
                      maxLength={200}
                      step={columna.codigo === 'horas' ? '0.5' : '1'}
                      value={fila[columna.codigo] ?? ''}
                      onChange={(e) => actualizar(i, columna.codigo, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {fields.length === 0 && <p className="small muted">Agrega un registro para comenzar.</p>}
      <button
        type="button"
        className="btn btn-falcon-default"
        onClick={() => {
          append(Object.fromEntries((campo.columnas ?? []).map((columna) => [columna.codigo, ''])));
          onEditar();
        }}
      >
        <Plus aria-hidden="true" /> Agregar registro
      </button>
    </div>
  );
}
