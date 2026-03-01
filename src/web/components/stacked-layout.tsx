import type { ComponentChildren } from "preact";

import { useState } from "preact/hooks";

import { clsx } from "../lib/utils.js";
import { NavbarItem } from "./navbar.js";

function OpenMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
    </svg>
  );
}

function CloseMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function MobileSidebar({
  open,
  close,
  children,
}: {
  open: boolean;
  close: () => void;
  children: ComponentChildren;
}) {
  if (!open) return null;

  return (
    <div class="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div class="fixed inset-0 bg-black/30" onClick={close} aria-hidden="true" />
      {/* Sidebar panel */}
      <div class="fixed inset-y-0 left-0 w-full max-w-80 p-2">
        <div class="flex h-full flex-col rounded-lg bg-white shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div class="-mb-3 px-4 pt-3">
            <NavbarItem onClick={close} aria-label="Close navigation">
              <CloseMenuIcon />
            </NavbarItem>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StackedLayout({
  navbar,
  sidebar,
  children,
}: {
  navbar: ComponentChildren;
  sidebar: ComponentChildren;
  children: ComponentChildren;
}) {
  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <div class="relative isolate flex min-h-screen w-full flex-col bg-white dark:bg-zinc-900 dark:lg:bg-zinc-950">
      {/* Sidebar on mobile */}
      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
        {sidebar}
      </MobileSidebar>

      {/* Navbar */}
      <header class="flex items-center px-4 bg-white dark:bg-zinc-900 lg:dark:bg-zinc-950 border-b lg:border-b-0 border-zinc-950/10 dark:border-white/10">
        <div class="py-2.5 lg:hidden">
          <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
            <OpenMenuIcon />
          </NavbarItem>
        </div>
        <div class="flex items-center min-w-0 flex-1">{navbar}</div>
      </header>

      {/* Content */}
      <main class="flex flex-1 flex-col pb-2 lg:px-2">
        <div
          class={clsx(
            "grow p-6 lg:rounded-lg lg:p-10 lg:shadow-sm lg:ring-1 lg:ring-zinc-950/5",
            "lg:bg-zinc-100 dark:lg:bg-zinc-900 dark:lg:ring-white/10",
          )}
        >
          <div class="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
