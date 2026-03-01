import type { Ref, RefObject } from "preact";
import type { ComponentChildren } from "preact";

import { createContext } from "preact";
import { forwardRef } from "preact/compat";
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "preact/hooks";

import { clsx } from "../lib/utils";

type DropdownState = "closed" | "opening" | "open" | "closing";

interface DropdownContextValue {
  state: DropdownState;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  onTransitionComplete: () => void;
  triggerRef: RefObject<HTMLButtonElement>;
  menuRef: RefObject<HTMLDivElement>;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  itemCount: number;
  registerItem: () => number;
  menuId: string;
  triggerId: string;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownContext() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error("Dropdown components must be used within a Dropdown");
  }
  return context;
}

interface DropdownProps {
  children: ComponentChildren;
  defaultOpen?: boolean;
  onChange?: (isOpen: boolean) => void;
}

export function Dropdown({ children, defaultOpen = false, onChange }: DropdownProps) {
  const [state, setState] = useState<DropdownState>(defaultOpen ? "open" : "closed");
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemCounter = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const triggerId = useId();

  const setIsOpen = useCallback(
    (value: boolean) => {
      if (value) {
        setState("opening");
        onChange?.(true);
      } else {
        setState("closing");
      }
    },
    [onChange],
  );

  const onTransitionComplete = useCallback(() => {
    if (state === "opening") {
      setState("open");
    } else if (state === "closing") {
      setState("closed");
      setActiveIndex(-1);
      onChange?.(false);
    }
  }, [state, onChange]);

  const registerItem = useCallback(() => {
    const index = itemCounter.current++;
    return index;
  }, []);

  // Click outside to close
  useEffect(() => {
    if (state !== "open" && state !== "opening") return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [state, setIsOpen]);

  // Escape key to close
  useEffect(() => {
    if (state !== "open" && state !== "opening") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state, setIsOpen]);

  const context: DropdownContextValue = {
    state,
    isOpen: state !== "closed",
    setIsOpen,
    onTransitionComplete,
    triggerRef,
    menuRef,
    activeIndex,
    setActiveIndex,
    itemCount: itemCounter.current,
    registerItem,
    menuId,
    triggerId,
  };

  return (
    <DropdownContext.Provider value={context}>
      <div class="relative inline-block isolate">{children}</div>
    </DropdownContext.Provider>
  );
}

interface DropdownButtonProps {
  children?: ComponentChildren;
  class?: string;
  [key: string]: unknown;
}

export const DropdownButton = forwardRef<HTMLButtonElement, DropdownButtonProps>(
  function DropdownButton({ children, class: className, ...props }) {
    const { isOpen, setIsOpen, triggerRef, setActiveIndex, itemCount, menuId, triggerId } =
      useDropdownContext();

    const handleClick = useCallback(
      (event: MouseEvent) => {
        event.preventDefault();
        setIsOpen(!isOpen);
        if (!isOpen) {
          setActiveIndex(0);
        }
      },
      [isOpen, setIsOpen, setActiveIndex],
    );

    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        switch (event.key) {
          case "ArrowDown":
          case "ArrowUp":
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setActiveIndex(event.key === "ArrowDown" ? 0 : itemCount - 1);
            } else {
              setActiveIndex(event.key === "ArrowDown" ? 0 : itemCount - 1);
            }
            break;
          case "Enter":
          case " ":
            if (!isOpen) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex(0);
            }
            break;
        }
      },
      [isOpen, setIsOpen, setActiveIndex, itemCount],
    );

    return (
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        class={clsx(className)}
        {...props}
      >
        {children}
      </button>
    );
  },
);

interface DropdownMenuProps {
  children: ComponentChildren;
  class?: string;
  anchor?: "bottom" | "top" | "bottom-start" | "bottom-end" | "top-start" | "top-end";
}

