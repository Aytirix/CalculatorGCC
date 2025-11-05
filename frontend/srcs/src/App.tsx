import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import Login from '@/pages/Login/Login';
import Callback from '@/pages/Callback/Callback';
import Dashboard from '@/pages/Dashboard/Dashboard';
import Settings from '@/pages/Settings/Settings';
import ProfessionalExperience from '@/pages/ProfessionalExperience/ProfessionalExperience';
import Setup from '@/pages/Setup/Setup';
import { useSetupCheck } from '@/hooks/useSetupCheck';

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isConfigured, isChecking } = useSetupCheck();

  // Affiche un écran de chargement pendant la vérification de la configuration
  if (isChecking) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Si non configuré, redirige vers setup (sauf si déjà sur /setup)
  if (isConfigured === false && window.location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return (
    <Routes>
      {/* Route de setup - accessible à tous */}
      <Route path="/setup" element={<Setup />} />
      
      <Route 
        path="/" 
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} 
      />
      <Route path="/callback" element={<Callback />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professional-experience"
        element={
          <ProtectedRoute>
            <ProfessionalExperience />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
