import { QueryClient, QueryClientProvider } from "@tanstack/preact-query";
import { LocationProvider, Route, Router, useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";

import { AuthProvider, useAuth } from "./lib/auth";
import { ActivityPage } from "./pages/activity";
import { DashboardPage } from "./pages/dashboard";
import { DevicesPage } from "./pages/devices";
import { LoginPage } from "./pages/login";
import { RegisterPage } from "./pages/register";
import { SettingsPage } from "./pages/settings";
import { SubscriptionsPage } from "./pages/subscriptions";

const queryClient = new QueryClient();

function Routes() {
  const { isAuthenticated } = useAuth();
  const { url, route } = useLocation();

  useEffect(() => {
    if (isAuthenticated && (url === "/login" || url === "/register")) {
      route("/dashboard", true);
    } else if (!isAuthenticated && url !== "/login" && url !== "/register") {
      route("/login", true);
    }
  }, [url, isAuthenticated]);

  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/subscriptions" component={SubscriptionsPage} />
      <Route path="/devices" component={DevicesPage} />
      <Route path="/activity" component={ActivityPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route default component={DashboardPage} />
    </Router>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocationProvider>
          <Routes />
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
