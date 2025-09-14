import React, { useState, useEffect } from 'react';
import { 
  query, 
  onSnapshot, 
  addDoc, 
  orderBy, 
  limit,
  getDoc,
  doc
} from 'firebase/firestore';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { 
  getHandoversCollection, 
  getUserDoc
} from '../../utils/firestoreHelpers';
import { db } from '../../firebase';
import Layout from '../layout/Layout';

interface Handover {
  id: string;
  shift: 'morning' | 'afternoon' | 'evening';
  date: string;
  handedOverBy: string;
  handedOverTo: string;
  notes: string;
  tasks: {
    id: string;
    description: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
  }[];
  createdAt: string | any; 
  createdBy: string;
  pdfLink?: string; 
  pdf?: string; 
}

interface HandoverFormData {
  shift: 'morning' | 'afternoon' | 'evening';
  date: string;
  handedOverBy: string;
  handedOverTo: string;
  notes: string;
  tasks: {
    description: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
  }[];
}

const fetchUserData = async (restaurantId: string, userId: any): Promise<string> => {
  if (userId?.fullName) return userId.fullName;
  if (userId?.userName) return userId.userName;
  if (userId?.email) return userId.email;
  
  if (typeof userId === 'string') {
    try {
      const restaurantUserDoc = await getDoc(getUserDoc(restaurantId, userId));
      if (restaurantUserDoc.exists()) {
        const userData = restaurantUserDoc.data();
        return userData.fullName || userData.userName || userData.email || 'Unknown User';
      }
      
      const rootUserDoc = await getDoc(doc(db, 'users', userId));
      if (rootUserDoc.exists()) {
        const userData = rootUserDoc.data();
        return userData.fullName || userData.userName || userData.email || 'Unknown User';
      }
    } catch (error) {
      console.log('Error fetching user data:', error);
    }
  }
  
  return userId?.userName || userId?.user || userId?.employeeName || 'Unknown User';
};

