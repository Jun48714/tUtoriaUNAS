import type { AuthService } from '../types/auth';
import { API_MODE } from './apiConfig';
import { apiAuthService } from './apiAuthService';
import { demoAuthService } from './demoAuthService';

/**
 * Servicio de acceso, separado de serviceRegistry: la pantalla de login solo necesita este,
 * y serviceRegistry arrastra los adaptadores de agenda con sus datos de demostración.
 */
export const authService: AuthService = API_MODE ? apiAuthService : demoAuthService;
