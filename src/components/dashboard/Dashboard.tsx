import React, { useState, useEffect } from 'react';
import { query, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { useRestaurant } from '../../contexts/RestaurantContext';
import {
  getPrepListCollection,
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
  totalClosingItems: number;
  completedClosingItems: number;
  completedPrepItems: number;
  totalTodayPrepItems: number;
  prepProgressPercentage: number;
  closingChecklistComplete: boolean;
  ehoTemperatureEntered: boolean;
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
  const { restaurantId } = useRestaurant();
  const [stats, setStats] = useState<DashboardStats>({
    totalPrepItems: 0,
    totalClosingItems: 0,
    completedClosingItems: 0,
    completedPrepItems: 0,
    totalTodayPrepItems: 0,
    prepProgressPercentage: 0,
    closingChecklistComplete: false,
    ehoTemperatureEntered: false,
  });
  const [restaurantInfo, setRestaurantInfo] = useState<RestaurantInfo | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayPrepItems = snapshot.docs.filter(doc => {
        const data = doc.data();
        let itemDate = new Date();

        if (data.createdAt) {
          if (data.createdAt.toDate) {
            itemDate = data.createdAt.toDate();
          } else if (data.createdAt.seconds) {
            itemDate = new Date(data.createdAt.seconds * 1000);
          } else if (typeof data.createdAt === 'string') {
            itemDate = new Date(data.createdAt);
          }
        }

        itemDate.setHours(0, 0, 0, 0);
        return itemDate.getTime() === today.getTime();
      });

      const completedTodayPrepItems = todayPrepItems.filter(doc => {
        const data = doc.data();
        return data.done === true;
      });

      const activePrepItems = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.done === false || data.done === undefined;
      });

      const progressPercentage = todayPrepItems.length > 0
        ? Math.round((completedTodayPrepItems.length / todayPrepItems.length) * 100)
        : 0;

      setStats(prev => ({
        ...prev,
        totalPrepItems: activePrepItems.length,
        completedPrepItems: completedTodayPrepItems.length,
        totalTodayPrepItems: todayPrepItems.length,
        prepProgressPercentage: progressPercentage
      }));

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

    const closingQuery = query(getClosingListCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubClosing = onSnapshot(closingQuery, async (snapshot) => {
      const allClosingItems = snapshot.docs;
      const activeClosingItems = allClosingItems.filter(doc => {
        const data = doc.data();
        return !data.done; // Only count incomplete items
      });
      const completedClosingItems = allClosingItems.filter(doc => {
        const data = doc.data();
        return data.done === true; // Count completed items
      });

      const isChecklistComplete = allClosingItems.length > 0 && activeClosingItems.length === 0;

      setStats(prev => ({
        ...prev,
        totalClosingItems: activeClosingItems.length,
        completedClosingItems: completedClosingItems.length,
        closingChecklistComplete: isChecklistComplete
      }));

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

      setLoading(false);
    });
    unsubscribes.push(unsubClosing);

    const fridgeQuery = query(getFridgeLogsCollection(restaurantId));
    const unsubFridge = onSnapshot(fridgeQuery, async (snapshot) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check for fridges with temperature readings entered today
      const fridgesWithTemperatureReadings = snapshot.docs.filter(doc => {
        const data = doc.data();

        // Check if this fridge has temperature readings
        const hasTemperatureReading = (data.temperatureAM && data.temperatureAM.toString().trim() !== '') ||
          (data.temperaturePM && data.temperaturePM.toString().trim() !== '');

        // Check if the fridge log was created/updated today using createdAt timestamp
        let isToday = false;
        if (data.createdAt) {
          let entryDate = new Date();
          if (data.createdAt.toDate) {
            entryDate = data.createdAt.toDate();
          } else if (data.createdAt.seconds) {
            entryDate = new Date(data.createdAt.seconds * 1000);
          } else if (typeof data.createdAt === 'string') {
            entryDate = new Date(data.createdAt);
          }
          entryDate.setHours(0, 0, 0, 0);
          isToday = entryDate.getTime() === today.getTime();
        }

        // Only consider it a "today entry" if it has temperature readings AND is from today
        return hasTemperatureReading && isToday;
      });

      // Consider it "done" if there are temperature readings from today
      const todayFridgeEntries = fridgesWithTemperatureReadings;

      const hasTemperatureEntry = todayFridgeEntries.length > 0;

      setStats(prev => ({
        ...prev,
        ehoTemperatureEntered: hasTemperatureEntry
      }));

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
            padding: '1rem',
            backgroundColor: 'var(--surface)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }} className="restaurant-header">
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                margin: 0,
                color: 'var(--primary-color)'
              }}>
                {restaurantInfo.name}
              </h2>
              <div className="restaurant-switcher-container">
                <RestaurantSwitcher compact />
              </div>
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {restaurantInfo.address && (
                <div>📍 {restaurantInfo.address}</div>
              )}
              {restaurantInfo.phone && (
                <div>📞 {restaurantInfo.phone}</div>
              )}
              {restaurantInfo.email && (
                <div>✉️ {restaurantInfo.email}</div>
              )}
            </div>
          </div>
        )}

        <h1 className="page-title">Dashboard</h1>

        <div className="dashboard-stats">
          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#3b82f6' }}>📋</div>
              <div className="stat-label">Today's Prep Progress</div>
            </div>

            {/* Circular Progress Indicator */}
            <div style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              margin: '0 auto 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background circle */}
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#e5e7eb"
                  strokeWidth="6"
                  fill="none"
                />
                {/* Progress circle */}
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#3b82f6"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 35}`}
                  strokeDashoffset={`${2 * Math.PI * 35 * (1 - stats.prepProgressPercentage / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: '#3b82f6'
              }}>
                {stats.prepProgressPercentage}%
              </div>
            </div>

            <div style={{ fontSize: '0.875rem', opacity: 0.8, textAlign: 'center' }}>
              {stats.completedPrepItems} of {stats.totalTodayPrepItems} completed today
            </div>
          </div>

          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#f59e0b' }}>🧹</div>
              <div className="stat-label">Closing Checklist</div>
            </div>

            {/* Centered Icon */}
            <div style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              margin: '0 auto 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {stats.closingChecklistComplete ? (
                <div style={{
                  fontSize: '2.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#10b981',
                  borderRadius: '50%',
                  color: 'white'
                }}>
                  ✓
                </div>
              ) : (
                <div style={{
                  fontSize: '2.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#f59e0b',
                  borderRadius: '50%',
                  color: 'white'
                }}>
                  ⚠
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.875rem', opacity: 0.8, textAlign: 'center' }}>
              {stats.closingChecklistComplete ? 'All tasks completed!' : 'Tasks pending'}
            </div>
          </div>

          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#8b5cf6' }}>🌡️</div>
              <div className="stat-label">EHO</div>
            </div>

            {/* Centered Icon */}
            <div style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              margin: '0 auto 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {stats.ehoTemperatureEntered ? (
                <div style={{
                  fontSize: '2.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#10b981',
                  borderRadius: '50%',
                  color: 'white'
                }}>
                  ✓
                </div>
              ) : (
                <div style={{
                  fontSize: '2.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#f59e0b',
                  borderRadius: '50%',
                  color: 'white'
                }}>
                  ⚠
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.875rem', opacity: 0.8, textAlign: 'center' }}>
              {stats.ehoTemperatureEntered ? 'Temperatures logged' : 'No temperatures logged'}
            </div>
          </div>

        </div>

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
      </div>
    </Layout>
  );
};

export default Dashboard;
