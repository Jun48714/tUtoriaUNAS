import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { dashboardPath } from '../../utils/roles';

export function UnauthorizedPage() {
  const { user } = useAuth();
  return (
    <main id="main-content" className="error-page">
      <h1>Esta página pertenece a otro rol</h1>
      <Link className="button button--primary" to={user ? dashboardPath(user.role) : '/login'}>
        Volver a mi portal
      </Link>
    </main>
  );
}
