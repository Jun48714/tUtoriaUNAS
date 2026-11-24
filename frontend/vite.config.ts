import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // En Windows una escritura puede emitir cambios con el archivo aún vacío.
      // Esperar al cierre evita cachear un módulo sin sus exports durante HMR.
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 25 },
    },
    // En desarrollo Vite compila cada módulo la primera vez que se pide: sin esto, el
    // portal (cargado con import() tras el login) se compila mientras el usuario espera.
    warmup: {
      clientFiles: [
        './src/components/layout/AppLayoutConConsultas.tsx',
        './src/pages/*/*Dashboard.tsx',
        './src/services/apiTutoria.ts',
      ],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      output: {
        // Las librerías cambian solo al actualizar dependencias: en archivos propios, el
        // navegador las conserva en caché entre despliegues y las descarga en paralelo.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/].*(react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
              priority: 20,
            },
            // La sesión y las respuestas de acceso se validan con valibot (~10 KB): sí va con el login.
            {
              name: 'vendor-validacion',
              test: /node_modules[\\/]valibot[\\/]/,
              priority: 10,
            },
            // Separados: el login no usa ninguno, así que cada uno se descarga solo si una pantalla lo pide.
            {
              name: 'vendor-consultas',
              test: /node_modules[\\/].*@tanstack[\\/]/,
              priority: 10,
            },
            {
              name: 'vendor-formularios',
              test: /node_modules[\\/].*(react-hook-form|@hookform)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    env: { VITE_DATA_SOURCE: 'demo' },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Se mide la lógica verificable: servicios, utilidades, selectores de
      // datos y los componentes con reglas propias. Las páginas y los volcados
      // de datos ficticios quedan fuera porque son composición y contenido, no
      // lógica; se comprueban con Playwright y axe.
      include: [
        'src/services/demoAuthService.ts',
        'src/utils/csv.ts',
        'src/utils/fechas.ts',
        'src/utils/roles.ts',
        'src/data/academico.ts',
        'src/hooks/usePortal.ts',
        'src/hooks/useFormularioInstrumento.ts',
        'src/utils/validacionInstrumentos.ts',
        'src/components/forms/RoleSelector.tsx',
        'src/routes/ProtectedRoute.tsx',
      ],
      thresholds: { lines: 85, branches: 80, functions: 85, statements: 85 },
    },
  },
});
