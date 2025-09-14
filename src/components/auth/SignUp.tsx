import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { Link, useNavigate } from 'react-router-dom';
import { checkRestaurantExists } from '../../utils/firestoreHelpers';

const SignUp: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [additionalRestaurantIds, setAdditionalRestaurantIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      // Parse restaurant IDs (primary + secondary ones)
      const allRestaurantIds = [restaurantId];
      if (additionalRestaurantIds.trim()) {
        const additional = additionalRestaurantIds.split(',').map(id => id.trim()).filter(id => id);
        allRestaurantIds.push(...additional);
      }

      // Validate all restaurant IDs exist
      for (const id of allRestaurantIds) {
        const restaurantExists = await checkRestaurantExists(id);
        if (!restaurantExists) {
          setError(`Restaurant ID "${id}" does not exist. Please contact us to purchase valid restaurant IDs.`);
          setLoading(false);
          return;
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        fullName: fullName,
        email: user.email,
        restaurantId: restaurantId, // Primary restaurant (backward compatibility)
        restaurantIds: allRestaurantIds, // All restaurant IDs for multi-restaurant support
        createdAt: new Date().toISOString(),
        role: 'manager',
        isRestaurantOwner: true
      });

      navigate('/dashboard');
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Create Restaurant Admin Account</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="fullName" className="form-label">
              Full Name
            </label>
            <input
              type="text"
              id="fullName"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="restaurantId" className="form-label">
              Primary Restaurant ID *
            </label>
            <input
              type="text"
              id="restaurantId"
              className="form-input"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              required
              placeholder="Enter your main restaurant ID"
            />
            <small className="form-help-text">
              This will be your primary restaurant. You must purchase restaurant IDs from us before signing up.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="additionalRestaurantIds" className="form-label">
              Secondary Restaurant IDs (Optional)
            </label>
            <input
              type="text"
              id="additionalRestaurantIds"
              className="form-input"
              value={additionalRestaurantIds}
              onChange={(e) => setAdditionalRestaurantIds(e.target.value)}
              placeholder="restaurant2, restaurant3, restaurant4"
            />
            <small className="form-help-text">
              Enter secondary restaurant IDs separated by commas if you own multiple restaurants.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              type="password"
              id="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm your password"
            />
          </div>

          {error && (
            <div className="form-error mb-4">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full btn-lg"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="auth-link">
            Already have an account?{' '}
            <Link to="/signin">Sign in here</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
