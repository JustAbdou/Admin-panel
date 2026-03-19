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
import JoinRestaurantButton from '../layout/JoinRestaurantButton';

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

interface EhoDayStatus {
  date: string;
  completed: boolean;
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
  const [showEhoHistory, setShowEhoHistory] = useState(false);
  const [ehoHistory, setEhoHistory] = useState<EhoDayStatus[]>([]);

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
      const daysToTrack = 60;
      const todayKey = today.toISOString().split('T')[0];
      const historyMap = new Map<string, boolean>();

      // Initialize all 60 days as false (incomplete)
      for (let i = 0; i < daysToTrack; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const key = date.toISOString().split('T')[0];
        historyMap.set(key, false);
      }

      // Filter for fridge definition documents (from both admin panel and app)
      // App may add createdAt when creating - include those too
      type FridgeDoc = { id: string; fridgeName: string; fridgeType?: string; temperatureAM?: unknown; temperaturePM?: unknown; [k: string]: unknown };
      const allFridges = snapshot.docs
        .map(d => {
          const data = d.data();
          return { id: d.id, ...data } as FridgeDoc & Record<string, unknown>;
        })
        .filter((data): data is FridgeDoc => {
          return !!(data.fridgeName && typeof data.fridgeName === 'string' && data.fridgeName.trim() !== '');
        });

      // Debug log: show what fridges we're checking
      console.log('[EHO] Checking fridges:', {
        totalDocs: snapshot.docs.length,
        filteredFridges: allFridges.length,
        fridgeNames: allFridges.map(f => f.fridgeName)
      });

      // Compute completion status: ALL fridges must have BOTH AM and PM filled
      let allFilled = false;
      const validationResults: Array<{fridgeName: string, hasAM: boolean, hasPM: boolean, tempAM: any, tempPM: any}> = [];

      if (allFridges.length > 0) {
        // Start optimistic - will set to false if any fridge fails
        allFilled = true;

        for (const fridge of allFridges) {
          const fridgeName = fridge.fridgeName || 'Unknown';
          
          // Validate AM temperature: must exist, not null, not undefined, not empty string, not just whitespace
          // Note: 0 is valid (can be a real temperature reading)
          const tempAM = fridge.temperatureAM;
          const hasAM = (tempAM != null) &&           // Covers both null and undefined
                       (tempAM !== '') &&              // Not empty string
                       (String(tempAM).trim() !== ''); // Not just whitespace
          
          // Validate PM temperature: same criteria
          const tempPM = fridge.temperaturePM;
          const hasPM = (tempPM != null) &&           // Covers both null and undefined
                       (tempPM !== '') &&              // Not empty string
                       (String(tempPM).trim() !== ''); // Not just whitespace

          validationResults.push({
            fridgeName,
            hasAM,
            hasPM,
            tempAM: tempAM === null || tempAM === undefined ? null : String(tempAM),
            tempPM: tempPM === null || tempPM === undefined ? null : String(tempPM)
          });

          // If ANY fridge is missing either AM or PM, mark as incomplete
          if (!hasAM || !hasPM) {
            allFilled = false;
            
            // Debug log: show which fridge/field is failing
            console.warn('[EHO] Validation failed for fridge:', {
              fridgeName,
              hasAM,
              hasPM,
              tempAM: tempAM === null ? 'null' : tempAM === undefined ? 'undefined' : tempAM === '' ? 'empty string' : `"${tempAM}"`,
              tempPM: tempPM === null ? 'null' : tempPM === undefined ? 'undefined' : tempPM === '' ? 'empty string' : `"${tempPM}"`
            });
          }
        }

        // Debug log: show final validation results
        console.log('[EHO] Validation complete:', {
          allFilled,
          totalFridges: allFridges.length,
          results: validationResults
        });
      } else {
        console.log('[EHO] No fridges found - marking as incomplete');
      }

      // Single source of truth: use allFilled for both historyMap and stats
      // Set today's status in history map
      historyMap.set(todayKey, allFilled);

      // Update dashboard stats using the same computed value
      setStats(prev => ({
        ...prev,
        ehoTemperatureEntered: allFilled
      }));

      // Generate history array for the EHO history modal
      const historyArray = Array.from(historyMap.entries())
        .map(([date, completed]) => ({ date, completed }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));

      setEhoHistory(historyArray);

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
                <JoinRestaurantButton />
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

          <div
            className="stat-card"
            style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
            onClick={() => setShowEhoHistory(true)}
          >
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

      {showEhoHistory && (
        <div
          className="modal-overlay"
          onClick={() => setShowEhoHistory(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="eho-history-title"
        >
          <div
            className="modal"
            style={{ maxWidth: '720px', width: '90%', maxHeight: '80vh', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 id="eho-history-title" style={{ margin: 0 }}>EHO Temperature Log History</h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowEhoHistory(false)}
              >
                Close
              </button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto', maxHeight: '60vh' }}>
              <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
                Showing the last 60 days. Green indicates temperatures were logged for that day.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '0.75rem'
                }}
              >
                {ehoHistory.map(({ date, completed }) => (
                  <div
                    key={date}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid',
                      borderColor: completed ? '#86efac' : '#fca5a5',
                      backgroundColor: completed ? '#dcfce7' : '#fee2e2',
                      color: completed ? '#166534' : '#991b1b',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{new Date(date + 'T00:00:00').toLocaleDateString()}</span>
                    <span style={{ fontSize: '0.875rem' }}>{completed ? 'Logged' : 'Missing'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;
