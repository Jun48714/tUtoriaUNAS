ALTER TABLE "Sesiones" ADD COLUMN "EvidenciaNombre" text;

CREATE TABLE "EvidenciasSesion" (
    "SesionId" text PRIMARY KEY REFERENCES "Sesiones" ("Id") ON DELETE CASCADE,
    "Tipo" text NOT NULL CHECK ("Tipo" IN ('application/pdf', 'image/jpeg')),
    "Contenido" bytea NOT NULL CHECK (octet_length("Contenido") BETWEEN 1 AND 8388608),
    "Comprimido" boolean NOT NULL
);
