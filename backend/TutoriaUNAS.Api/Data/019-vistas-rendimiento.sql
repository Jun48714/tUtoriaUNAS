-- Vistas e índices de lectura para paneles (dashboards), estado de tutoría, directorio de cuentas,
-- derivaciones con seguimiento y monitoreo de escuela en todos los perfiles de rol
-- (estudiante, docente tutor, coordinador de escuela, coordinación y administración institucional).

CREATE INDEX IF NOT EXISTS "IX_Asignaciones_EscuelaId_SemestreId_Activa"
    ON "Asignaciones" ("EscuelaId", "SemestreId")
    WHERE "Activa" = TRUE;

CREATE INDEX IF NOT EXISTS "IX_Sesiones_EscuelaId_SemestreId"
    ON "Sesiones" ("EscuelaId", "SemestreId");

CREATE INDEX IF NOT EXISTS "IX_Instrumentos_EscuelaId_SemestreId_Formato"
    ON "Instrumentos" ("EscuelaId", "SemestreId", "Formato");

CREATE INDEX IF NOT EXISTS "IX_Instrumentos_F12_Cerrados"
    ON "Instrumentos" ("EscuelaId", "SemestreId")
    WHERE "Formato" = 'F12' AND "Estado" IN ('enviado', 'aprobado');

CREATE INDEX IF NOT EXISTS "IX_Fuentes_EstudianteId"
    ON "Fuentes" ("EstudianteId")
    WHERE "EstudianteId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IX_Fuentes_TutorId"
    ON "Fuentes" ("TutorId")
    WHERE "TutorId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IX_Fuentes_Tipo_FechaCorte"
    ON "Fuentes" ("Tipo", "FechaCorte" DESC);

CREATE INDEX IF NOT EXISTS "IX_Horarios_EstudianteId_SemestreId_Dia"
    ON "Horarios" ("EstudianteId", "SemestreId", "Dia");

CREATE INDEX IF NOT EXISTS "IX_Auditoria_EscuelaId_Id"
    ON "Auditoria" ("EscuelaId", "Id" DESC);

-- Proyección escalar de personas con contacto vigente sin arrastrar el documento JSON completo.
CREATE OR REPLACE VIEW "vw_personas_resumen" AS
SELECT
    p."Id",
    p."Tipo",
    p."EscuelaId",
    p."Ciclo",
    p."Activa",
    COALESCE(p."DatosJson"->>'codigo', '') AS "Codigo",
    COALESCE(p."DatosJson"->>'nombres', '') AS "Nombres",
    COALESCE(p."DatosJson"->>'apellidos', '') AS "Apellidos",
    btrim(COALESCE(p."DatosJson"->>'nombres', '') || ' ' || COALESCE(p."DatosJson"->>'apellidos', '')) AS "NombreCompleto",
    COALESCE(c."Correo", p."DatosJson"->>'correo', '') AS "Correo"
FROM "Personas" p
LEFT JOIN "Contactos" c ON c."PersonaId" = p."Id";

-- Ficha ligera para /api/tutoria/estado y detalle de padrón: une Contacto y quita lo que el portal no muestra
-- (procedencia del Excel y apellidos por separado, ya unidos en "apellidos"). Con el padrón completo, la vista
-- de todas las escuelas enviaba ~360 KB de esos campos.
CREATE OR REPLACE VIEW "vw_personas_estado" AS
SELECT
    p."Id",
    p."Tipo",
    p."EscuelaId",
    p."Ciclo",
    p."Activa",
    (
        p."DatosJson" - 'origen' - 'apellidoPaterno' - 'apellidoMaterno'
        || CASE
            WHEN p."Tipo" = 'estudiante' THEN jsonb_build_object('ciclo', p."Ciclo")
            WHEN p."Tipo" = 'tutor' THEN jsonb_build_object('activo', p."Activa")
            ELSE '{}'::jsonb
        END
        || CASE
            WHEN c."PersonaId" IS NOT NULL THEN jsonb_build_object('correo', c."Correo", 'telefono', c."Telefono")
            ELSE '{}'::jsonb
        END
    )::text AS "DatosEstado"
