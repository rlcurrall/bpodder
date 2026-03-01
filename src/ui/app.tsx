import { Route, Router, route } from "preact-router";

import { AuthProvider, useAuth } from "./lib/auth";
import { ActivityPage } from "./pages/activity";
import { DashboardPage } from "./pages/dashboard";
import { DevicesPage } from "./pages/devices";
import { LoginPage } from "./pages/login";
import { RegisterPage } from "./pages/register";
import { SettingsPage } from "./pages/settings";
import { SubscriptionsPage } from "./pages/subscriptions";

function Routes() {
  const { isAuthenticated } = useAuth();

  const handleRoute = (e: { url: string }) => {
    if (isAuthenticated && (e.url === "/login" || e.url === "/register")) {
      route("/dashboard", true);
    } else if (!isAuthenticated && e.url.startsWith("/")) {
      if (e.url !== "/login" && e.url !== "/register") {
        route("/login", true);
      }
    }
  };

  return (
    <Router onChange={handleRoute}>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/dashboard" component={DashboardPage} default />
      <Route path="/subscriptions" component={SubscriptionsPage} />
      <Route path="/devices" component={DevicesPage} />
      <Route path="/activity" component={ActivityPage} />
      <Route path="/settings" component={SettingsPage} />
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
