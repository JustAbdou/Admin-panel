import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, restaurantId, restaurantName } = useRestaurant();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) return;
    
    try {
      await signOut(auth);
      navigate('/signin');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const isActiveRoute = (path: string) => location.pathname === path;

  return (
    <div className="app">
      <header className="header">
        <div className="container">
          <div className="header-content">
            <Link to="/dashboard" className="logo">
              ChefFlow Admin
            </Link>

            <nav>
              <ul className="nav">
                <li>
                  <Link
                    to="/dashboard"
                    className={`nav-link ${isActiveRoute('/dashboard') ? 'active' : ''}`}
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/recipes"
                    className={`nav-link ${isActiveRoute('/recipes') ? 'active' : ''}`}
                  >
                    Recipes
                  </Link>
                </li>
                <li>
                  <Link
                    to="/handovers"
                    className={`nav-link ${isActiveRoute('/handovers') ? 'active' : ''}`}
                  >
                    Handovers
                  </Link>
                </li>
                <li>
                  <Link
                    to="/users"
                    className={`nav-link ${isActiveRoute('/users') ? 'active' : ''}`}
                  >
                    Users
                  </Link>
                </li>
                <li>
                  <Link
                    to="/suppliers"
                    className={`nav-link ${isActiveRoute('/suppliers') ? 'active' : ''}`}
                  >
                    Suppliers
                  </Link>
                </li>
                <li>
                  <Link
                    to="/fridges"
                    className={`nav-link ${isActiveRoute('/fridges') ? 'active' : ''}`}
                  >
                    Fridges
                  </Link>
                </li>
                <li>
                  <Link
                    to="/closing"
                    className={`nav-link ${isActiveRoute('/closing') ? 'active' : ''}`}
                  >
                    Closing
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="user-menu">
              <div className="user-info">
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                  {user?.email}
                </div>
                {(restaurantName || restaurantId) && (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    opacity: 0.8, 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    maxWidth: '200px' 
                  }}>
                    🏪 {restaurantName || restaurantId}
                  </div>
                )}
              </div>
              <button onClick={handleSignOut} className="btn btn-secondary btn-sm">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
