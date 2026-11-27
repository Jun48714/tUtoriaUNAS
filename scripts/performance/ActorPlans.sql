\set ON_ERROR_STOP on

BEGIN READ ONLY;
SET LOCAL search_path TO :"schema";

PREPARE identidad_antes(text, text) AS
SELECT u.* FROM "Usuarios" AS u
WHERE u."Subject" = $1 AND u."Issuer" = $2 AND u."Activo"
LIMIT 2;

PREPARE persona_antes(text) AS
SELECT p.* FROM "Personas" AS p WHERE p."Id" = $1 LIMIT 2;

PREPARE actor_despues(text, text) AS
SELECT u.*, p.* FROM "Usuarios" AS u
LEFT JOIN "Personas" AS p ON u."PersonaId" = p."Id"
WHERE u."Subject" = $1 AND u."Issuer" = $2 AND u."Activo"
LIMIT 2;

\echo identidad_antes
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE identidad_antes('DOC-0421', 'local-development');
\echo persona_antes
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE persona_antes('DOC-0421');
\echo actor_despues
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE actor_despues('DOC-0421', 'local-development');
ROLLBACK;