export function DropdownMenu({ children, class: className, anchor = "bottom" }: DropdownMenuProps) {
  const {
    state,
    menuRef,
    onTransitionComplete,
    activeIndex,
    setActiveIndex,
    itemCount,
    menuId,
    triggerId,
  } = useDropdownContext();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex(activeIndex >= itemCount - 1 ? 0 : activeIndex + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex(activeIndex <= 0 ? itemCount - 1 : activeIndex - 1);
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(itemCount - 1);
          break;
      }
    },
    [activeIndex, itemCount, setActiveIndex],
  );

  // Handle transition end
  const handleTransitionEnd = useCallback(
    (e: TransitionEvent) => {
      // Only handle transitions on the menu itself (not children)
      if (e.target === menuRef.current) {
        onTransitionComplete();
      }
    },
    [onTransitionComplete, menuRef],
  );

  // Focus the active item when it changes
  useEffect(() => {
    if (state !== "open" && state !== "opening") return;
    if (activeIndex < 0) return;

    const menu = menuRef.current;
    if (menu) {
      const items = menu.querySelectorAll('[role="menuitem"]');
      const activeItem = items[activeIndex] as HTMLElement | undefined;
      activeItem?.focus();
    }
  }, [activeIndex, state, menuRef]);

  if (state === "closed") return null;

  // Determine positioning classes based on anchor
  const anchorClasses: Record<string, string> = {
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    "bottom-start": "top-full left-0 mt-2",
    "bottom-end": "top-full right-0 mt-2",
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    "top-start": "bottom-full left-0 mb-2",
    "top-end": "bottom-full right-0 mb-2",
  };

  // Transition classes based on state
  const transitionClasses = clsx(
    "transition ease-out will-change-transform",
    // Opening or Open: visible state with transition
    (state === "opening" || state === "open") && "opacity-100 scale-100",
    // Opening: animate over 300ms
    state === "opening" && "duration-300",
    // Closing: fade out over 100ms
    state === "closing" && "opacity-0 scale-95 ease-in duration-100",
  );

  // On first render of opening state, we need to force a reflow to ensure
  // the browser sees the initial hidden state before transitioning
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    if (state === "opening" && !hasMounted) {
      setHasMounted(true);
    }
  }, [state, hasMounted]);

  return (
    <div
      ref={menuRef as Ref<HTMLDivElement>}
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      onKeyDown={handleKeyDown}
      onTransitionEnd={handleTransitionEnd}
      data-state={state}
      class={clsx(
        className,
        // Positioning
        "absolute z-50",
        anchorClasses[anchor],
        // Base styles
        "isolate w-max min-w-[8rem] rounded-xl p-1",
        // Invisible border for forced-colors accessibility
        "outline outline-transparent focus:outline-hidden",
        // Handle scrolling when menu won't fit
        "overflow-y-auto max-h-[calc(100vh-8rem)]",
        // Popover background
        "bg-white/90 backdrop-blur-xl dark:bg-zinc-900/90",
        // Shadows
        "shadow-lg ring-1 ring-zinc-950/5 dark:ring-white/10",
        // Transitions - start at closed state, animate to open
        "opacity-0 scale-95",
        transitionClasses,
      )}
    >
      {/* Subgrid wrapper - creates the grid context for all items */}
      <div class="grid grid-cols-[auto_1fr_auto] supports-[grid-template-columns:subgrid]:grid-cols-subgrid">
        {children}
      </div>
    </div>
  );
}

interface DropdownItemProps {
  children: ComponentChildren;
  class?: string;
  href?: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
}

