-- Eliminar estudiantes desde Gestión de cuentas: nuevo permiso, idempotente.
UPDATE "Permisos" SET "AccionesJson" = '["ver","crear","editar","eliminar"]'
WHERE "Recurso" = 'cuentas' AND "Rol" = 'coordinacion' AND NOT ("AccionesJson" @> '"eliminar"'::jsonb);