FROM "Personas" p
LEFT JOIN "Contactos" c ON c."PersonaId" = p."Id";

-- Matrículas para /api/tutoria/estado sin procedencia ni bloques originales por curso del Excel.
CREATE OR REPLACE VIEW "vw_matriculas_estado" AS
SELECT
    m."Id",
    m."EstudianteId",
    m."SemestreId",
    (
        CASE
            WHEN jsonb_typeof(m."DatosJson"->'cursos') = 'array' THEN
                jsonb_set(
                    m."DatosJson" - 'origen',
                    '{cursos}',
                    COALESCE(
                        (
                            SELECT jsonb_agg(
                                CASE
                                    WHEN jsonb_typeof(curso) = 'object' THEN curso - 'horariosOriginales'
                                    ELSE curso
                                END
                            )
                            FROM jsonb_array_elements(m."DatosJson"->'cursos') AS curso
                        ),
                        '[]'::jsonb
                    )
                )
            ELSE m."DatosJson" - 'origen'
        END
    )::text AS "DatosEstado"
FROM "Matriculas" m;

-- Directorio unificado de cuentas para mensajería, auditoría y administración sin truncamiento ni blobs JSON.
CREATE OR REPLACE VIEW "vw_directorio_usuarios" AS
SELECT
    u."Id",
    u."PersonaId",
    u."EscuelaId",
    p."EscuelaId" AS "PersonaEscuelaId",
    u."Rol",
    u."Identificador",
    u."Activo",
    u."Version",
    u."AdminInstitucional",
    CASE
        WHEN p."NombreCompleto" <> '' THEN p."NombreCompleto"
        ELSE u."Identificador"
    END AS "Nombre",
    p."NombreCompleto",
    p."Correo"
FROM "Usuarios" u
JOIN "vw_personas_resumen" p ON p."Id" = u."PersonaId";

-- Derivaciones (Formato 12 cerrado) cruzadas con su seguimiento de área para todos los roles.
CREATE OR REPLACE VIEW "vw_derivaciones_seguimiento" AS
SELECT
    d."Id" AS "InstrumentoId",
    d."EstudianteId",
    d."TutorId",
    d."EscuelaId",
    d."SemestreId",
    COALESCE(d."RespuestasJson"->>'area', '') AS "AreaTexto",
    CASE d."RespuestasJson"->>'area'
        WHEN 'Psicología' THEN 'psicologia'
        WHEN 'Psicopedagogía' THEN 'psicopedagogia'
        WHEN 'Medicina y Salud' THEN 'medicina'
        WHEN 'Bienestar y Servicio Social' THEN 'bienestar-social'
        ELSE 'tutoria-academica'
    END AS "AreaCodigo",
    COALESCE(d."RespuestasJson"->>'motivo', '') AS "MotivoTexto",
    CASE
        WHEN d."RespuestasJson"->>'motivo' = 'Otro' THEN
            CASE
                WHEN d."RespuestasJson" ? 'motivo__otro' THEN COALESCE(d."RespuestasJson"->>'motivo__otro', 'Apoyo especializado')
                ELSE 'Apoyo especializado'
            END
        WHEN d."RespuestasJson" ? 'motivo' THEN COALESCE(d."RespuestasJson"->>'motivo', 'Apoyo especializado')
        ELSE 'Apoyo especializado'
    END AS "MotivoSistema",
    COALESCE(d."RespuestasJson"->>'detalle', '') AS "Detalle",
    d."RespuestasJson"->>'fecha' AS "FechaRespuesta",
    COALESCE(d."RespuestasJson"->>'nombreTutor', 'Tutor') AS "NombreTutor",
    s."Prioridad",
    s."Estado",
    s."ResponsableArea",
    s."SiguienteAccion",
    s."FechaCita",
    s."RecomendacionComunicable",
    s."VigenciaRecomendacion",
    d."Actualizado" AS "InstrumentoActualizado",
    COALESCE(s."Actualizado", d."Actualizado") AS "Actualizado",
    s."HistorialJson"::text AS "Historial",
    COALESCE(s."Version", 0) AS "Version",
    (s."Id" IS NOT NULL) AS "TieneSeguimiento"
