import { Router, route } from "preact-router";

import { AuthProvider, useAuth } from "./lib/auth";
import { DashboardPage } from "./pages/dashboard";
import { LoginPage } from "./pages/login";
import { RegisterPage } from "./pages/register";

function Routes() {
  const { isAuthenticated } = useAuth();

  // Auth redirect logic
  const handleRoute = (e: { url: string }) => {
    if (isAuthenticated && (e.url === "/login" || e.url === "/register")) {
      route("/dashboard", true);
    } else if (!isAuthenticated && e.url === "/dashboard") {
      route("/login", true);
    }
  };

  return (
    <Router onChange={handleRoute}>
      <LoginPage path="/login" />
      <RegisterPage path="/register" />
      <DashboardPage path="/dashboard" />
      <LoginPage default />
    </Router>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
