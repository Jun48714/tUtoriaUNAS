UPDATE "Instrumentos" AS i
SET "DefinicionJson" = c."DatosJson"
FROM "Catalogos" AS c
WHERE c."Tipo" = 'formatos' AND c."Id" = 'F08'
  AND i."Formato" = c."Id" AND i."Enviado" IS NOT NULL AND i."DefinicionJson" IS NULL;

WITH motivos AS (
    SELECT c."Id", ARRAY['secciones', (s.pos - 1)::text, 'campos', (f.pos - 1)::text] AS ruta
    FROM "Catalogos" AS c
    CROSS JOIN LATERAL jsonb_array_elements(c."DatosJson" -> 'secciones') WITH ORDINALITY AS s(seccion, pos)
    CROSS JOIN LATERAL jsonb_array_elements(s.seccion -> 'campos') WITH ORDINALITY AS f(campo, pos)
    WHERE c."Tipo" = 'formatos' AND c."Id" = 'F08' AND f.campo ->> 'codigo' = 'motivo'
      AND f.campo -> 'opciones' = '["Dificultades de estudio","Organización del tiempo","Riesgo académico","Situación personal","Situación familiar","Necesidad de apoyo especializado","Otro"]'::jsonb
)
UPDATE "Catalogos" AS c
SET "DatosJson" = jsonb_set(
      jsonb_set(
        jsonb_set(c."DatosJson", m.ruta || ARRAY['opciones'], '["Estudiantes académicos","Estudiantes sobresalientes","Estudiantes becados","Otro"]'::jsonb),
        m.ruta || ARRAY['etiqueta'], '"Motivo de atención"'::jsonb),
      '{revision}', to_jsonb(c."Version" + 1)),
    "Version" = c."Version" + 1
FROM motivos AS m
WHERE c."Tipo" = 'formatos' AND c."Id" = m."Id";
