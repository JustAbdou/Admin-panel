import React, { useState, useRef, useEffect } from 'react';
import { useRestaurant } from '../../contexts/RestaurantContext';

interface RestaurantSwitcherProps {
  compact?: boolean;
}

const RestaurantSwitcher: React.FC<RestaurantSwitcherProps> = ({ compact = false }) => {
  const { restaurantId, restaurantName, availableRestaurants, switchRestaurant } = useRestaurant();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showDropdown && event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showDropdown]);

  const handleSwitchRestaurant = async (newRestaurantId: string) => {
    if (newRestaurantId !== restaurantId) {
      setIsLoading(true);
      try {
        await switchRestaurant(newRestaurantId);
      } catch (error) {
        console.error('Failed to switch restaurant:', error);
      } finally {
        setIsLoading(false);
      }
    }
    setShowDropdown(false);
  };

  // Don't show switcher if user only has one restaurant
  if (availableRestaurants.length <= 1) {
    return (
      <div className="restaurant-fab-single">
        <div className="fab-content">
          <div className="fab-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="fab-text">
            <span className="fab-restaurant-name">{restaurantName}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`restaurant-fab-switcher ${compact ? 'compact' : ''}`} ref={dropdownRef}>
      <button
        className={`restaurant-fab ${showDropdown ? 'fab-active' : ''} ${isLoading ? 'fab-loading' : ''}`}
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isLoading}
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        title={`Switch restaurant (${availableRestaurants.length} available)`}
      >
        <div className="fab-main">
          {isLoading ? (
            <div className="fab-loading-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="m16.24 7.76-2.12 2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M20 12h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="m16.24 16.24-2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="m7.76 16.24 2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="m7.76 7.76 2.12 2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
            <>
              <div className="fab-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="fab-expand-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </>
          )}
        </div>
        <div className="fab-label">
          <span className="fab-primary-text">{restaurantName}</span>
        </div>
      </button>

      {showDropdown && (
        <div className="fab-dropdown" role="listbox">
          <div className="fab-dropdown-header">
            <h3>Switch Restaurant</h3>
            <span className="fab-dropdown-subtitle">{availableRestaurants.length} locations available</span>
          </div>
          <div className="fab-dropdown-content">
            {availableRestaurants.map((restaurant, index) => (
              <button
                key={restaurant.id}
                role="option"
                aria-selected={restaurant.id === restaurantId}
                className={`fab-option ${restaurant.id === restaurantId ? 'fab-option-active' : ''}`}
                onClick={() => handleSwitchRestaurant(restaurant.id)}
                style={{
                  animationDelay: `${index * 50}ms`
                }}
              >
                <div className="fab-option-content">
                  <div className="fab-option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="fab-option-details">
                    <span className="fab-option-name">{restaurant.name}</span>
                    <span className="fab-option-id">ID: {restaurant.id}</span>
                  </div>
                  {restaurant.id === restaurantId && (
                    <div className="fab-option-indicator">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantSwitcher;
