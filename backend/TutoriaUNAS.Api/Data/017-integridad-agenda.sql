CREATE FUNCTION hora_minuto_valida(hora text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT
AS $$
    SELECT hora COLLATE "C" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
$$;

ALTER TABLE "Sesiones"
    ADD CONSTRAINT "CK_Sesiones_Horario" CHECK (
        CASE WHEN "Fecha" COLLATE "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND pg_input_is_valid("Fecha", 'date')
            AND hora_minuto_valida("HoraInicio") AND hora_minuto_valida("HoraFin")
        THEN "HoraInicio" COLLATE "C" < "HoraFin"
            AND "FinUtc" = ("Fecha" || 'T' || "HoraFin" || ':00-05:00')::timestamptz
        ELSE false END
    ),
    ADD CONSTRAINT "CK_Sesiones_Clasificacion" CHECK (
        "Tipo" IN ('individual', 'grupal') AND "Modalidad" IN ('presencial', 'virtual', 'mixta')
        AND "Estado" IN ('programada', 'realizada', 'cancelada', 'reprogramada')
        AND (NOT "AsistenciaConfirmada" OR "Estado" = 'realizada')
    );

ALTER TABLE "Horarios"
    ADD CONSTRAINT "CK_Horarios_Bloque" CHECK (
        "Dia" BETWEEN 1 AND 7 AND hora_minuto_valida("HoraInicio") AND hora_minuto_valida("HoraFin")
        AND "HoraInicio" COLLATE "C" < "HoraFin"
    );

ALTER TABLE "Asistencias"
    ADD CONSTRAINT "CK_Asistencias_Registro" CHECK (
        "Estado" IN ('asistio', 'tarde', 'falto', 'justificado')
        AND ("HoraRegistro" IS NULL OR hora_minuto_valida("HoraRegistro"))
    );

ALTER TABLE "Usuarios"
    ADD CONSTRAINT "CK_Usuarios_RolCoordinadorEscuela" CHECK (
        "Rol" IN ('estudiante', 'tutor', 'coordinacion') AND (NOT "CoordinadorEscuela" OR "Rol" = 'tutor')
    );

CREATE TABLE "GuardasOcupacionTutoria" (
    "PersonaId" text PRIMARY KEY REFERENCES "Personas" ("Id") ON DELETE CASCADE
);

CREATE FUNCTION comprobar_ocupacion_tutoria(sesion_id text, estudiante_id text)
RETURNS void LANGUAGE plpgsql
AS $$
DECLARE
    sesion "Sesiones"%ROWTYPE;
    participantes text[];
BEGIN
    -- La asistencia puede cambiar a la vez que se mueve su sesión.
    SELECT * INTO sesion FROM "Sesiones" WHERE "Id" = sesion_id FOR SHARE;
    IF NOT FOUND OR sesion."Estado" NOT IN ('programada', 'realizada') THEN
        RETURN;
    END IF;

    IF estudiante_id IS NULL THEN
        participantes := ARRAY(
            SELECT "EstudianteId" FROM "Asistencias" WHERE "SesionId" = sesion_id
        );
    ELSIF EXISTS (
        SELECT 1 FROM "Asistencias" WHERE "SesionId" = sesion_id AND "EstudianteId" = estudiante_id
    ) THEN
        participantes := ARRAY[estudiante_id];
    ELSE
        RETURN;
    END IF;

    -- Escribir la fila serializa por persona y protege también las transacciones
    -- con una instantánea fija, que deben reintentar si la fila cambió.
    INSERT INTO "GuardasOcupacionTutoria" ("PersonaId")
    SELECT id FROM (
        SELECT DISTINCT unnest(
            CASE WHEN estudiante_id IS NULL THEN array_append(participantes, sesion."TutorId") ELSE participantes END
        ) AS id
    ) AS personas
    ORDER BY id COLLATE "C"
    ON CONFLICT ("PersonaId") DO UPDATE SET "PersonaId" = EXCLUDED."PersonaId";

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT s."Id", s."Fecha", s."Estado", s."HoraInicio", s."HoraFin"
            FROM "Sesiones" s
            WHERE estudiante_id IS NULL AND s."TutorId" = sesion."TutorId"
            UNION ALL
            SELECT s."Id", s."Fecha", s."Estado", s."HoraInicio", s."HoraFin"
            FROM "Asistencias" a
            JOIN "Sesiones" s ON s."Id" = a."SesionId"
            WHERE a."EstudianteId" = ANY(participantes)
        ) AS otra
        WHERE otra."Id" <> sesion_id AND otra."Fecha" = sesion."Fecha"
          AND otra."Estado" IN ('programada', 'realizada')
          AND otra."HoraInicio" COLLATE "C" < sesion."HoraFin"
          AND sesion."HoraInicio" COLLATE "C" < otra."HoraFin"
    ) THEN
        RAISE EXCEPTION 'El tutor o un estudiante ya tiene otra sesión en ese horario.'
            USING ERRCODE = '23P01', CONSTRAINT = 'EX_Sesiones_Ocupacion';
    END IF;
END;
$$;

-- Valida también los registros que ya existían antes de activar los disparadores.
DO $$
DECLARE
    sesion_id text;
BEGIN
    FOR sesion_id IN SELECT "Id" FROM "Sesiones" WHERE "Estado" IN ('programada', 'realizada') ORDER BY "Id"
    LOOP
        PERFORM comprobar_ocupacion_tutoria(sesion_id, NULL);
    END LOOP;
END;
$$;

CREATE FUNCTION validar_ocupacion_tutoria()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'Sesiones' THEN
        PERFORM comprobar_ocupacion_tutoria(NEW."Id", NULL);
    ELSE
        PERFORM comprobar_ocupacion_tutoria(NEW."SesionId", NEW."EstudianteId");
    END IF;
    RETURN NULL;
END;
$$;

-- Reprogramar cambia la sesión original y registra su reemplazo en una transacción.
CREATE CONSTRAINT TRIGGER "TR_Sesiones_Ocupacion"
    AFTER INSERT OR UPDATE OF "TutorId", "Fecha", "HoraInicio", "HoraFin", "Estado" ON "Sesiones"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_ocupacion_tutoria();

CREATE CONSTRAINT TRIGGER "TR_Asistencias_Ocupacion"
    AFTER INSERT OR UPDATE OF "SesionId", "EstudianteId" ON "Asistencias"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_ocupacion_tutoria();
