import type { ComponentChildren } from "preact";

import { clsx } from "@web/lib/utils";
import { createContext } from "preact";
import { createPortal } from "preact/compat";
import { useCallback, useContext, useEffect, useRef, useState } from "preact/hooks";

import { Subheading } from "./heading";

type DialogState = "closed" | "opening" | "open" | "closing";

interface DialogContextValue {
  state: DialogState;
  onClose: () => void;
  onTransitionComplete: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used within Dialog");
  return ctx;
}

interface DialogProps {
  open: boolean;
  onClose: (value: boolean) => void;
  class?: string;
  children: ComponentChildren;
}

export function Dialog({ open, onClose, class: className, children }: DialogProps) {
  const [state, setState] = useState<DialogState>("closed");
  const prevActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      prevActiveRef.current = document.activeElement as HTMLElement;
      setState("opening");
      // Advance to "open" on the next frame so the browser sees the initial
      // hidden state before the CSS transition fires.
      const raf = requestAnimationFrame(() => setState("open"));
      return () => cancelAnimationFrame(raf);
    } else {
      setState((s) => (s === "closed" ? "closed" : "closing"));
    }
  }, [open]);

  // Scroll lock
  useEffect(() => {
    if (state === "closed") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  // Escape key
  useEffect(() => {
    if (state === "closed") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state, onClose]);

  const handleClose = useCallback(() => onClose(false), [onClose]);

  const handleTransitionComplete = useCallback(() => {
    if (state === "closing") {
      setState("closed");
      prevActiveRef.current?.focus();
    }
  }, [state]);

  if (state === "closed") return null;

  return createPortal(
    <DialogContext.Provider
      value={{ state, onClose: handleClose, onTransitionComplete: handleTransitionComplete }}
    >
      <div class={clsx(className, "relative z-10")} role="dialog" aria-modal="true">
        {children}
      </div>
    </DialogContext.Provider>,
    document.body,
  );
}

interface DialogBackdropProps {
  class?: string;
}

export function DialogBackdrop({ class: className }: DialogBackdropProps) {
  const { state, onTransitionComplete } = useDialogContext();
  const ref = useRef<HTMLDivElement>(null);

  const handleTransitionEnd = useCallback(
    (e: TransitionEvent) => {
      if (e.target === ref.current) {
        onTransitionComplete();
      }
    },
    [onTransitionComplete],
  );

  return (
    <div
      ref={ref}
      aria-hidden="true"
      onTransitionEnd={handleTransitionEnd}
      class={clsx(
        className,
        "fixed inset-0 bg-gray-500/75 dark:bg-gray-900/50",
        "transition-opacity",
        state === "open" ? "opacity-100 duration-300 ease-out" : "opacity-0 duration-200 ease-in",
      )}
    />
  );
}

interface DialogPanelProps {
  class?: string;
  children: ComponentChildren;
}

export function DialogPanel({ class: className, children }: DialogPanelProps) {
  const { state } = useDialogContext();
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-focus: prefer [autofocus] or [data-autofocus], fall back to first focusable element.
  // We query manually rather than relying on the browser's native autofocus so we can
  // control timing — focus should happen when the dialog is open, not on DOM insertion.
  useEffect(() => {
    if (state !== "open") return;
    const panel = panelRef.current;
    if (!panel) return;
    const autofocus = panel.querySelector<HTMLElement>("[autofocus], [data-autofocus]");
    const focusable = panel.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (autofocus ?? focusable)?.focus();
  }, [state]);

  // Focus trap
  useEffect(() => {
    if (state !== "open") return;
    const panel = panelRef.current;
    if (!panel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  return (
    <div
      ref={panelRef}
      class={clsx(
        className,
        "transition-all",
        state === "open"
          ? "opacity-100 translate-y-0 scale-100 duration-300 ease-out"
          : "opacity-0 translate-y-4 sm:translate-y-0 scale-95 duration-200 ease-in",
      )}
    >
      {children}
    </div>
  );
}

interface DialogTitleProps {
  level?: Parameters<typeof Subheading>[0]["level"];
  class?: string;
  children: ComponentChildren;
}

export function DialogTitle({ level = 3, class: className, children }: DialogTitleProps) {
  return (
    <Subheading level={level} class={className}>
      {children}
    </Subheading>
  );
}
