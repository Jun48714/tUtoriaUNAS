-- Coordinador de escuela: un docente (rol tutor) al que la administración institucional le habilita el módulo
-- de monitoreo de solo lectura de su escuela. No cambia su rol ni sus permisos de docente.
ALTER TABLE "Usuarios" ADD COLUMN "CoordinadorEscuela" boolean NOT NULL DEFAULT false;
