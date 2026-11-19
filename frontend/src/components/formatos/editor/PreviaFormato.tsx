import { useState } from 'react';
import type { DefinicionFormato, Instrumento } from '../../../types/domain';
import { GuidedInstrumentForm } from '../../panels/GuidedInstrumentForm';

export function PreviaFormato({ definicion }: { definicion: DefinicionFormato }) {
  const [instrumento, setInstrumento] = useState<Instrumento>(() => ({
    id: 'PREVIA-FORMATO',
    formato: definicion.codigo,
    semestreId: 'Vista previa',
    tutorId: '',
    estudianteId: null,
    sesionId: null,
    estado: 'borrador',
    avance: 0,
    version: 0,
    creado: '',
    actualizado: '',
    enviado: null,
    revisadoPor: null,
    observaciones: [],
    descargaDisponible: false,
    respuestas: {},
  }));
  return (
    <div className="fe-preview">
      <p className="fe-hint">
        Prueba las preguntas y condiciones. Estas respuestas no se guardan en el sistema.
      </p>
      <h2>{definicion.nombre}</h2>
      <GuidedInstrumentForm
        definicion={definicion}
        instrumento={instrumento}
        editable
        puedeEnviar={false}
        onGuardar={(respuestas) => {
          const siguiente = { ...instrumento, respuestas };
          setInstrumento(siguiente);
          return siguiente;
        }}
      />
    </div>
  );
}
