import React, { useState, useEffect } from 'react';
import { addDoc, deleteDoc, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { getOpeningListCollection } from '../../utils/firestoreHelpers';
import Layout from '../layout/Layout';

interface OpeningItem {
  id: string;
  name: string;
  done: boolean;
  createdAt: any; 
  createdBy: string;
  restaurantId: string;
  description?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  priority?: 'low' | 'medium' | 'high';
  completedAt?: any;
  completedBy?: string;
}

const Opening: React.FC = () => {
  const { restaurantId, user } = useRestaurant();
  const [openingItems, setOpeningItems] = useState<OpeningItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OpeningItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [formData, setFormData] = useState({
    name: '',
  });

  useEffect(() => {
    if (!restaurantId) return;

    const openingQuery = query(getOpeningListCollection(restaurantId), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(openingQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OpeningItem[];
      
      setOpeningItems(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [restaurantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !user) return;

    try {
      if (editingItem) {
        await updateDoc(doc(getOpeningListCollection(restaurantId), editingItem.id), {
          name: formData.name,
        });
      } else {
        await addDoc(getOpeningListCollection(restaurantId), {
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          done: false,
          name: formData.name,
          restaurantId: restaurantId,
        });
      }

      setFormData({ name: '' });
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error saving opening item:', error);
    }
  };

  const handleEdit = (item: OpeningItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (itemId: string) => {
    if (!restaurantId) return;
    
    if (confirm('Are you sure you want to delete this opening item?')) {
      try {
        await deleteDoc(doc(getOpeningListCollection(restaurantId), itemId));
      } catch (error) {
        console.error('Error deleting opening item:', error);
      }
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({ name: '' });
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="page-title">Opening Checklist</h1>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary"
          >
            + Add Opening Item
          </button>
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setStatusFilter('all')}
            className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            All Items ({openingItems.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`btn btn-sm ${statusFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Pending ({openingItems.filter(item => !item.done).length})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`btn btn-sm ${statusFilter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Completed ({openingItems.filter(item => item.done).length})
          </button>
        </div>

        {openingItems.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No opening items yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Start by adding your first opening checklist item.
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary"
            >
              Add First Opening Item
            </button>
          </div>
        ) : (
          <>
            <div className="card-grid">
              {openingItems
                .filter(item => {
                  if (statusFilter === 'completed') return item.done;
                  if (statusFilter === 'pending') return !item.done;
                  return true; // 'all'
                })
                .map((item) => (
              <div key={item.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '600', 
                    margin: 0,
                    textDecoration: item.done ? 'line-through' : 'none',
                    opacity: item.done ? 0.6 : 1,
                    flex: 1
                  }}>
                    {item.name}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Status Badge */}
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      backgroundColor: item.done ? '#10b981' : '#f59e0b',
                      color: 'white',
                      minWidth: '80px',
                      textAlign: 'center'
                    }}>
                      {item.done ? '✓ Completed' : '⏳ Pending'}
                    </div>
                    <button 
                      onClick={() => handleEdit(item)}
                      className="btn btn-sm"
                      style={{ 
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'var(--border)',
                        color: 'var(--text-primary)',
                        fontSize: '0.75rem'
                      }}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="btn btn-sm"
                      style={{ 
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'var(--error-color)',
                        color: 'white',
                        fontSize: '0.75rem'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <div>
                      Created: {item.createdAt?.toDate ? 
                        item.createdAt.toDate().toLocaleTimeString() : 
                        (typeof item.createdAt === 'string' ? 
                          new Date(item.createdAt).toLocaleTimeString() : 
                          'Unknown time')}
                    </div>
                    {item.completedAt && (
                      <div style={{ color: '#10b981', fontWeight: '500' }}>
                        Completed: {item.completedAt?.toDate ? 
                          item.completedAt.toDate().toLocaleTimeString() : 
                          (typeof item.completedAt === 'string' ? 
                            new Date(item.completedAt).toLocaleTimeString() : 
                            'Unknown time')}
                      </div>
                    )}
                  </div>
                  {/* Additional status info */}
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: item.done ? '#10b981' : '#f59e0b',
                    fontWeight: '500'
                  }}>
                    {item.done ? 'Task Complete' : 'Awaiting Completion'}
                  </div>
                </div>
              </div>
              ))}
            </div>
            
            {/* Show message when no items match filter */}
            {openingItems.filter(item => {
              if (statusFilter === 'completed') return item.done;
              if (statusFilter === 'pending') return !item.done;
              return true;
            }).length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                  No {statusFilter === 'all' ? '' : statusFilter} items found
                </h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {statusFilter === 'completed' && 'No completed opening tasks yet.'}
                  {statusFilter === 'pending' && 'No pending opening tasks.'}
                  {statusFilter === 'all' && 'No opening items found.'}
                </p>
              </div>
            )}
          </>
        )}

        {isModalOpen && (
          <div className="modal-overlay">
            <div className="modal">
              <h3 className="modal-title">{editingItem ? 'Edit Opening Item' : 'Add New Opening Item'}</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">
                    Item Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="form-input"
                    placeholder="e.g., Turn on all equipment"
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    {editingItem ? 'Update Item' : 'Add Item'}
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

export default Opening;

