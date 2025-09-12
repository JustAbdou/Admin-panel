import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRestaurant } from '../../contexts/RestaurantContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, userRole, loading } = useRestaurant();

  if (loading) {
    return (
      <div className="loading" style={{ height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  // Allow admins (restaurant owners) and managers to access the admin panel
  if (userRole !== 'admin' && userRole !== 'manager') {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        backgroundColor: 'var(--background)',
        color: 'var(--text-primary)'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Access Denied</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
          Only restaurant admins and managers can access the admin panel.
        </p>
        <button 
          onClick={() => window.location.href = '/signin'} 
          className="btn btn-primary"
        >
          Sign In as Admin/Manager
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
