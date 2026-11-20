import type { CSSProperties } from 'react';
import { aIso, desdeIso, formatFecha, sumarDias } from '../../utils/fechas';
import { crucesDeBloque, origenOcupacion } from '../../services/disponibilidadTutoria';
import type { DisponibilidadTutoria } from '../../services/disponibilidadTutoria';
import '../../styles/disponibilidad-tutoria.css';

const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const formatoSemana = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

export function DisponibilidadSemanal({
  datos,
  fecha,
  inicio,
  fin,
  ahora,
  seleccionar,
}: {
  datos: DisponibilidadTutoria;
  fecha: string;
  inicio: string;
  fin: string;
  ahora: number;
  seleccionar(fecha: string): void;
}) {
  const horasValidas = Boolean(inicio && fin && inicio < fin);
  const completos = datos.sinHorario === 0;
  const lunes = desdeIso(datos.lunes);
  const semana = dias
    .map((nombre, i) => ({ nombre, fecha: aIso(sumarDias(lunes, i)) }))
    .filter((d, i) => i < 5 || d.fecha === fecha);
  const bloques = datos.bloques.filter((b) => semana.some((d) => d.fecha === b.fecha));
  const primeraHora = Math.min(
    7,
    ...bloques.map((b) => Math.floor(minutos(b.horaInicio) / 60)),
    ...(inicio ? [Math.floor(minutos(inicio) / 60)] : []),
  );
  const ultimaHora = Math.max(
    21,
    ...bloques.map((b) => Math.ceil(minutos(b.horaFin) / 60)),
    ...(fin ? [Math.ceil(minutos(fin) / 60)] : []),
  );
  const rango = (ultimaHora - primeraHora) * 60;
  const escala = (hora: string) => ((minutos(hora) - primeraHora * 60) / rango) * 100;
  const horas = Array.from({ length: ultimaHora - primeraHora + 1 }, (_, i) => primeraHora + i);
  const marcas = horas.filter(
    (h) => h === primeraHora || h === ultimaHora || (h - primeraHora) % 3 === 0,
  );
  const cruceActual = horasValidas ? crucesDeBloque(datos, fecha, inicio, fin) : [];
  const ocupacionDelDia = bloques.filter((b) => b.fecha === fecha);
  const ultimaFecha = semana.at(-1)!.fecha;

  return (
    <section className="disponibilidad" aria-label="Disponibilidad semanal">
      <div className="disponibilidad__cabecera">
        <h3>Disponibilidad semanal</h3>
        <span className="small muted">
          {formatoSemana.formatRange(lunes, desdeIso(ultimaFecha))}
        </span>
      </div>
      <ul className="disponibilidad__leyenda" aria-label="Leyenda del horario">
        <li data-tipo="libre">{completos ? 'Libre' : 'Sin confirmar'}</li>
        <li data-tipo="ocupado">Ocupado</li>
      </ul>
      {horasValidas && (
        <span className="sr-only" aria-live="polite">
          {formatFecha(fecha)}, {inicio} a {fin}.
        </span>
      )}
      <div className="disponibilidad__grilla" style={{ '--dias': semana.length } as CSSProperties}>
        <div className="disponibilidad__horas" aria-hidden="true">
          {marcas.map((h) => (
            <span key={h} style={{ top: `${(((h - primeraHora) * 60) / rango) * 100}%` }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {semana.map((d) => {
          const bloquesDia = bloques.filter((b) => b.fecha === d.fecha);
          const cruce = horasValidas && crucesDeBloque(datos, d.fecha, inicio, fin).length > 0;
          const pasado = horasValidas && Date.parse(d.fecha + 'T' + inicio + ':00-05:00') <= ahora;
          const estado = !horasValidas
            ? '—'
            : cruce
              ? 'Cruce'
              : pasado
                ? 'Pasó'
                : completos
                  ? 'Libre'
                  : 'Parcial';
          return (
            <div key={d.fecha} className="disponibilidad__dia">
              <button
                type="button"
                className="disponibilidad__fecha"
                aria-pressed={d.fecha === fecha}
                aria-label={`${d.nombre} ${formatFecha(d.fecha)} · ${inicio || '—'} a ${fin || '—'} · ${estado}`}
                onClick={() => seleccionar(d.fecha)}
              >
                <strong>
                  {d.nombre} {Number(d.fecha.slice(-2))}
                </strong>
                <small data-estado={estado}>{estado}</small>
              </button>
              <div
                className="disponibilidad__pista"
                data-parcial={!completos}
                role="img"
                aria-label={`Ocupación del ${d.nombre} ${formatFecha(d.fecha)}`}
              >
                {horas.slice(1, -1).map((h) => (
                  <span
                    className="disponibilidad__linea"
                    data-marca={marcas.includes(h)}
                    aria-hidden="true"
                    key={h}
                    style={{ top: `${(((h - primeraHora) * 60) / rango) * 100}%` }}
                  />
                ))}
                {bloquesDia.map((b, i) => (
                  <span
                    className="disponibilidad__bloque"
                    aria-hidden="true"
                    key={i}
                    title={`${origenOcupacion[b.origen]} · ${b.horaInicio}–${b.horaFin}`}
                    style={{
                      top: `${escala(b.horaInicio)}%`,
                      height: `${escala(b.horaFin) - escala(b.horaInicio)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {cruceActual.length > 0 && (
        <ul className="disponibilidad__cruces" aria-label="Cruces del horario seleccionado">
          {cruceActual.map((b, i) => (
            <li key={i}>
              {origenOcupacion[b.origen]} · {b.horaInicio}–{b.horaFin}
            </li>
          ))}
        </ul>
      )}
      {!completos && (
        <p className="small muted">
          {datos.sinHorario === 1
            ? 'Horario parcial · 1 estudiante sin horario cargado'
            : `Horario parcial · ${datos.sinHorario} estudiantes sin horario cargado`}
        </p>
      )}
      {ocupacionDelDia.length > 0 && (
        <details className="small">
          <summary>Bloques del día</summary>
          <ul className="disponibilidad__cruces">
            {ocupacionDelDia.map((b, i) => (
              <li key={i}>
                {b.horaInicio}–{b.horaFin} · {origenOcupacion[b.origen]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
