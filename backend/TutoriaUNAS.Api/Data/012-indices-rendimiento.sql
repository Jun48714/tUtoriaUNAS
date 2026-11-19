-- Índices para las consultas frecuentes del estado de tutoría y del sistema.
-- Todas filtran por escuela; sin estos índices PostgreSQL recorre las tablas completas
-- (el padrón importado tiene miles de personas, matrículas y horarios).
-- Solo agrega índices: no modifica datos ni columnas.
CREATE INDEX IF NOT EXISTS "IX_Personas_EscuelaId_Tipo" ON "Personas" ("EscuelaId", "Tipo");
CREATE INDEX IF NOT EXISTS "IX_Asignaciones_EscuelaId_Activa" ON "Asignaciones" ("EscuelaId") WHERE "Activa" = TRUE;
CREATE INDEX IF NOT EXISTS "IX_Asignaciones_TutorId_Activa" ON "Asignaciones" ("TutorId", "SemestreId") WHERE "Activa" = TRUE;
CREATE INDEX IF NOT EXISTS "IX_Sesiones_EscuelaId" ON "Sesiones" ("EscuelaId");
CREATE INDEX IF NOT EXISTS "IX_Instrumentos_EscuelaId_Formato" ON "Instrumentos" ("EscuelaId", "Formato");
CREATE INDEX IF NOT EXISTS "IX_Seguimientos_EscuelaId" ON "Seguimientos" ("EscuelaId");
CREATE INDEX IF NOT EXISTS "IX_Mensajes_EscuelaId_Creado" ON "Mensajes" ("EscuelaId", "Creado" DESC);
CREATE INDEX IF NOT EXISTS "IX_Usuarios_EscuelaId" ON "Usuarios" ("EscuelaId");
CREATE INDEX IF NOT EXISTS "IX_Auditoria_UsuarioId_Id" ON "Auditoria" ("UsuarioId", "Id" DESC);
CREATE INDEX IF NOT EXISTS "IX_ActividadesPlan_EscuelaId" ON "ActividadesPlan" ("EscuelaId");
CREATE INDEX IF NOT EXISTS "IX_Expediente_DocumentoId" ON "Expediente" ("DocumentoId");