FROM "Instrumentos" d
LEFT JOIN "Seguimientos" s ON s."InstrumentoId" = d."Id"
WHERE d."Formato" = 'F12' AND d."Estado" IN ('enviado', 'aprobado');

-- Avance consolidado por estudiante asignado para monitoreo de escuela.
CREATE OR REPLACE VIEW "vw_monitoreo_estudiantes" AS
SELECT
    a."EscuelaId",
    a."SemestreId",
    a."EstudianteId",
    a."TutorId",
    a."Grupo",
    e."Ciclo",
    ent."Formato" AS "EntrevistaFormato",
    COALESCE(ent."Estado", 'sin-habilitar') AS "EntrevistaEstado",
    COALESCE(ent."Avance", 0) AS "EntrevistaAvance",
    COALESCE(asis."SesionesAsistidas", 0)::integer AS "SesionesAsistidas",
    COALESCE(eval."EvaluacionesEnviadas", 0)::integer AS "EvaluacionesEnviadas",
    GREATEST(0, COALESCE(asis."SesionesAsistidas", 0) - COALESCE(eval."EvaluacionesEnviadas", 0))::integer AS "EvaluacionesPendientes",
    COALESCE(inst."FormatosEnviados", 0)::integer AS "FormatosEnviados",
    COALESCE(inst."Derivaciones", 0)::integer AS "Derivaciones",
    inst."UltimaActividadUtc"
FROM "Asignaciones" a
LEFT JOIN "Personas" e
    ON e."Id" = a."EstudianteId"
    AND e."EscuelaId" = a."EscuelaId"
    AND e."Tipo" = 'estudiante'
    AND e."Activa" = TRUE
LEFT JOIN LATERAL (
    SELECT i."Formato", i."Estado", i."Avance"
    FROM "Instrumentos" i
    WHERE i."EscuelaId" = a."EscuelaId"
      AND i."SemestreId" = a."SemestreId"
      AND i."EstudianteId" = a."EstudianteId"
      AND i."Formato" IN ('F03', 'F04', 'F05')
    ORDER BY i."Id"
    LIMIT 1
) ent ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT s."Id") AS "SesionesAsistidas"
    FROM "Sesiones" s
    JOIN "Asistencias" x ON x."SesionId" = s."Id"
    WHERE s."EscuelaId" = a."EscuelaId"
      AND s."SemestreId" = a."SemestreId"
      AND s."Estado" = 'realizada'
      AND s."AsistenciaConfirmada" = TRUE
      AND x."EstudianteId" = a."EstudianteId"
      AND x."Estado" IN ('asistio', 'tarde')
) asis ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS "EvaluacionesEnviadas"
    FROM "Instrumentos" i
    JOIN "Sesiones" s ON s."Id" = i."SesionId"
    JOIN "Asistencias" x ON x."SesionId" = s."Id" AND x."EstudianteId" = a."EstudianteId"
    WHERE i."EscuelaId" = a."EscuelaId"
      AND i."SemestreId" = a."SemestreId"
      AND i."EstudianteId" = a."EstudianteId"
      AND i."Estado" IN ('enviado', 'aprobado')
      AND i."Formato" IN ('F10', 'F11')
      AND s."EscuelaId" = a."EscuelaId"
      AND s."SemestreId" = a."SemestreId"
      AND s."Estado" = 'realizada'
      AND s."AsistenciaConfirmada" = TRUE
      AND x."Estado" IN ('asistio', 'tarde')
) eval ON TRUE
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE i."Estado" IN ('enviado', 'aprobado')) AS "FormatosEnviados",
        COUNT(*) FILTER (WHERE i."Formato" = 'F12' AND i."Estado" IN ('enviado', 'aprobado')) AS "Derivaciones",
        MAX(i."Actualizado") AS "UltimaActividadUtc"
    FROM "Instrumentos" i
    WHERE i."EscuelaId" = a."EscuelaId"
      AND i."SemestreId" = a."SemestreId"
      AND i."EstudianteId" = a."EstudianteId"
) inst ON TRUE
WHERE a."Activa" = TRUE;
