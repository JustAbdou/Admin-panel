import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { RestaurantProvider } from './contexts/RestaurantContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SignIn from './components/auth/SignIn';
import SignUp from './components/auth/SignUp';
import Dashboard from './components/dashboard/Dashboard';
import Recipes from './components/recipes/Recipes';
import Handovers from './components/handovers/Handovers';
import UserManagement from './components/users/UserManagement';
import Suppliers from './components/suppliers/Suppliers';
import Fridges from './components/fridges/Fridges';
import Closing from './components/closing/Closing';
import './styles/global.css';

function App() {
  return (
    <RestaurantProvider>
      <Router>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes"
            element={
              <ProtectedRoute>
                <Recipes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/handovers"
            element={
              <ProtectedRoute>
                <Handovers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <Suppliers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fridges"
            element={
              <ProtectedRoute>
                <Fridges />
              </ProtectedRoute>
            }
          />
          <Route
            path="/closing"
            element={
              <ProtectedRoute>
                <Closing />
              </ProtectedRoute>
            }
          />
         
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </RestaurantProvider>
  );
}

export default App;
