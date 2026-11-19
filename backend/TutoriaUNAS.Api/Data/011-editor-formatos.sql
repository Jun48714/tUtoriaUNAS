CREATE TABLE "BorradoresFormato" (
    "Codigo" text PRIMARY KEY,
    "DefinicionJson" jsonb NOT NULL,
    "Version" integer NOT NULL,
    "VersionPublicada" integer NOT NULL,
    "Actualizado" timestamp with time zone NOT NULL,
    "UsuarioId" text NOT NULL REFERENCES "Usuarios" ("Id") ON DELETE RESTRICT
);
CREATE TABLE "PublicacionesFormato" (
    "Codigo" text NOT NULL,
    "Revision" integer NOT NULL,
    "DefinicionJson" jsonb NOT NULL,
    "Publicado" timestamp with time zone NOT NULL,
    "UsuarioId" text NOT NULL REFERENCES "Usuarios" ("Id") ON DELETE RESTRICT,
    PRIMARY KEY ("Codigo", "Revision")
);
ALTER TABLE "Instrumentos" ADD COLUMN "DefinicionJson" jsonb;
UPDATE "Instrumentos" AS i SET "DefinicionJson" = c."DatosJson"
FROM "Catalogos" AS c
WHERE c."Tipo" = 'formatos' AND c."Id" = i."Formato" AND i."Enviado" IS NOT NULL;
