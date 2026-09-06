import React from 'react';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { sessionCheckMessage } from '@/services/backend-auth.service';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, sessionIssue, refreshAuth } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        <div className="spinner" />
      </div>
    );
  }

  // Session conservée mais invérifiable (serveur injoignable, quota dépassé…).
  // Sans cet écran, l'utilisateur atterrissait sur la page de connexion sans un
  // mot d'explication : rigoureusement indiscernable d'une déconnexion, alors
  // que son jeton est intact et qu'un simple nouvel essai suffit souvent.
  if (!isAuthenticated && sessionIssue) {
    return (
      <div className="auth-page">
        <div className="auth-aurora" aria-hidden="true" />
        <div className="auth-notice" role="status">
          <h2>Session non vérifiée</h2>
          <p>{sessionCheckMessage(sessionIssue)}</p>
          <div className="auth-notice__actions">
            <Button onClick={() => refreshAuth()} size="lg" autoFocus>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
