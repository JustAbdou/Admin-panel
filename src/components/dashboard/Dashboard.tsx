import React, { useState, useEffect } from 'react';
import { query, onSnapshot, orderBy, getDoc, doc, updateDoc } from 'firebase/firestore';
import { useRestaurant } from '../../contexts/RestaurantContext';
import {
  getPrepListCollection,
  getOrderListCollection,
  getClosingListCollection,
  getFridgeLogsCollection,
  getDeliveryLogsCollection,
  getRestaurantReference,
  getUserDoc
} from '../../utils/firestoreHelpers';
import { db } from '../../firebase';
import Layout from '../layout/Layout';
import RestaurantSwitcher from '../layout/RestaurantSwitcher';

interface DashboardStats {
  totalPrepItems: number;
  totalOrderItems: number;
  totalClosingItems: number;
}

interface RecentActivity {
  id: string;
  type: 'prep' | 'order' | 'closing' | 'fridge' | 'delivery';
  title: string;
  timestamp: string;
  userName?: string;
  status?: 'done' | 'pending';
}

interface RestaurantInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
}

const fetchUserData = async (restaurantId: string, createdBy: any): Promise<string> => {
  if (createdBy?.fullName) return createdBy.fullName;
  if (createdBy?.userName) return createdBy.userName;
  if (createdBy?.email) return createdBy.email;

  if (typeof createdBy === 'string') {
    try {
      const restaurantUserDoc = await getDoc(getUserDoc(restaurantId, createdBy));
      if (restaurantUserDoc.exists()) {
        const userData = restaurantUserDoc.data();
        return userData.fullName || userData.userName || userData.email || 'Unknown User';
      }

      const rootUserDoc = await getDoc(doc(db, 'users', createdBy));
      if (rootUserDoc.exists()) {
        const userData = rootUserDoc.data();
        return userData.fullName || userData.userName || userData.email || 'Unknown User';
      }
    } catch (error) {
      console.log('Error fetching user data:', error);
    }
  }

  return createdBy?.userName || createdBy?.user || createdBy?.employeeName || 'Unknown User';
};

