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
  setRestaurantId: (id: string) => void;
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
            const fetchedRestaurantId = userData.restaurantId;
            const userRole = userData.role;
            
            console.log('Fetched restaurantId:', fetchedRestaurantId);
            console.log('User role:', userRole);

            setUserRole(userRole);

            if (fetchedRestaurantId) {
              const restaurantDocRef = doc(db, 'restaurants', fetchedRestaurantId);
              const restaurantDoc = await getDoc(restaurantDocRef);

              if (restaurantDoc.exists()) {
                setRestaurantId(fetchedRestaurantId);
                const restaurantData = restaurantDoc.data();
                setRestaurantName(restaurantData?.name || fetchedRestaurantId);
                console.log(`User logged into restaurant: ${fetchedRestaurantId}`);
              } else {
                console.error('Restaurant ID does not exist.');
                setRestaurantId(null);
                setRestaurantName(null);
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
    setRestaurantId,
  };

  console.log('Current Restaurant ID:', restaurantId);

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
};
