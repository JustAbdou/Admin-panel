import React, { useState, useEffect } from 'react';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { getSupplierNamesFromLogs, createDeliveryLogDocument, deleteDeliveryLogDocument } from '../../utils/firestoreHelpers';
import Layout from '../layout/Layout';

const Suppliers: React.FC = () => {
  const { restaurantId, user } = useRestaurant();
  const [supplierNames, setSupplierNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    const fetchSuppliers = async () => {
      try {
        setLoading(true);
        const names = await getSupplierNamesFromLogs(restaurantId);
        setSupplierNames(names);
      } catch (error) {
        console.error('Error fetching supplier names:', error);
        setSupplierNames([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
  }, [restaurantId]);

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !user || !newSupplierName.trim()) return;

    try {
      setAdding(true);
      
      // Create delivery log document for this supplier
      await createDeliveryLogDocument(restaurantId, newSupplierName.trim(), user.uid);
      
      // Refresh the supplier names list
      const updatedNames = await getSupplierNamesFromLogs(restaurantId);
      setSupplierNames(updatedNames);
      setNewSupplierName('');
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding supplier:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteSupplier = async (supplierName: string) => {
    if (!restaurantId || !confirm(`Are you sure you want to delete "${supplierName}"?`)) return;

    try {
      setDeleting(supplierName);
      
      // Delete delivery log document
      await deleteDeliveryLogDocument(restaurantId, supplierName);
      
      // Refresh the supplier names list
      const updatedNames = await getSupplierNamesFromLogs(restaurantId);
      setSupplierNames(updatedNames);
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Error deleting supplier. Please try again.');
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
              <div>Loading suppliers...</div>
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
            <h1 className="page-title">Suppliers</h1>
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
              Add Supplier
            </button>
          </div>

          {supplierNames.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                No suppliers found
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Get started by adding your first supplier
              </p>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                Add Your First Supplier
              </button>
            </div>
          ) : (
            <div className="card">
              <h2 className="card-title">Supplier Names ({supplierNames.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {supplierNames.map((name, index) => (
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
                      onClick={() => handleDeleteSupplier(name)}
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

          {/* Add Delivery Log Modal */}
                    {showAddModal && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h3>Add New Supplier</h3>
                </div>
                <form onSubmit={handleAddSupplier}>
                  <div className="form-group">
                    <label className="form-label">Supplier Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      required
                      placeholder="Enter supplier name"
                    />
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        setNewSupplierName('');
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={adding}>
                      {adding ? 'Adding...' : 'Add Supplier'}
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

export default Suppliers;
