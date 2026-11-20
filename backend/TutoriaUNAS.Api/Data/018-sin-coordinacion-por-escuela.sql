-- El rol "coordinación" de una sola escuela deja de existir como perfil propio:
-- quedan administración institucional, docente (con o sin coordinación de escuela) y estudiante.
-- Las cuentas de coordinación que no son administración pasan a docente coordinador de escuela.
UPDATE "CredencialesCuenta" c
SET "Rol" = 'tutor'
FROM "Usuarios" u
WHERE c."UsuarioId" = u."Id" AND u."Issuer" = 'portal-account' AND u."Rol" = 'coordinacion'
  AND NOT u."AdminInstitucional"
  AND EXISTS (SELECT 1 FROM "Personas" p WHERE p."Id" = u."PersonaId" AND p."Tipo" = 'tutor')
  AND NOT EXISTS (SELECT 1 FROM "Usuarios" t WHERE t."PersonaId" = u."PersonaId" AND t."Rol" = 'tutor' AND t."Issuer" = 'portal-account')
  AND NOT EXISTS (SELECT 1 FROM "CredencialesCuenta" x WHERE x."CorreoNormalizado" = c."CorreoNormalizado" AND x."Rol" = 'tutor');

UPDATE "Usuarios" u
SET "Rol" = 'tutor', "CoordinadorEscuela" = TRUE, "Version" = u."Version" + 1
WHERE u."Issuer" = 'portal-account' AND u."Rol" = 'coordinacion' AND NOT u."AdminInstitucional"
  AND EXISTS (SELECT 1 FROM "Personas" p WHERE p."Id" = u."PersonaId" AND p."Tipo" = 'tutor')
  AND NOT EXISTS (SELECT 1 FROM "Usuarios" t WHERE t."PersonaId" = u."PersonaId" AND t."Rol" = 'tutor' AND t."Issuer" = 'portal-account')
  AND EXISTS (SELECT 1 FROM "CredencialesCuenta" c WHERE c."UsuarioId" = u."Id" AND c."Rol" = 'tutor');