const Handovers: React.FC = () => {
  const { restaurantId, user } = useRestaurant();
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [userNames, setUserNames] = useState<{ [key: string]: string }>({});
  const [formData, setFormData] = useState<HandoverFormData>({
    shift: 'morning',
    date: new Date().toISOString().split('T')[0],
    handedOverBy: '',
    handedOverTo: '',
    notes: '',
    tasks: [],
  });

  useEffect(() => {
    if (!restaurantId) return;

    const handoversQuery = query(
      getHandoversCollection(restaurantId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      handoversQuery, 
      (snapshot) => {
        try {
          const handoversData: Handover[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Handover[];
          
          setHandovers(handoversData);
          setLoading(false);
        } catch (error) {
          console.error('Error processing handovers data:', error);
          setHandovers([]);
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error fetching handovers:', error);
        setHandovers([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || handovers.length === 0) return;

    const fetchAllUserData = async () => {
      const userDataMap: { [key: string]: string } = {};

      const uniqueUserIds = Array.from(new Set(handovers.map(h => h.createdBy).filter(Boolean)));
      
      for (const userId of uniqueUserIds) {
        const userName = await fetchUserData(restaurantId, userId);
        userDataMap[userId] = userName;
      }
      
      setUserNames(userDataMap);
    };

    fetchAllUserData();
  }, [restaurantId, handovers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !user) return;

    try {
      const handoverData = {
        ...formData,
        tasks: formData.tasks.map((task, index) => ({
          id: `task-${Date.now()}-${index}`,
          ...task,
        })),
        createdAt: new Date().toISOString(),
        createdBy: user.email || 'Unknown',
      };

      await addDoc(getHandoversCollection(restaurantId), handoverData);

      setShowModal(false);
      setFormData({
        shift: 'morning',
        date: new Date().toISOString().split('T')[0],
        handedOverBy: '',
        handedOverTo: '',
        notes: '',
        tasks: [],
      });
    } catch (error) {
      console.error('Error creating handover:', error);
    }
  };

  const addTask = () => {
    setFormData(prev => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        { description: '', completed: false, priority: 'medium' }
      ]
    }));
  };

  const updateTask = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, i) => 
        i === index ? { ...task, [field]: value } : task
      )
    }));
  };

  const removeTask = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index)
    }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#e53e3e';
      case 'medium': return '#d69e2e';
      case 'low': return '#38a169';
      default: return '#718096';
    }
  };

  const getShiftColor = (shift: string) => {
    switch (shift) {
      case 'morning': return '#3182ce';
      case 'afternoon': return '#d69e2e';
      case 'evening': return '#805ad5';
      default: return '#718096';
    }
  };

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
        <div className="flex justify-between items-center mb-4">
          <h1 className="page-title">Shift Handovers</h1>
        </div>

        <div className="card-grid">
          {handovers
            .filter(handover => handover && handover.id) 
            .map((handover) => {
              const submitterName = userNames[handover.createdBy] || 'User';
              const submitterFirstName = submitterName === 'Unknown User' ? 'User' : submitterName.split(' ')[0];
              const capitalizedFirstName = submitterFirstName.charAt(0).toUpperCase() + submitterFirstName.slice(1).toLowerCase();
              
              let handoverDate: Date | null = null;
              if (handover.createdAt) {
                console.log('Handover createdAt:', handover.createdAt, 'Type:', typeof handover.createdAt);
                
                if (handover.createdAt && typeof handover.createdAt === 'object' && handover.createdAt.toDate) {
                  handoverDate = handover.createdAt.toDate();
                }
                else if (typeof handover.createdAt === 'string') {
                  handoverDate = new Date(handover.createdAt);
                }
                else if (typeof handover.createdAt === 'number') {
                  handoverDate = new Date(handover.createdAt);
                }
                
                if (handoverDate && isNaN(handoverDate.getTime())) {
                  handoverDate = null;
                }
              }
              
              const pdfUrl = handover.pdfLink || handover.pdf; 
              
              return (
                <div 
                  key={handover.id} 
                  className="card"
                  onClick={() => {
                    if (pdfUrl) {
                      window.open(pdfUrl, '_blank');
                    }
                  }}
                  style={{
                    cursor: pdfUrl ? 'pointer' : 'default',
                    transition: 'all 0.3s ease',
                    border: pdfUrl ? '2px solid transparent' : '1px solid var(--border)',
                    background: pdfUrl ? 'linear-gradient(white, white) padding-box, linear-gradient(45deg, var(--primary-color), var(--secondary-color, #3182ce)) border-box' : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (pdfUrl) {
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
                      e.currentTarget.style.borderColor = 'var(--primary-color)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (pdfUrl) {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                  title={pdfUrl ? '🖱️ Click to view PDF document' : undefined}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div style={{ width: '100%' }}>
                      <h3 className="card-title" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{capitalizedFirstName}'s Shift</span>
                        {pdfUrl && (
                          <span style={{ 
                            backgroundColor: 'var(--primary-color)',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            📄 PDF READY
                          </span>
                        )}
                      </h3>
                      <div style={{ 
                        display: 'inline-block',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'white',
                        backgroundColor: getShiftColor(handover.shift || '')
                      }}>
                        {handoverDate && !isNaN(handoverDate.getTime()) ? 
                          `${handoverDate.toLocaleDateString()} • ${handoverDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 
                          'No Date Available'
                        }
                      </div>
                    </div>
                  </div>

                  {handover.notes && (
                    <div className="mb-3">
                      <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        Notes:
                      </div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        padding: '0.5rem',
                        backgroundColor: 'var(--border-light)',
                        borderRadius: '0.25rem'
                      }}>
                        {handover.notes}
                      </div>
                    </div>
                  )}

                  {handover.tasks && handover.tasks.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Tasks ({handover.tasks.filter(t => t.completed).length}/{handover.tasks.length} completed):
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {handover.tasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-2 mb-2" style={{ 
                            padding: '0.5rem',
                            backgroundColor: task.completed ? 'var(--border-light)' : 'transparent',
                            borderRadius: '0.25rem',
                            border: '1px solid var(--border)'
                          }}>
                            <div style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: getPriorityColor(task.priority),
                              marginRight: '0.5rem'
                            }}></div>
                            <span style={{ 
                              fontSize: '0.875rem',
                              textDecoration: task.completed ? 'line-through' : 'none',
                              color: task.completed ? 'var(--text-secondary)' : 'var(--text-primary)'
                            }}>
                              {task.description}
                            </span>
                            {task.completed && (
                              <span style={{ 
                                marginLeft: 'auto',
                                fontSize: '0.75rem',
                                color: 'var(--success-color)',
                                fontWeight: '500'
                              }}>
                                ✓
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {handovers.length === 0 && (
          <div className="card text-center">
            <div style={{ color: 'var(--text-secondary)' }}>
              No handovers found. Create your first handover to get started!
            </div>
          </div>
        )}

        {showModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h2 className="modal-title">Create Shift Handover</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="flex gap-4">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Shift</label>
                    <select
                      className="form-input"
                      value={formData.shift}
                      onChange={(e) => setFormData(prev => ({ ...prev, shift: e.target.value as any }))}
                    >
                      <option value="morning">Morning</option>
                      <option value="afternoon">Afternoon</option>
                      <option value="evening">Evening</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Handed Over By</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.handedOverBy}
                      onChange={(e) => setFormData(prev => ({ ...prev, handedOverBy: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Handed Over To</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.handedOverTo}
                      onChange={(e) => setFormData(prev => ({ ...prev, handedOverTo: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-input form-textarea"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Any important notes or observations..."
                  />
                </div>

                <div className="form-group">
                  <div className="flex justify-between items-center mb-2">
                    <label className="form-label">Tasks</label>
                    <button type="button" onClick={addTask} className="btn btn-secondary btn-sm">
                      Add Task
                    </button>
                  </div>

                  {formData.tasks.map((task, index) => (
                    <div key={index} className="flex gap-2 mb-2" style={{ 
                      padding: '0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: '0.375rem',
                      backgroundColor: 'var(--border-light)'
                    }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Task description"
                        value={task.description}
                        onChange={(e) => updateTask(index, 'description', e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <select
                        className="form-input"
                        value={task.priority}
                        onChange={(e) => updateTask(index, 'priority', e.target.value)}
                        style={{ width: '100px' }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(e) => updateTask(index, 'completed', e.target.checked)}
                        />
                        Done
                      </label>
                      <button
                        type="button"
                        onClick={() => removeTask(index)}
                        className="btn btn-error btn-sm"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary">
                    Create Handover
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
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

export default Handovers;
