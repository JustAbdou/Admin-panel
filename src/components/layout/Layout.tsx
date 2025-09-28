import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useRestaurant();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

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
              </div>

              {/* Mobile backdrop */}
              {isMobileMenuOpen && (
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    zIndex: 9998
                  }}
                  onClick={() => setIsMobileMenuOpen(false)}
                />
              )}

              {/* Mobile dropdown positioned next to sign-out button */}
              <div className="mobile-dropdown-container">
                <button
                  className="mobile-user-btn"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  style={{
                    display: 'none',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    borderRadius: '50%',
                    color: 'var(--text-secondary)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--border-light)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                  title="Menu"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>

                {/* Mobile dropdown positioned absolutely */}
                <div className={`mobile-nav-dropdown ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  boxShadow: 'var(--shadow-lg)',
                  minWidth: '200px',
                  zIndex: 99999,
                  display: 'none',
                  opacity: 0,
                  transform: 'translateY(-10px)',
                  transition: 'all 0.3s ease'
                }}>
                  <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border)',
                    backgroundColor: 'var(--border-light)',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>Signed in as:</div>
                    <div style={{ wordBreak: 'break-word' }}>{user?.email}</div>
                  </div>
                  <ul style={{
                    listStyle: 'none',
                    padding: '0.5rem 0',
                    margin: 0
                  }}>
                    <li>
                      <Link
                        to="/dashboard"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/dashboard') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/dashboard') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/dashboard') ? 'var(--border-light)' : 'transparent'}
                      >
                        Dashboard
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/recipes"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/recipes') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/recipes') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/recipes') ? 'var(--border-light)' : 'transparent'}
                      >
                        Recipes
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/handovers"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/handovers') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/handovers') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/handovers') ? 'var(--border-light)' : 'transparent'}
                      >
                        Handovers
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/users"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/users') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/users') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/users') ? 'var(--border-light)' : 'transparent'}
                      >
                        Users
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/suppliers"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/suppliers') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/suppliers') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/suppliers') ? 'var(--border-light)' : 'transparent'}
                      >
                        Suppliers
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/fridges"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/fridges') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/fridges') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/fridges') ? 'var(--border-light)' : 'transparent'}
                      >
                        Fridges
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/closing"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: isActiveRoute('/closing') ? 'var(--primary-color)' : 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          backgroundColor: isActiveRoute('/closing') ? 'var(--border-light)' : 'transparent'
                        }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActiveRoute('/closing') ? 'var(--border-light)' : 'transparent'}
                      >
                        Closing
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="btn btn-secondary btn-sm sign-out-icon"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16,17 21,12 16,7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
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