export function DropdownItem({
  children,
  class: className,
  href,
  disabled = false,
  onClick,
}: DropdownItemProps) {
  const { setIsOpen, registerItem, activeIndex, setActiveIndex } = useDropdownContext();
  const itemRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const itemIndex = useMemo(() => registerItem(), [registerItem]);
  const isActive = activeIndex === itemIndex;

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
      setIsOpen(false);
    },
    [disabled, onClick, setIsOpen],
  );

  const handleMouseEnter = useCallback(() => {
    if (!disabled) {
      setActiveIndex(itemIndex);
    }
  }, [disabled, itemIndex, setActiveIndex]);

  const classes = clsx(
    className,
    // Subgrid layout - items span full width and use parent's grid
    "col-span-full grid grid-cols-subgrid items-center",
    // Base styles
    "group cursor-default rounded-lg px-3 py-2 focus:outline-hidden sm:px-2.5 sm:py-1.5",
    // Text styles
    "text-left text-sm text-zinc-950 dark:text-white forced-colors:text-[CanvasText]",
    // Focus/hover
    "data-active:bg-blue-500 data-active:text-white hover:bg-blue-500 hover:text-white",
    // Disabled state
    "data-disabled:opacity-50",
    // Forced colors mode
    "forced-color-adjust-none forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText]",
    // Icons in first column
    "[&>[data-slot=icon]]:col-start-1 [&>[data-slot=icon]]:row-start-1 [&>[data-slot=icon]]:mr-2 [&>[data-slot=icon]]:size-4",
    "[&>[data-slot=icon]]:text-zinc-500 [&>[data-slot=icon]]:data-active:text-white [&>[data-slot=icon]]:group-hover:text-white",
    "dark:[&>[data-slot=icon]]:text-zinc-400",
    // Label in middle column
    "[&>[data-slot=label]]:col-start-2 [&>[data-slot=label]]:row-start-1",
    // Shortcut/description in third column
    "[&>[data-slot=shortcut]]:col-start-3 [&>[data-slot=shortcut]]:row-start-1 [&>[data-slot=shortcut]]:justify-self-end",
    "[&>[data-slot=description]]:col-start-2 [&>[data-slot=description]]:row-start-2",
  );

  if (href) {
    const anchorProps = {
      ref: itemRef as Ref<HTMLAnchorElement>,
      role: "menuitem" as const,
      class: classes,
      "data-active": isActive || undefined,
      "data-disabled": disabled || undefined,
      tabIndex: isActive ? 0 : -1,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
    };
    return (
      <a href={href} {...anchorProps}>
        {children}
      </a>
    );
  }

  const buttonProps = {
    ref: itemRef as Ref<HTMLButtonElement>,
    role: "menuitem" as const,
    class: classes,
    "data-active": isActive || undefined,
    "data-disabled": disabled || undefined,
    tabIndex: isActive ? 0 : -1,
    onClick: handleClick,
    onMouseEnter: handleMouseEnter,
  };

  return (
    <button type="button" {...buttonProps} disabled={disabled}>
      {children}
    </button>
  );
}

export function DropdownHeader({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <div class={clsx(className, "col-span-full px-3 py-2 sm:px-2.5")}>{children}</div>;
}

export function DropdownSection({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <div class={clsx(className, "col-span-full contents")}>{children}</div>;
}

export function DropdownHeading({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <div
      class={clsx(
        className,
        "col-span-full grid grid-cols-subgrid px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400",
      )}
    >
      <span class="col-start-2">{children}</span>
    </div>
  );
}

export function DropdownDivider({ class: className }: { class?: string }) {
  return (
    <hr
      class={clsx(
        className,
        "col-span-full mx-3 my-1 h-px border-0 bg-zinc-950/10 dark:bg-white/10 forced-colors:bg-[CanvasText]",
      )}
    />
  );
}

export function DropdownLabel({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <span data-slot="label" class={clsx(className, "block")}>
      {children}
    </span>
  );
}

export function DropdownDescription({
  children,
  class: className,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <span
      data-slot="description"
      class={clsx(
        className,
        "block text-xs text-zinc-500 group-data-active:text-white dark:text-zinc-400",
      )}
    >
      {children}
    </span>
  );
}

export function DropdownShortcut({
  keys,
  class: className,
}: {
  keys: string | string[];
  class?: string;
}) {
  const keyArray = Array.isArray(keys) ? keys : keys.split("");

  return (
    <span
      data-slot="shortcut"
      class={clsx(
        className,
        "flex items-center gap-0.5 text-xs text-zinc-400 group-data-active:text-white",
      )}
    >
      {keyArray.map((char, index) => (
        <kbd
          key={index}
          class={clsx(
            "min-w-[1.25rem] text-center font-sans capitalize",
            "text-zinc-400 group-data-active:text-white",
            index > 0 && char.length > 1 && "ml-0.5",
          )}
        >
          {char}
        </kbd>
      ))}
    </span>
  );
}
