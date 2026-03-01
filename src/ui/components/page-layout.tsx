import { useLocation } from "preact-iso";

import { useAuth } from "../lib/auth";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./dropdown";
import { NavbarItem, NavbarLabel, NavbarSection } from "./navbar";
import { StackedLayout } from "./stacked-layout";

interface PageLayoutProps {
  children: preact.ComponentChildren;
  currentPath: string;
  title?: string;
}

export function PageLayout({ children, currentPath, title }: PageLayoutProps) {
  const { route } = useLocation();
  const { username, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    route("/login");
  };

  const navLinks = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/subscriptions", label: "Subscriptions" },
    { path: "/devices", label: "Devices" },
    { path: "/activity", label: "Activity" },
  ];

  const navbar = (
    <>
      <div class="py-2.5 lg:hidden" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-4 py-2.5">
          <div class="flex items-center gap-3">
            <span class="relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5 dark:text-white">
              <span class="truncate">bpodder</span>
            </span>
          </div>
          {/* Navigation links - desktop only */}
          <div class="hidden md:flex items-center gap-1 ml-6">
            {navLinks.map(({ path, label }) => (
              <NavbarItem key={path} current={currentPath === path} href={path}>
                <NavbarLabel>{label}</NavbarLabel>
              </NavbarItem>
            ))}
          </div>
          <div class="flex-1" />
          <div class="flex items-center gap-3">
            <Dropdown>
              <DropdownButton class="relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/5">
                <span class="truncate hidden sm:block">{username}</span>
                <svg
                  class="size-4 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </DropdownButton>
              <DropdownMenu anchor="bottom-end">
                <DropdownItem href="/settings">
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={handleLogout}>
                  <DropdownLabel>Logout</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>
    </>
  );

  const sidebar = (
    <div class="px-4 py-6">
      <NavbarSection class="flex-col items-start gap-1">
        <NavbarItem current={currentPath === "/dashboard"} href="/dashboard">
          <NavbarLabel>Dashboard</NavbarLabel>
        </NavbarItem>
        <NavbarItem current={currentPath === "/subscriptions"} href="/subscriptions">
          <NavbarLabel>Subscriptions</NavbarLabel>
        </NavbarItem>
        <NavbarItem current={currentPath === "/devices"} href="/devices">
          <NavbarLabel>Devices</NavbarLabel>
        </NavbarItem>
        <NavbarItem current={currentPath === "/activity"} href="/activity">
          <NavbarLabel>Activity</NavbarLabel>
        </NavbarItem>
        <NavbarItem current={currentPath === "/settings"} href="/settings">
          <NavbarLabel>Settings</NavbarLabel>
        </NavbarItem>
      </NavbarSection>
    </div>
  );

  return (
    <StackedLayout navbar={navbar} sidebar={sidebar}>
      {title && <h1 class="text-2xl font-semibold text-zinc-900 dark:text-white mb-6">{title}</h1>}
      {children}
    </StackedLayout>
  );
}
