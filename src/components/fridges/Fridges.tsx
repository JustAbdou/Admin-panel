import React, { useState, useEffect } from 'react';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { getFridgeNamesFromLogs, createFridgeLogDocument, deleteFridgeLogDocument } from '../../utils/firestoreHelpers';
import Layout from '../layout/Layout';

const Fridges: React.FC = () => {
  const { restaurantId, user } = useRestaurant();
  const [fridges, setFridges] = useState<{name: string, type: 'fridge' | 'freezer'}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFridgeName, setNewFridgeName] = useState('');
  const [newFridgeType, setNewFridgeType] = useState<'fridge' | 'freezer'>('fridge');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    const fetchFridges = async () => {
      try {
        setLoading(true);
        const fridgeData = await getFridgeNamesFromLogs(restaurantId);
        setFridges(fridgeData);
      } catch (error) {
        console.error('Error fetching fridge names:', error);
        setFridges([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFridges();
  }, [restaurantId]);

  const handleAddFridge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !user || !newFridgeName.trim()) return;

    try {
      setAdding(true);
      
      // Create fridge log document for this fridge
      await createFridgeLogDocument(restaurantId, newFridgeName.trim(), newFridgeType, user.uid);
      
      // Refresh the fridges list
      const updatedFridges = await getFridgeNamesFromLogs(restaurantId);
      setFridges(updatedFridges);
      setNewFridgeName('');
      setNewFridgeType('fridge');
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding fridge:', error);
      alert('Error adding fridge. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteFridge = async (fridgeName: string) => {
    if (!restaurantId || !confirm(`Are you sure you want to delete "${fridgeName}"?`)) return;

    try {
      setDeleting(fridgeName);
      
      // Delete fridge log document
      await deleteFridgeLogDocument(restaurantId, fridgeName);
      
      // Refresh the fridges list
      const updatedFridges = await getFridgeNamesFromLogs(restaurantId);
      setFridges(updatedFridges);
    } catch (error) {
      console.error('Error deleting fridge:', error);
      alert('Error deleting fridge. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="main-content">
          <div className="container">
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div>Loading fridges...</div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="main-content">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h1 className="page-title">Fridges</h1>
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
              Add Fridge/Freezer
            </button>
          </div>

          {fridges.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                No fridges found
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Get started by adding your first fridge or freezer
              </p>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                Add Your First Fridge/Freezer
              </button>
            </div>
          ) : (
            <div className="card">
              <h2 className="card-title">Fridges & Freezers ({fridges.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {fridges.map((fridge, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      backgroundColor: 'var(--surface)',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{fridge.name}</span>
                      <span style={{ 
                        fontSize: '0.75rem',
                        color: fridge.type === 'freezer' ? '#1976d2' : '#7b1fa2',
                        textTransform: 'capitalize' as const,
                        padding: '0.125rem 0.5rem',
                        backgroundColor: fridge.type === 'freezer' ? '#e3f2fd' : '#f3e5f5',
                        borderRadius: '12px',
                        fontWeight: '500',
                        display: 'inline-block',
                        width: 'fit-content'
                      }}>
                        {fridge.type === 'freezer' ? '🧊 Freezer' : '❄️ Fridge'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteFridge(fridge.name)}
                      disabled={deleting === fridge.name}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: deleting === fridge.name ? 'not-allowed' : 'pointer',
                        opacity: deleting === fridge.name ? 0.6 : 1
                      }}
                    >
                      {deleting === fridge.name ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Fridge Modal */}
          {showAddModal && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h3>Add New Fridge/Freezer</h3>
                </div>
                <form onSubmit={handleAddFridge}>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newFridgeName}
                      onChange={(e) => setNewFridgeName(e.target.value)}
                      required
                      placeholder="Enter fridge/freezer name"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select
                      className="form-input"
                      value={newFridgeType}
                      onChange={(e) => setNewFridgeType(e.target.value as 'fridge' | 'freezer')}
                      required
                    >
                      <option value="fridge">❄️ Fridge</option>
                      <option value="freezer">🧊 Freezer</option>
                    </select>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        setNewFridgeName('');
                        setNewFridgeType('fridge');
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={adding}>
                      {adding ? 'Adding...' : `Add ${newFridgeType === 'freezer' ? 'Freezer' : 'Fridge'}`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Fridges;
