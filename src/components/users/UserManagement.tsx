import React, { useState, useEffect } from 'react';
import { 
  query, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy,
  getDocs,
  doc,
  setDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword } from 'firebase/auth';
import { db, secondaryAuth } from '../../firebase';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { 
  getUsersCollection,
  getUserDoc
} from '../../utils/firestoreHelpers';
import Layout from '../layout/Layout';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'employee' | 'manager' | 'admin';
  password: string;
  restaurantId: string;
  authUid?: string; 
  createdAt: string;
  lastLogin?: string;
}

interface UserFormData {
  email: string;
  fullName: string;
  role: 'employee' | 'manager';
  password: string;
}

const UserManagement: React.FC = () => {
  const { restaurantId, user: currentUser } = useRestaurant();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    fullName: '',
    role: 'employee',
    password: '',
  });
  const [filterRole, setFilterRole] = useState<string>('');
  const [deletedEmails, setDeletedEmails] = useState<Set<string>>(new Set());

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // Attempt to delete Firebase Auth user (limited success due to client-side constraints)
  const attemptAuthUserDeletion = async (email: string, password: string) => {
    try {
      // Sign in as the user to be deleted (this is a workaround)
      const userCredential = await signInWithEmailAndPassword(secondaryAuth, email, password);
      
      // Delete the user
      await deleteUser(userCredential.user);
      
      console.log('Successfully deleted Firebase Auth user:', email);
      return true;
    } catch (error: any) {
      console.warn('Could not delete Firebase Auth user:', error.message);
      // Common reasons: user signed in elsewhere, requires recent authentication, etc.
      return false;
    }
  };

  useEffect(() => {
    if (!restaurantId) return;

    const loadUsers = async () => {
      try {
        const usersQuery = query(
          getUsersCollection(restaurantId),
          orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(usersQuery);
        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as User[];
        
        setUsers(usersData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading users:', error);
        setLoading(false);
      }
    };

    loadUsers();
  }, [restaurantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;

    try {
      if (editingUser) {
        // Update existing user
        const userData = {
          email: formData.email,
          fullName: formData.fullName,
          role: formData.role,
          password: formData.password,
          restaurantId: restaurantId,
          createdAt: editingUser.createdAt,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(getUserDoc(restaurantId, editingUser.id), userData);
      } else {
        // Check if user already exists in our database
        const existingUser = users.find(u => u.email.toLowerCase() === formData.email.toLowerCase());
        if (existingUser) {
          return;
        }

        // Check if this email was previously deleted
        const wasDeleted = deletedEmails.has(formData.email.toLowerCase());
        
        try {
          // Create new user using secondary auth (prevents auto-login)
          const authResult = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
          
          // Store user data
          const userData = {
            email: formData.email,
            fullName: formData.fullName,
            role: formData.role, // This will be 'employee' for staff
            password: formData.password,
            restaurantId: restaurantId,
            authUid: authResult.user.uid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          
          await addDoc(getUsersCollection(restaurantId), userData);
          
          const rootUserData = {
            restaurantId: restaurantId,
            email: formData.email,
            fullName: formData.fullName,
            role: formData.role, // This will be 'employee' for staff
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', authResult.user.uid), rootUserData);
          
          // Remove from deleted emails set if it was there
          if (wasDeleted) {
            const newDeletedEmails = new Set(deletedEmails);
            newDeletedEmails.delete(formData.email.toLowerCase());
            setDeletedEmails(newDeletedEmails);
          }
          
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use' && wasDeleted) {
            // If the email was previously deleted but Firebase Auth still has it,
            // try to clean it up first
            const cleanupSuccess = await attemptAuthUserDeletion(formData.email, formData.password);
            
            if (cleanupSuccess) {
              // Try creating the user again
              try {
                const authResult = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
                
                const userData = {
                  email: formData.email,
                  fullName: formData.fullName,
                  role: formData.role,
                  password: formData.password,
                  restaurantId: restaurantId,
                  authUid: authResult.user.uid,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                
                await addDoc(getUsersCollection(restaurantId), userData);
                
                const rootUserData = {
                  restaurantId: restaurantId,
                  email: formData.email,
                  fullName: formData.fullName,
                  role: formData.role,
                  createdAt: new Date().toISOString(),
                };
                await setDoc(doc(db, 'users', authResult.user.uid), rootUserData);
                
                // Remove from deleted emails set
                const newDeletedEmails = new Set(deletedEmails);
                newDeletedEmails.delete(formData.email.toLowerCase());
                setDeletedEmails(newDeletedEmails);
                
              } catch (retryError) {
                throw retryError; // Re-throw to be handled by outer catch
              }
            } else {
              throw authError; // Re-throw original error if cleanup failed
            }
          } else {
            throw authError; // Re-throw for any other auth errors
          }
        }
        
        // No need to sign out since we used secondary auth
      }

      setShowModal(false);
      setEditingUser(null);
      resetForm();
      
      window.location.reload();
    } catch (error: any) {
      console.error('Error saving user:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      fullName: '',
      role: 'employee',
      password: '',
    });
  };

  const handleEdit = (user: User) => {
    // Prevent editing current user
    if (currentUser && user.authUid === currentUser.uid) {
      return;
    }
    
    setEditingUser(user);
    setFormData({
      email: user.email,
      fullName: user.fullName,
      role: user.role === 'admin' ? 'employee' : user.role as 'employee' | 'manager', // Keep manager role, convert admin to employee for editing
      password: user.password,
    });
    setShowModal(true);
  };

  const handleDelete = async (user: User) => {
    if (!restaurantId) return;
    
    // Prevent deleting current user
    if (currentUser && user.authUid === currentUser.uid) {
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${user.fullName}?`)) {
      try {
        // Track this email as deleted for future reference
        const newDeletedEmails = new Set(deletedEmails);
        newDeletedEmails.add(user.email.toLowerCase());
        setDeletedEmails(newDeletedEmails);
        
        // Attempt to delete from Firebase Auth first (may fail)
        if (user.password) {
          await attemptAuthUserDeletion(user.email, user.password);
        }
        
        // Delete from Firestore (this should always work)
        await deleteDoc(getUserDoc(restaurantId, user.id));
        
        // Also try to delete from the root users collection
        try {
          if (user.authUid) {
            await deleteDoc(doc(db, 'users', user.authUid));
          }
        } catch (error) {
          console.log('Could not delete from root users collection:', error);
        }
        
        window.location.reload();
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const openAddModal = () => {
    setEditingUser(null);
    resetForm();
    setShowModal(true);
  };

  const filteredUsers = users.filter(user => {
    const matchesRole = filterRole === '' || user.role === filterRole;
    const isNotCurrentUser = currentUser ? user.authUid !== currentUser.uid : true;
    return matchesRole && isNotCurrentUser;
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'employee': return '#059669';
      case 'manager': return '#dc2626';
      case 'admin': return '#3182ce';
      default: return '#6b7280';
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
          <h1 className="page-title">User Management</h1>
          <button onClick={openAddModal} className="btn btn-primary">
            Add User
          </button>
        </div>

        <div className="flex gap-4 mb-4">
          <div>
            <label className="form-label">Filter by Role:</label>
            <select
              className="form-input"
              style={{ width: '150px' }}
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Password</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: '500' }}>{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>
                    <span
                      style={{
                        backgroundColor: getRoleBadgeColor(user.role),
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        textTransform: 'capitalize'
                      }}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span style={{ 
                      fontFamily: 'monospace', 
                      backgroundColor: '#f3f4f6', 
                      padding: '2px 4px', 
                      borderRadius: '4px' 
                    }}>
                      {user.password}
                    </span>
                  </td>
                  <td>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="btn btn-secondary btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="btn btn-error btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredUsers.length === 0 && (
            <div className="text-center" style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
              No users found. Add your first user to get started!
            </div>
          )}
        </div>

        {showModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h2 className="modal-title">
                  {editingUser ? 'Edit User' : 'Add User'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="form-input"
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newPassword = generatePassword();
                        setFormData(prev => ({ ...prev, password: newPassword }));
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      Generate
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-input"
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                    required
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                  <small className="form-help-text">
                    Managers have full access to the admin panel. Employees cannot access the admin panel.
                  </small>
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary">
                    {editingUser ? 'Update User' : 'Add User'}
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

export default UserManagement;
