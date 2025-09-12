import React, { useState, useEffect } from 'react';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { getFridgeNamesFromLogs, createFridgeLogDocument, deleteFridgeLogDocument } from '../../utils/firestoreHelpers';
import Layout from '../layout/Layout';

const Fridges: React.FC = () => {
  const { restaurantId, user } = useRestaurant();
  const [fridgeNames, setFridgeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFridgeName, setNewFridgeName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    const fetchFridges = async () => {
      try {
        setLoading(true);
        const names = await getFridgeNamesFromLogs(restaurantId);
        setFridgeNames(names);
      } catch (error) {
        console.error('Error fetching fridge names:', error);
        setFridgeNames([]);
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
      await createFridgeLogDocument(restaurantId, newFridgeName.trim(), user.uid);
      
      // Refresh the fridge names list
      const updatedNames = await getFridgeNamesFromLogs(restaurantId);
      setFridgeNames(updatedNames);
      setNewFridgeName('');
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
      
      // Refresh the fridge names list
      const updatedNames = await getFridgeNamesFromLogs(restaurantId);
      setFridgeNames(updatedNames);
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
              Add Fridge
            </button>
          </div>

          {fridgeNames.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                No fridges found
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Get started by adding your first fridge
              </p>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                Add Your First Fridge
              </button>
            </div>
          ) : (
            <div className="card">
              <h2 className="card-title">Fridge Names ({fridgeNames.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {fridgeNames.map((name, index) => (
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
                    <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{name}</span>
                    <button
                      onClick={() => handleDeleteFridge(name)}
                      disabled={deleting === name}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: deleting === name ? 'not-allowed' : 'pointer',
                        opacity: deleting === name ? 0.6 : 1
                      }}
                    >
                      {deleting === name ? 'Deleting...' : 'Delete'}
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
                  <h3>Add New Fridge</h3>
                </div>
                <form onSubmit={handleAddFridge}>
                  <div className="form-group">
                    <label className="form-label">Fridge Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newFridgeName}
                      onChange={(e) => setNewFridgeName(e.target.value)}
                      required
                      placeholder="Enter fridge name"
                    />
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        setNewFridgeName('');
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={adding}>
                      {adding ? 'Adding...' : 'Add Fridge'}
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
