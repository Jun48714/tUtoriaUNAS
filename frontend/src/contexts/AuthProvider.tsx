import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './authContext';
import { authService } from '../services/authService';
import { limpiarConsultas } from '../services/limpiezaConsultas';
import type { LoginCredentials } from '../types/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(() => authService.restore());
  const login = useCallback(async (credentials: LoginCredentials, remember: boolean) => {
    const account = await authService.login(credentials, remember);
    limpiarConsultas();
    setUser(account);
    return account;
  }, []);
  const logout = useCallback(() => {
    authService.logout();
    limpiarConsultas();
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  useEffect(() => {
    window.addEventListener('unas:api-session-expired', logout);
    return () => window.removeEventListener('unas:api-session-expired', logout);
  }, [logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
