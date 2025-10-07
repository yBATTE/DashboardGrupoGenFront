import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import TasksBoard from "./pages/TasksBoard";
import Login from "./pages/Login";
import NewTask from "./pages/NewTask";
import TeamsPage from "./pages/Teams";
import TeamsManage from "./pages/TeamsManage";
import UsersAdmin from "./pages/UsersAdmin";
import AdminUsersList from "./pages/AdminUsersList";
import AdminUserDetail from "./pages/AdminUserDetail";
import TaskDetail from "./pages/TaskDetail";

import RequireAuth from "./components/RequiereAuth"; // ✅ ojo: nombre y ruta corregidos
import PublicOnly from "./components/PublicOnly";
import AuthBootstrap from "./components/AuthBootstrap";
import AuthExpiryWatcher from "./components/AuthExpiryWatcher"; // ⬅️ nuevo

import PaymentsCalendar from "./pages/PaymentsCalendar";
import NewPayment from "./pages/NewPayment";
import PaymentDetail from "./pages/PaymentDetail";
import ForgotMyPassword from "./pages/ForgotMyPassword";
import Home from "./pages/Home";

export default function App() {
  return (
    <BrowserRouter>
      {/* Montamos el watcher global una sola vez */}
      <AuthExpiryWatcher />

      {/* Si tenés un bootstrap que refresca/me trae /auth/me, lo mantenemos */}
      <AuthBootstrap>
        <Routes>
          {/* públicas */}
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicOnly>
                <ForgotMyPassword />
              </PublicOnly>
            }
          />

          {/* privadas (usando RequireAuth como wrapper tal como lo tenías) */}
          {/* home / dashboard */}
            <Route path="/" element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          {/* tareas */}
          <Route
            path="/tasks"
            element={
              <RequireAuth>
                <TasksBoard />
              </RequireAuth>
            }
          />
          <Route
            path="/new"
            element={
              <RequireAuth>
                <NewTask />
              </RequireAuth>
            }
          />
          <Route
            path="/teams"
            element={
              <RequireAuth>
                <TeamsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/teams/manage"
            element={
              <RequireAuth>
                <TeamsManage />
              </RequireAuth>
            }
          />

          {/* admin */}
          <Route
            path="/users"
            element={
              <RequireAuth>
                <UsersAdmin />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <AdminUsersList />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <RequireAuth>
                <AdminUserDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/tasks/:id"
            element={
              <RequireAuth>
                <TaskDetail />
              </RequireAuth>
            }
          />

          {/* pagos */}
          <Route
            path="/payments"
            element={
              <RequireAuth>
                <PaymentsCalendar />
              </RequireAuth>
            }
          />
          <Route
            path="/new/payments"
            element={
              <RequireAuth>
                <NewPayment />
              </RequireAuth>
            }
          />
          <Route
            path="/payments/:id"
            element={
              <RequireAuth>
                <PaymentDetail />
              </RequireAuth>
            }
          />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
