import React, { useState } from 'react';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { useRestaurant } from '../../contexts/RestaurantContext';

const JoinRestaurantButton: React.FC = () => {
  const { user, restaurantId } = useRestaurant();
  const [showModal, setShowModal] = useState(false);
  const [restaurantIdInput, setRestaurantIdInput] = useState('');
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [validatedRestaurants, setValidatedRestaurants] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleAddRestaurant = async () => {
    if (!user || !restaurantIdInput.trim()) {
      setErrorMessage('Please enter a restaurant ID');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const trimmedRestaurantId = restaurantIdInput.trim();

      // Check if already in the list
      if (validatedRestaurants.some(r => r.id === trimmedRestaurantId)) {
        setErrorMessage(`"${trimmedRestaurantId}" is already in your list`);
        setIsLoading(false);
        return;
      }

      // Check if restaurant exists
      const restaurantRef = doc(db, 'restaurants', trimmedRestaurantId);
      const restaurantDoc = await getDoc(restaurantRef);

      if (!restaurantDoc.exists()) {
        setErrorMessage(`Restaurant "${trimmedRestaurantId}" does not exist`);
        setIsLoading(false);
        return;
      }

      // Get current user data
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        setErrorMessage('User data not found');
        setIsLoading(false);
        return;
      }

      const userData = userDoc.data();
      const currentRestaurantIds = userData.restaurantIds || [userData.restaurantId];

      // Check if already joined
      if (currentRestaurantIds.includes(trimmedRestaurantId)) {
        setErrorMessage(`You have already joined "${trimmedRestaurantId}"`);
        setIsLoading(false);
        return;
      }

      // Add to validated list
      const restaurantName = restaurantDoc.data()?.name || trimmedRestaurantId;
      setValidatedRestaurants(prev => [...prev, { id: trimmedRestaurantId, name: restaurantName }]);
      setSelectedRestaurantIds(prev => [...prev, trimmedRestaurantId]);
      setRestaurantIdInput('');

    } catch (error: any) {
      console.error('Error validating restaurant:', error);
      setErrorMessage(error.message || 'Failed to validate restaurant. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinAllRestaurants = async () => {
    if (!user || selectedRestaurantIds.length === 0) {
      setErrorMessage('Please add at least one restaurant to join');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // Get current user data
      const userRef = doc(db, 'users', user.uid);

      // Update user document with all new restaurant IDs at once
      await updateDoc(userRef, {
        restaurantIds: arrayUnion(...selectedRestaurantIds)
      });

      setSuccessMessage(`Successfully joined ${selectedRestaurantIds.length} restaurant${selectedRestaurantIds.length > 1 ? 's' : ''}! Refreshing...`);

      // Reload page after 2 seconds to refresh the restaurant switcher
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Error joining restaurants:', error);
      setErrorMessage(error.message || 'Failed to join restaurants. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveRestaurant = (idToRemove: string) => {
    setValidatedRestaurants(prev => prev.filter(r => r.id !== idToRemove));
    setSelectedRestaurantIds(prev => prev.filter(id => id !== idToRemove));
  };

  const handleClose = () => {
    setShowModal(false);
    setRestaurantIdInput('');
    setSelectedRestaurantIds([]);
    setValidatedRestaurants([]);
    setErrorMessage('');
    setSuccessMessage('');
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="join-restaurant-btn compact"
        title="Join Another Restaurant"
      >
        <div className="btn-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
        </div>
        <span className="btn-text">Join Restaurant</span>
      </button>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{
            maxWidth: '500px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              padding: '1.5rem 2rem',
              borderRadius: '16px 16px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px'
                }}>
                  🏪
                </div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
                  Join Restaurant
                </h2>
              </div>
              <button
                onClick={handleClose}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '2rem' }}>
              <p style={{
                fontSize: '0.95rem',
                color: '#6b7280',
                marginBottom: '1.5rem',
                lineHeight: '1.6'
              }}>
                Enter Restaurant IDs to gain access. You can add multiple restaurants at once. You'll be able to switch between your restaurants using the restaurant switcher.
              </p>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontWeight: '500',
                  fontSize: '0.95rem',
                  marginBottom: '0.5rem',
                  color: '#374151'
                }}>
                  Restaurant ID *
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={restaurantIdInput}
                    onChange={(e) => setRestaurantIdInput(e.target.value)}
                    placeholder="e.g., admin-review"
                    disabled={isLoading || !!successMessage}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      fontSize: '1rem',
                      borderRadius: '8px',
                      border: '2px solid #d1d5db',
                      transition: 'border-color 0.2s',
                      opacity: isLoading || successMessage ? 0.6 : 1
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isLoading && !successMessage && restaurantIdInput.trim()) {
                        handleAddRestaurant();
                      }
                    }}
                  />
                  <button
                    onClick={handleAddRestaurant}
                    disabled={isLoading || !restaurantIdInput.trim() || !!successMessage}
                    style={{
                      padding: '0.75rem 1.25rem',
                      background: (isLoading || !restaurantIdInput.trim() || successMessage)
                        ? '#d1d5db'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      cursor: (isLoading || !restaurantIdInput.trim() || successMessage) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading && restaurantIdInput.trim() && !successMessage) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading && restaurantIdInput.trim() && !successMessage) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                      }
                    }}
                  >
                    {isLoading ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>

              {/* List of validated restaurants */}
              {validatedRestaurants.length > 0 && (
                <div style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  backgroundColor: '#f0fdf4',
                  border: '2px solid #bbf7d0',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    color: '#15803d',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>📋</span>
                    Restaurants to Join ({validatedRestaurants.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {validatedRestaurants.map((restaurant) => (
                      <div
                        key={restaurant.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '6px',
                          border: '1px solid #86efac'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '500', color: '#166534', fontSize: '0.95rem' }}>
                            {restaurant.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '0.125rem' }}>
                            ID: {restaurant.id}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveRestaurant(restaurant.id)}
                          disabled={isLoading || !!successMessage}
                          style={{
                            padding: '0.375rem 0.75rem',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            cursor: (isLoading || successMessage) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            opacity: (isLoading || successMessage) ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (!isLoading && !successMessage) {
                              e.currentTarget.style.backgroundColor = '#fecaca';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isLoading && !successMessage) {
                              e.currentTarget.style.backgroundColor = '#fee2e2';
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errorMessage && (
                <div style={{
                  padding: '0.875rem 1rem',
                  backgroundColor: '#fee2e2',
                  border: '2px solid #fecaca',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                  <span style={{ color: '#991b1b', fontSize: '0.9rem', fontWeight: '500' }}>
                    {errorMessage}
                  </span>
                </div>
              )}

              {successMessage && (
                <div style={{
                  padding: '0.875rem 1rem',
                  background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                  border: '2px solid #10b981',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.25rem' }}>✓</span>
                  <span style={{ color: '#065f46', fontSize: '0.9rem', fontWeight: '500' }}>
                    {successMessage}
                  </span>
                </div>
              )}

              <div style={{
                display: 'flex',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '2px solid #e5e7eb'
              }}>
                <button
                  onClick={handleJoinAllRestaurants}
                  disabled={isLoading || selectedRestaurantIds.length === 0 || !!successMessage}
                  style={{
                    flex: 1,
                    padding: '0.875rem 1.5rem',
                    background: (isLoading || selectedRestaurantIds.length === 0 || successMessage)
                      ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: (isLoading || selectedRestaurantIds.length === 0 || successMessage) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && selectedRestaurantIds.length > 0 && !successMessage) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading && selectedRestaurantIds.length > 0 && !successMessage) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                    }
                  }}
                >
                  {isLoading ? (
                    <>
                      <div style={{
                        width: '18px',
                        height: '18px',
                        border: '3px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '3px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      Joining...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.1rem' }}>➕</span>
                      Join {selectedRestaurantIds.length > 0 ? `${selectedRestaurantIds.length} ` : ''}Restaurant{selectedRestaurantIds.length > 1 ? 's' : ''}
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  style={{
                    padding: '0.875rem 1.5rem',
                    backgroundColor: 'white',
                    color: '#64748b',
                    border: '2px solid #e2e8f0',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: isLoading ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default JoinRestaurantButton;
