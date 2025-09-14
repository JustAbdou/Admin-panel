import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, enableNetwork } from 'firebase/firestore';

interface RestaurantContextType {
  restaurantId: string | null;
  restaurantName: string | null;
  user: User | null;
  userRole: string | null;
  loading: boolean;
  availableRestaurants: Array<{id: string, name: string}>;
  setRestaurantId: (id: string) => void;
  switchRestaurant: (id: string) => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | null>(null);

export const useRestaurant = () => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
};

export const RestaurantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableRestaurants, setAvailableRestaurants] = useState<Array<{id: string, name: string}>>([]);

  // Function to switch between restaurants
  const switchRestaurant = async (newRestaurantId: string) => {
    try {
      const restaurantDocRef = doc(db, 'restaurants', newRestaurantId);
      const restaurantDoc = await getDoc(restaurantDocRef);
      
      if (restaurantDoc.exists()) {
        setRestaurantId(newRestaurantId);
        const restaurantData = restaurantDoc.data();
        setRestaurantName(restaurantData?.name || newRestaurantId);
        
        // Save current restaurant preference to localStorage
        localStorage.setItem('currentRestaurantId', newRestaurantId);
        
        console.log(`Switched to restaurant: ${newRestaurantId}`);
      } else {
        console.error('Restaurant does not exist:', newRestaurantId);
      }
    } catch (error) {
      console.error('Error switching restaurant:', error);
    }
  };

  // Function to load available restaurants for the user
  const loadAvailableRestaurants = async (restaurantIds: string[]) => {
    const restaurants: Array<{id: string, name: string}> = [];
    
    for (const id of restaurantIds) {
      try {
        const restaurantDocRef = doc(db, 'restaurants', id);
        const restaurantDoc = await getDoc(restaurantDocRef);
        
        if (restaurantDoc.exists()) {
          const data = restaurantDoc.data();
          restaurants.push({
            id: id,
            name: data?.name || id
          });
        }
      } catch (error) {
        console.error(`Error loading restaurant ${id}:`, error);
      }
    }
    
    setAvailableRestaurants(restaurants);
    return restaurants;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      console.log('Current user information:', currentUser);
      
      if (currentUser) {
        try {
          await enableNetwork(db);

          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);

          console.log('Fetched user document:', userDoc.data());

          if (userDoc.exists()) {
            console.log('User information:', userDoc.data());
            const userData = userDoc.data();
            const primaryRestaurantId = userData.restaurantId;
            const restaurantIds = userData.restaurantIds || [primaryRestaurantId]; // Support multiple restaurants
            const userRole = userData.role;
            
            console.log('Primary restaurantId:', primaryRestaurantId);
            console.log('All restaurant IDs:', restaurantIds);
            console.log('User role:', userRole);

            setUserRole(userRole);

            // Load all available restaurants for this user
            if (restaurantIds && restaurantIds.length > 0) {
              await loadAvailableRestaurants(restaurantIds);
              
              // Determine which restaurant to load initially
              const savedRestaurantId = localStorage.getItem('currentRestaurantId');
              const initialRestaurantId = 
                (savedRestaurantId && restaurantIds.includes(savedRestaurantId)) 
                  ? savedRestaurantId 
                  : primaryRestaurantId;

              if (initialRestaurantId) {
                const restaurantDocRef = doc(db, 'restaurants', initialRestaurantId);
                const restaurantDoc = await getDoc(restaurantDocRef);

                if (restaurantDoc.exists()) {
                  setRestaurantId(initialRestaurantId);
                  const restaurantData = restaurantDoc.data();
                  setRestaurantName(restaurantData?.name || initialRestaurantId);
                  console.log(`User logged into restaurant: ${initialRestaurantId}`);
                } else {
                  console.error('Restaurant ID does not exist.');
                  setRestaurantId(null);
                  setRestaurantName(null);
                }
              }
            } else {
              console.warn('No restaurant ID found for the user.');
              setRestaurantId(null);
              setRestaurantName(null);
            }
          } else {
            console.warn('User document does not exist.');
            setRestaurantId(null);
          }
        } catch (error) {
          console.error('Error verifying restaurant ID:', error);
          setRestaurantId(null);
        }
      } else {
        setRestaurantId(null);
        setRestaurantName(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: RestaurantContextType = {
    restaurantId,
    restaurantName,
    user,
    userRole,
    loading,
    availableRestaurants,
    setRestaurantId,
    switchRestaurant,
  };

  console.log('Current Restaurant ID:', restaurantId);

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
};
