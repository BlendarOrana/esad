import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { useAuthStore } from "./stores/useAuthStore";

function ProtectedRoute({ children }) {
  const { admin } = useAuthStore();
  return admin ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { getMe, isCheckingAuth, admin } = useAuthStore();

  // Check if the user has a valid cookie when the app first loads
  useEffect(() => {
    getMe();
  }, [getMe]);

  // Show a loading screen while waiting for the server to verify the cookie
  if (isCheckingAuth) {
    return (
      <div className="w-4 h-4 border-2 border-white/50 border-t-white animate-spin rounded-full">
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={admin ? <Navigate to="/admin/dashboard" replace /> : <LoginPage />} 
      />
      
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}