import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AllTasksPage } from "./pages/AllTasksPage";
import { ProjectPage } from "./pages/ProjectPage";
import TodayPage from "./pages/TodayPage";
import { LoginPage } from "./pages/LoginPage";
import { AdminPage } from "./pages/AdminPage";
import { NotApprovedPage } from "./pages/NotApprovedPage";
import { useAuth } from "./lib/auth";
import { useMe } from "./lib/api";

export function App() {
  const { session, loading } = useAuth();
  const { data: me, isLoading: meLoading } = useMe();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (meLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (me && me.is_allowed === false) {
    return <NotApprovedPage />;
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/all-tasks" element={<AllTasksPage />} />
          <Route path="/prioritized" element={<Navigate to="/" replace />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          {me?.is_admin && (
            <Route path="/admin" element={<AdminPage />} />
          )}
          <Route
            path="*"
            element={
              <div className="flex h-full items-center justify-center text-sm text-ink-500">
                Not found
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