const Dashboard: React.FC = () => {
  const { restaurantId, availableRestaurants, user } = useRestaurant();
  const [stats, setStats] = useState<DashboardStats>({
    totalPrepItems: 0,
    totalOrderItems: 0,
    totalClosingItems: 0,
  });
  const [restaurantInfo, setRestaurantInfo] = useState<RestaurantInfo | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Restaurant Modal States
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantId, setNewRestaurantId] = useState('');
  const [isAddingRestaurant, setIsAddingRestaurant] = useState(false);
  const [addRestaurantError, setAddRestaurantError] = useState('');

  // Add Restaurant Handler
  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newRestaurantId.trim()) {
      setAddRestaurantError('Please enter a restaurant ID');
      return;
    }

    if (!user) {
      setAddRestaurantError('User not authenticated');
      return;
    }

    setIsAddingRestaurant(true);
    setAddRestaurantError('');

    try {
      console.log('Adding restaurant:', newRestaurantId.trim());
      console.log('Current user:', user.uid);

      // First, check if the restaurant exists
      const restaurantDoc = await getDoc(doc(db, 'restaurants', newRestaurantId.trim()));
      
      if (!restaurantDoc.exists()) {
        console.log('Restaurant not found in database');
        setAddRestaurantError('Restaurant not found. Please check the Restaurant ID.');
        setIsAddingRestaurant(false);
        return;
      }

      console.log('Restaurant found:', restaurantDoc.data());

      // Get current user data
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        console.log('User document not found');
        setAddRestaurantError('User data not found');
        setIsAddingRestaurant(false);
        return;
      }

      const userData = userDoc.data();
      console.log('Current user data:', userData);

      // Get current restaurant IDs - handle both old and new format
      let currentRestaurantIds = [];
      if (userData.restaurantIds && Array.isArray(userData.restaurantIds)) {
        currentRestaurantIds = userData.restaurantIds;
      } else if (userData.restaurantId) {
        currentRestaurantIds = [userData.restaurantId];
      }

      console.log('Current restaurant IDs:', currentRestaurantIds);

      // Check if restaurant is already added
      if (currentRestaurantIds.includes(newRestaurantId.trim())) {
        setAddRestaurantError('This restaurant is already in your account');
        setIsAddingRestaurant(false);
        return;
      }

      // Update user document with new restaurant
      const updatedRestaurantIds = [...currentRestaurantIds, newRestaurantId.trim()];
      console.log('Updating with restaurant IDs:', updatedRestaurantIds);

      await updateDoc(doc(db, 'users', user.uid), {
        restaurantIds: updatedRestaurantIds
      });

      console.log('Restaurant added successfully');

      // Reset form and close modal
      setNewRestaurantId('');
      setShowAddRestaurant(false);
      setAddRestaurantError('');
      
      // Show success message
      alert(`Restaurant "${restaurantDoc.data()?.name || newRestaurantId.trim()}" added successfully!`);
      
      // Refresh the page to update available restaurants
      window.location.reload();
      
    } catch (error) {
      console.error('Error adding restaurant:', error);
      setAddRestaurantError(`Failed to add restaurant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAddingRestaurant(false);
    }
  };

  const resetAddRestaurantForm = () => {
    setNewRestaurantId('');
    setShowAddRestaurant(false);
    setAddRestaurantError('');
  };

  useEffect(() => {
    if (!restaurantId) return;

    const unsubscribes: (() => void)[] = [];

    const fetchRestaurantInfo = async () => {
      try {
        const restaurantRef = getRestaurantReference(restaurantId);
        const restaurantDoc = await getDoc(restaurantRef);

        if (restaurantDoc.exists()) {
          setRestaurantInfo(restaurantDoc.data() as RestaurantInfo);
          console.log('Restaurant info:', restaurantDoc.data());
        } else {
          console.warn('Restaurant document does not exist');
          setRestaurantInfo({
            name: restaurantId,
            createdAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error fetching restaurant info:', error);
      }
    };

    fetchRestaurantInfo();

    const prepQuery = query(getPrepListCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubPrep = onSnapshot(prepQuery, async (snapshot) => {
      const activePrepItems = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.done === false || data.done === undefined;
      });
      setStats(prev => ({ ...prev, totalPrepItems: activePrepItems.length }));

      const prepActivitiesPromises = snapshot.docs.slice(0, 5).map(async (doc) => {
        const data = doc.data();
        let timestamp = new Date().toISOString();
        if (data.createdAt) {
          if (data.createdAt.toDate) {
            timestamp = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            timestamp = new Date(data.createdAt.seconds * 1000).toISOString();
          } else if (typeof data.createdAt === 'string') {
            timestamp = data.createdAt;
          }
        }

        const userName = await fetchUserData(restaurantId, data.createdBy);

        const status: 'done' | 'pending' = data.done === true ? 'done' : 'pending';

        return {
          id: doc.id,
          type: 'prep' as const,
          title: `📋 Prep Item: ${data.name || 'Unknown item'}`,
          timestamp,
          userName,
          status,
        };
      });

      const prepActivities = await Promise.all(prepActivitiesPromises);

      setRecentActivity(prev => {
        const otherActivities = prev.filter(activity => activity.type !== 'prep');
        return [...prepActivities, ...otherActivities].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 10);
      });
    });
    unsubscribes.push(unsubPrep);

    const orderQuery = query(getOrderListCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubOrder = onSnapshot(orderQuery, async (snapshot) => {
      const activeOrderItems = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.done === false || data.done === undefined;
      });
      setStats(prev => ({ ...prev, totalOrderItems: activeOrderItems.length }));

      const orderActivitiesPromises = snapshot.docs.slice(0, 5).map(async (doc) => {
        const data = doc.data();
        let timestamp = new Date().toISOString();
        if (data.createdAt) {
          if (data.createdAt.toDate) {
            timestamp = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            timestamp = new Date(data.createdAt.seconds * 1000).toISOString();
          } else if (typeof data.createdAt === 'string') {
            timestamp = data.createdAt;
          }
        }

        const userName = await fetchUserData(restaurantId, data.createdBy);

        const status: 'done' | 'pending' = data.done === true ? 'done' : 'pending';

        return {
          id: doc.id,
          type: 'order' as const,
          title: `📝 Order Item: ${data.name || 'Unknown item'}`,
          timestamp,
          userName,
          status,
        };
      });

      const orderActivities = await Promise.all(orderActivitiesPromises);

      setRecentActivity(prev => {
        const otherActivities = prev.filter(activity => activity.type !== 'order');
        return [...orderActivities, ...otherActivities].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 10);
      });

      setLoading(false);
    });
    unsubscribes.push(unsubOrder);

    const closingQuery = query(getClosingListCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubClosing = onSnapshot(closingQuery, async (snapshot) => {
      const activeClosingItems = snapshot.docs.filter(doc => {
        const data = doc.data();
        return !data.done; // Only count incomplete items
      });
      setStats(prev => ({ ...prev, totalClosingItems: activeClosingItems.length }));

      const closingActivitiesPromises = snapshot.docs.slice(0, 5).map(async (doc) => {
        const data = doc.data();
        let timestamp = new Date().toISOString();
        if (data.createdAt) {
          if (data.createdAt.toDate) {
            timestamp = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            timestamp = new Date(data.createdAt.seconds * 1000).toISOString();
          } else if (typeof data.createdAt === 'string') {
            timestamp = data.createdAt;
          }
        }

        const userName = await fetchUserData(restaurantId, data.createdBy);

        const status: 'done' | 'pending' = data.done === true ? 'done' : 'pending';

        return {
          id: doc.id,
          type: 'closing' as const,
          title: `🏁 Closing Item: ${data.name || 'Unknown item'}`,
          timestamp,
          userName,
          status,
        };
      });

      const closingActivities = await Promise.all(closingActivitiesPromises);

      setRecentActivity(prev => {
        const otherActivities = prev.filter(activity => activity.type !== 'closing');
        return [...closingActivities, ...otherActivities].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 10);
      });
    });
    unsubscribes.push(unsubClosing);

    const fridgeQuery = query(getFridgeLogsCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubFridge = onSnapshot(fridgeQuery, async (snapshot) => {
      const fridgeActivitiesPromises = snapshot.docs.slice(0, 5).map(async (doc) => {
        const data = doc.data();
        let timestamp = new Date().toISOString();
        if (data.createdAt) {
          if (data.createdAt.toDate) {
            timestamp = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            timestamp = new Date(data.createdAt.seconds * 1000).toISOString();
          } else if (typeof data.createdAt === 'string') {
            timestamp = data.createdAt;
          }
        }

        const userName = await fetchUserData(restaurantId, data.createdBy);

        return {
          id: doc.id,
          type: 'fridge' as const,
          title: `❄️ Fridge Log: ${data.fridgeName || data.fridge || data.action || data.name || data.description || data.item || 'Fridge activity'}`,
          timestamp,
          userName,
          status: undefined,
        };
      });

      const fridgeActivities = await Promise.all(fridgeActivitiesPromises);

      setRecentActivity(prev => {
        const otherActivities = prev.filter(activity => activity.type !== 'fridge');
        return [...fridgeActivities, ...otherActivities].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 10);
      });
    });
    unsubscribes.push(unsubFridge);

    const deliveryQuery = query(getDeliveryLogsCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubDelivery = onSnapshot(deliveryQuery, async (snapshot) => {
      const deliveryActivitiesPromises = snapshot.docs.slice(0, 5).map(async (doc) => {
        const data = doc.data();
        let timestamp = new Date().toISOString();
        if (data.createdAt) {
          if (data.createdAt.toDate) {
            timestamp = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            timestamp = new Date(data.createdAt.seconds * 1000).toISOString();
          } else if (typeof data.createdAt === 'string') {
            timestamp = data.createdAt;
          }
        }

        const userName = await fetchUserData(restaurantId, data.createdBy);

        return {
          id: doc.id,
          type: 'delivery' as const,
          title: `🌡️ Temperature Log: ${data.supplierName || data.supplier || data.temperature || data.reading || data.value || data.name || data.description || 'Temperature reading'}`,
          timestamp,
          userName,
          status: undefined,
        };
      });

      const deliveryActivities = await Promise.all(deliveryActivitiesPromises);

      setRecentActivity(prev => {
        const otherActivities = prev.filter(activity => activity.type !== 'delivery');
        return [...deliveryActivities, ...otherActivities].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 10);
      });
    });
    unsubscribes.push(unsubDelivery);

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [restaurantId]);

  if (loading) {
    return (
      <Layout>
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        {restaurantInfo && (
          <div className="mb-4" style={{
            padding: '1.5rem',
            backgroundColor: 'var(--surface)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            marginBottom: '2rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Restaurant Name - Centered */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <h2 style={{
                fontSize: '1.75rem',
                fontWeight: '600',
                margin: 0,
                color: 'var(--primary-color)',
                letterSpacing: '0.025em'
              }}>
                {restaurantInfo.name}
              </h2>
            </div>

            {/* Restaurant Info and Actions - Symmetric Layout */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              marginBottom: '1rem',
              gap: '2rem'
            }}>
              {/* Left Side - Restaurant Details */}
              <div style={{ 
                flex: '1',
                fontSize: '0.875rem', 
                color: 'var(--text-secondary)',
                lineHeight: '1.6'
              }}>
                <div style={{ 
                  fontWeight: '500', 
                  color: 'var(--text-primary)', 
                  marginBottom: '0.5rem' 
                }}>
                  Restaurant ID: {restaurantId}
                </div>
                {restaurantInfo.address && (
                  <div style={{ marginBottom: '0.25rem' }}>📍 {restaurantInfo.address}</div>
                )}
                {restaurantInfo.phone && (
                  <div style={{ marginBottom: '0.25rem' }}>📞 {restaurantInfo.phone}</div>
                )}
                {restaurantInfo.email && (
                  <div style={{ marginBottom: '0.25rem' }}>✉️ {restaurantInfo.email}</div>
                )}
              </div>

              {/* Right Side - Action Buttons */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                flexShrink: 0
              }}>
                <RestaurantSwitcher compact />
                <button
                  onClick={() => setShowAddRestaurant(true)}
                  style={{
                    padding: '0.75rem 1.25rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    border: 'none',
                    color: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap',
                    minWidth: '140px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(34, 197, 94, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <span>+</span>
                  <span>Add Restaurant</span>
                </button>
              </div>
            </div>

            {/* Restaurant Count Badge - Left Aligned */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-start', 
              alignItems: 'center' 
            }}>
              <div style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                background: 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '25px',
                fontSize: '0.8rem',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                gap: '0.5rem'
              }}>
                <span>🏪</span>
                <span>{availableRestaurants.length} {availableRestaurants.length === 1 ? 'Restaurant' : 'Restaurants'}</span>
              </div>
            </div>
          </div>
        )}

        <h1 className="page-title">Dashboard</h1>

        <div className="dashboard-stats">
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#3b82f6' }}>📋</div>
              <div className="stat-label">Prep Items</div>
            </div>
            <div className="stat-value">{stats.totalPrepItems}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
              Current prep list
            </div>
          </div>

          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#10b981' }}>📝</div>
              <div className="stat-label">Order Items</div>
            </div>
            <div className="stat-value">{stats.totalOrderItems}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
              Active orders
            </div>
          </div>

          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#f59e0b' }}>🧹</div>
              <div className="stat-label">Closing Items</div>
            </div>
            <div className="stat-value">{stats.totalClosingItems}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
              Closing checklist
            </div>
          </div>
        </div>

        <div className="card-grid">
          <div className="card">
            <h2 className="card-title">Recent Activity</h2>
            {recentActivity.length > 0 ? (
              <div>
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="mb-3" style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--border-light)',
                    borderRadius: '0.375rem',
                    position: 'relative'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.25rem'
                    }}>
                      <div style={{ fontWeight: '500' }}>{activity.title}</div>
                      {activity.status && (
                        <div style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          backgroundColor: activity.status === 'done' ? '#10b981' : '#f59e0b',
                          color: 'white',
                          textTransform: 'uppercase',
                          letterSpacing: '0.025em'
                        }}>
                          {activity.status === 'done' ? '✓ Done' : '⏳ Pending'}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      by {activity.userName}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {new Date(activity.timestamp).toLocaleDateString()} at{' '}
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>No recent activity</p>
            )}
          </div>

          <div className="card">
            <h2 className="card-title">Quick Actions</h2>
            <div className="flex flex-col gap-4">
              <a href="/recipes" className="btn btn-primary">
                Manage Recipes
              </a>
              <a href="/closing" className="btn btn-secondary">
                Closing Checklist
              </a>
              <a href="/handovers" className="btn btn-secondary">
                View Handovers
              </a>
            </div>
          </div>
        </div>

        {/* Add Restaurant Modal */}
        {showAddRestaurant && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px', width: '90vw' }}>
              <div className="modal-header">
                <h2>Add Restaurant to Your Account</h2>
                <button className="close-btn" onClick={resetAddRestaurantForm}>×</button>
              </div>
              
              <form onSubmit={handleAddRestaurant}>
                <div className="modal-body">
                  <div className="form-group">
                    <label htmlFor="restaurantId">Restaurant ID</label>
                    <input
                      type="text"
                      id="restaurantId"
                      value={newRestaurantId}
                      onChange={(e) => setNewRestaurantId(e.target.value)}
                      placeholder="Enter restaurant ID (e.g., test-restaurant)"
                      className="form-control"
                      disabled={isAddingRestaurant}
                    />
                    <small style={{ 
                      color: 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      display: 'block'
                    }}>
                      Enter the ID of an existing restaurant you want to add to your account.
                    </small>
                  </div>
                  
                  {addRestaurantError && (
                    <div style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      fontSize: '0.875rem',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: '1px solid #fecaca'
                    }}>
                      {addRestaurantError}
                    </div>
                  )}
                </div>
                
                <div className="modal-footer">
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={resetAddRestaurantForm}
                    disabled={isAddingRestaurant}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isAddingRestaurant}
                  >
                    {isAddingRestaurant && <div className="loading-spinner"></div>}
                    {isAddingRestaurant ? 'Adding...' : 'Add Restaurant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
