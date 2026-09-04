import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.js";
import LoginPage from "./pages/LoginPage.js";
import HomePage from "./pages/HomePage.js";
import GamePage from "./pages/GamePage.js";
import QuestionBankPage from "./pages/QuestionBankPage.js";
import ThemeToggle from "./components/ThemeToggle.js";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <>
        <ThemeToggle />
        <div className="flex min-h-screen items-center justify-center">Loading…</div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <ThemeToggle />
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Not "/questions" — that path is the API's question-bank endpoint,
            and a direct/full-page load of a client route with the same path
            hits the real API route before ever reaching the SPA shell. */}
        <Route path="/question-bank" element={<QuestionBankPage />} />
        <Route path="/g/:code" element={<GamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
