import type { DemoUser } from '../types/auth';

// Cuentas ficticias de demostración. La contraseña común se define en VITE_DEMO_PASSWORD
// (frontend/.env.local) y nunca debe ser aceptada por una autenticación de producción.
export const DEMO_PASSWORD: string = import.meta.env.VITE_DEMO_PASSWORD ?? '';

export const demoAccounts: readonly DemoUser[] = [
  {
    id: 'EST-2023010456',
    role: 'estudiante',
    name: 'Ana Lucía Quispe Rojas',
    identifier: '2023010456',
    email: '2023010456@unas.edu.pe',
  },
  {
    id: 'DOC-0421',
    role: 'tutor',
    name: 'Luis Alberto Vela Ríos',
    identifier: 'DOC-0421',
    email: 'lvela@unas.edu.pe',
  },
  {
    id: 'COM-01',
    role: 'coordinacion',
    name: 'Marta Elena Paredes Auqui',
    identifier: 'coordinacion.tutoria',
    email: 'mparedes@unas.edu.pe',
  },
];
