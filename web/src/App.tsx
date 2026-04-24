import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AllTasksPage } from "./pages/AllTasksPage";
import { ProjectPage } from "./pages/ProjectPage";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./lib/auth";

export function App() {
  const { session, loading } = useAuth();

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

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<AllTasksPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
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
