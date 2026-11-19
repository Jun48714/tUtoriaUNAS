import type {
  CampoFormato,
  CodigoFormato,
  DefinicionFormato,
  SeccionFormato,
} from '../types/domain';

/** Solo presentación. Los códigos, opciones, preguntas oficiales y exportaciones no cambian. */
const compartidas: Record<string, string> = {
  otrasActividades: '¿Qué haces además de estudiar?',
  administracionTiempo: '¿Cómo distribuyes tu día?',
  transporte: '¿Cómo llegas a la universidad?',
  tiempoTransporte: 'Tiempo de traslado (minutos)',
  lugarEstudio: '¿Dónde sueles estudiar?',
  espacioEstudio: '¿Tienes un espacio de estudio?',
  accionesCursos: '¿Cómo estudias esos cursos?',
  dificultades: '¿Qué dificultades has tenido?',
  soluciones: '¿Cómo has intentado resolverlas?',
  materiasFaciles: '¿Qué cursos disfrutas y se te facilitan?',
  problemasPersonales: '¿Qué influye en tu aprendizaje?',
  estadoSalud: '¿Cómo está tu salud actualmente?',
  autodescripcion: '¿Cómo te describes?',
  preocupaciones: '¿Qué te preocupa actualmente?',
  antivalores: '¿Qué actitudes quisieras mejorar?',
  expectativas: '¿La tutoría cumplió tus expectativas?',
  aprendizajes: '¿Qué aprendiste en tutoría?',
  caracteristicasTutor: '¿Qué apoyo esperas de tu tutor?',
};
const porFormato: Partial<Record<CodigoFormato, Record<string, string>>> = {
  F01: { comision: 'Comisión de tutoría', actividades: 'Actividades realizadas' },
  F02: {
    atendidosIndividual: 'Estudiantes · individual',
    ciclosIndividual: 'Ciclos · individual',
    individuales: 'Sesiones individuales',
    atendidosGrupal: 'Estudiantes · grupal',
    ciclosGrupal: 'Ciclos · grupal',
    grupales: 'Sesiones grupales',
  },
  F03: {
    expectativas: '¿Qué esperas de la tutoría?',
    materiasSecundaria: '¿Qué materias te costaron en secundaria?',
    eleccionCarrera: '¿Por qué elegiste tu carrera?',
    expectativaCarrera: '¿Qué esperas de tu carrera?',
    expectativaUniversidad: '¿Qué esperas de la universidad y facultad?',
    horasEstudio: 'Horas de estudio al día',
    tiempoSuficiente: '¿Te alcanza el tiempo de estudio?',
    formaEstudio: '¿Cómo prefieres estudiar?',
    estudioEfectivo: '¿Tu forma de estudiar ayuda en los exámenes?',
  },
  F04: { motivacion: 'Tu motivación para estudiar' },
  F05: {
    motivacion: 'Tu motivación hacia la carrera',
    laboral1: 'Tengo claro en qué puedo trabajar',
    laboral2: 'Sé dónde buscar trabajo y formación',
    laboral3: 'Puedo redactar mi currículum',
    laboral4: 'Puedo redactar una carta de presentación',
    laboral5: 'Puedo afrontar una entrevista de trabajo',
    laboral6: 'Construí mi proyecto profesional en tutoría',
    laboral7: 'La duración de la tutoría fue adecuada',
    laboral8: 'Mejoré mis habilidades comunicativas',
    laboral9: 'Tengo más posibilidades de encontrar trabajo',
  },
  F08: {
    resultado: '¿Cómo continúa la atención?',
    detalleMotivo: 'Detalle de la atención',
    proximaCita: 'Próxima cita',
    horaCita: 'Hora de inicio',
    horaFinCita: 'Hora de fin',
    areaDerivacion: 'Área de apoyo',
  },
  F09: {
    actividad1: 'Participé en la inducción de tutores',
    actividad2: 'Conozco personalmente a cada tutorado',
    actividad3: 'Evalué hábitos, estrategias y técnicas de estudio',
    actividad4: 'Elaboré el plan con el equipo de tutores',
    actividad5: 'Colaboré en las actividades del equipo',
    actividad6: 'Hice seguimiento académico a estudiantes de alto riesgo',
    actividad7: 'Derivé casos que requerían atención especializada',
    actividad8: 'Convoqué a padres cuando fue necesario',
    actividad9: 'Contacté a docentes sobre la situación académica',
    actividad10: 'Realicé actividades preventivas con mi grupo',
  },
  F10: {
    p01: 'Tuvo disposición para atenderme',
    p02: 'Generó confianza',
    p03: 'Me trató con respeto',
    p04: 'Se interesó en problemas que afectan mi rendimiento',
    p05: 'Me escuchó con empatía',
    p06: 'Tuvo disposición para mantener la comunicación',
    p07: 'Me ayudó con dudas académicas o personales',
    p08: 'Me orientó en técnicas de estudio',
    p09: 'Me motivó a continuar estudiando',
    p10: 'Tuve el tiempo de atención necesario',
    p11: 'Fue fácil encontrar a mi tutor',
    p12: 'Me derivó cuando necesité apoyo profesional',
    p13: 'La tutoría ayudó a mejorar mi rendimiento',
    p14: 'Estoy conforme con mi tutor',
    tieneSugerencia: '¿Quieres dejar una sugerencia?',
  },
  F11: {
    p01: 'Atendió las necesidades de tutoría del grupo',
    p02: 'Generó confianza en el grupo',
    p03: 'Trató al grupo con respeto y cordialidad',
    p04: 'Tuvo las competencias para orientarnos',
    p05: 'Usó estrategias didácticas útiles',
    p06: 'Explicó el programa de tutoría',
    p07: 'Se interesó en los problemas del grupo',
    p08: 'Dio soluciones a los problemas del grupo',
    p09: 'Trató temas para mejorar el rendimiento académico',
    p10: 'Estuvo disponible cuando el grupo lo necesitó',
    p11: 'Aplicó un cuestionario inicial sobre nuestros problemas',
    p12: 'Motivó la participación del grupo',
    p13: 'Identificó problemas y necesidades del grupo',
  },
  F12: { detalle: 'Detalle necesario para la atención' },
};
export function etiquetaBreve(formato: CodigoFormato, campo: CampoFormato) {
  if (campo.personalizado) return campo.etiqueta;
  return porFormato[formato]?.[campo.codigo] ?? compartidas[campo.codigo] ?? campo.etiqueta;
}
export function seccionBreve(titulo: string) {
  return (
    (
      {
        'Tus datos': 'Datos',
        'Datos de la evaluación': 'Datos',
        'Datos del estudiante': 'Estudiante',
        'Datos de la sesión': 'Sesión',
        'Tu grupo de tutoría': 'Grupo',
        'Atención y confianza': 'Atención',
        'Acompañamiento recibido': 'Acompañamiento',
        'Resultados de la tutoría': 'Resultados',
        'Motivación y carrera': 'Carrera',
      } as Record<string, string>
    )[titulo] ?? titulo
  );
}
export function opcionBreve(formato: CodigoFormato, codigo: string, opcion: string) {
  if (formato === 'F10' && /^p\d{2}$/.test(codigo)) return opcion.replace(/^[A-D] · /, '');
  if (formato === 'F08' && codigo === 'resultado')
    return (
      (
        {
          'Se resuelve con la asesoría': 'Resuelto',
          'Se programa nueva cita para seguimiento': 'Seguimiento',
          'Se deriva a:': 'Derivar',
        } as Record<string, string>
      )[opcion] ?? opcion
    );
  return opcion;
}
export function caraOpcion(formato: CodigoFormato, codigo: string, opcion: string) {
  if (formato === 'F10' && /^p\d{2}$/.test(codigo))
    return (
      { A: 'face-smile-beam', B: 'face-smile', C: 'face-frown', D: 'face-frown-open' } as Record<
        string,
        string
      >
    )[opcion[0] ?? ''];
  if ((formato === 'F04' || formato === 'F05') && codigo === 'motivacion')
    return (
      { Alta: 'face-smile-beam', Media: 'face-meh', Baja: 'face-frown' } as Record<string, string>
    )[opcion];
  return undefined;
}

/** Divide grupos largos sin separar una pregunta de sus condiciones ni alterar el anexo. */
export function bloquesPresentacion(definicion: DefinicionFormato): SeccionFormato[] {
  return definicion.secciones.flatMap((seccion) => {
    const unidades: CampoFormato[][] = [];
    for (const campo of seccion.campos) {
      const padre =
        campo.visibleSi && unidades.find((u) => u.some((c) => c.codigo === campo.visibleSi!.campo));
      if (padre) padre.push(campo);
      else unidades.push([campo]);
    }
    if (unidades.length <= 1) return [seccion];
    return unidades.map((campos) => ({
      titulo: `${seccion.titulo} · ${etiquetaBreve(definicion.codigo, campos[0]!)}`,
      campos,
    }));
  });
}
