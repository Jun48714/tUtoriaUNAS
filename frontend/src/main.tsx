import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/fonts.css';
import './styles/global.css';
import { recargarPorActualizacion } from './utils/navigation';

// Vite avisa cuando un módulo precargado ya no existe en el servidor (despliegue nuevo).
window.addEventListener('vite:preloadError', (event) => {
  if (recargarPorActualizacion()) event.preventDefault();
});

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor de la aplicación.');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
