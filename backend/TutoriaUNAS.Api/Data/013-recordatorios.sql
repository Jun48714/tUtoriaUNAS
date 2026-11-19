-- Recordatorios por correo de actividades pendientes (estudiante y docente).
-- Una fila por usuario y pendiente: permite fijar el vencimiento una sola vez, limitar la frecuencia
-- y dejar de avisar tras un máximo de recordatorios.
CREATE TABLE "RecordatoriosPendientes" (
    "UsuarioId" text NOT NULL REFERENCES "Usuarios" ("Id") ON DELETE CASCADE,
    "Clave" text NOT NULL,
    "PrimerAviso" timestamptz NOT NULL,
    "UltimoAviso" timestamptz NOT NULL,
    "Veces" integer NOT NULL DEFAULT 0,
    "Vence" date NOT NULL,
    PRIMARY KEY ("UsuarioId", "Clave")
);
CREATE TABLE "RecordatoriosControl" (
    "Clave" text PRIMARY KEY,
    "Valor" text NOT NULL
);
