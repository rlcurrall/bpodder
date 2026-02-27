import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentChildren } from "preact";

import { clsx } from "../lib/utils.js";

type ButtonProps = (
  | (ButtonHTMLAttributes & {
      ref?: preact.Ref<HTMLButtonElement>;
    })
  | (AnchorHTMLAttributes & {
      ref?: preact.Ref<HTMLAnchorElement>;
    })
) & {
  children: ComponentChildren;
  color?: keyof typeof styles.colors;
  outline?: boolean;
  plain?: boolean;
};

const styles = {
  base: [
    // Base
    "relative isolate inline-flex items-baseline justify-center gap-x-2 rounded-lg border text-base/6 font-semibold",
    // Sizing
    "px-[calc(0.875rem-1px)] py-[calc(0.625rem-1px)] sm:px-[calc(0.75rem-1px)] sm:py-[calc(0.375rem-1px)] sm:text-sm/6",
    // Focus
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900",
    // Disabled
    "disabled:opacity-50",
  ],
  solid: [
    // Optical border, implemented as the button background to avoid corner artifacts
    "border-transparent bg-(--btn-border)",
    // Dark mode: border is rendered on `after` so background is set to button background
    "dark:bg-(--btn-bg)",
    // Button background, implemented as foreground layer to stack on top of pseudo-border layer
    "before:absolute before:inset-0 before:-z-10 before:rounded-[calc(0.5rem-1px)] before:bg-(--btn-bg)",
    // Drop shadow, applied to the inset `before` layer so it blends with the border
    "before:shadow-sm",
    // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
    "dark:before:hidden",
    // Dark mode: Subtle white outline is applied using a border
    "dark:border-white/5",
    // Shim/overlay, inset to match button foreground and used for hover state + highlight shadow
    "after:absolute after:inset-0 after:-z-10 after:rounded-[calc(0.5rem-1px)]",
    // Inner highlight shadow
    "after:shadow-[inset_0_1px_rgba(255,255,255,0.15)]",
    // White overlay on hover
    "hover:after:bg-(--btn-hover-overlay) active:after:bg-(--btn-hover-overlay)",
    // Dark mode: `after` layer expands to cover entire button
    "dark:after:-inset-px dark:after:rounded-lg",
    // Disabled
    "disabled:before:shadow-none disabled:after:shadow-none",
  ],
  outline: [
    // Base
    "border-zinc-950/10 text-zinc-950 hover:bg-zinc-950/5 active:bg-zinc-950/5",
    // Dark mode
    "dark:border-white/15 dark:text-white dark:bg-transparent dark:hover:bg-white/5 dark:active:bg-white/5",
  ],
  plain: [
    // Base
    "border-transparent text-zinc-950 hover:bg-zinc-950/5 active:bg-zinc-950/5",
    // Dark mode
    "dark:text-white dark:bg-transparent dark:hover:bg-white/10 dark:active:bg-white/10",
  ],
  colors: {
    zinc: [
      "text-white [--btn-bg:var(--color-zinc-600)] [--btn-border:var(--color-zinc-950)]/90 [--btn-hover-overlay:var(--color-white)]/10",
      "dark:[--btn-hover-overlay:var(--color-white)]/5",
    ],
    green: [
      "text-white [--btn-bg:var(--color-emerald-600)] [--btn-border:var(--color-emerald-700)]/90 [--btn-hover-overlay:var(--color-white)]/10",
      "[--btn-icon:var(--color-white)]/60 hover:[--btn-icon:var(--color-white)]/80 active:[--btn-icon:var(--color-white)]/80",
    ],
    blue: [
      "text-white [--btn-bg:var(--color-blue-600)] [--btn-border:var(--color-blue-700)]/90 [--btn-hover-overlay:var(--color-white)]/10",
      "[--btn-icon:var(--color-blue-400)] hover:[--btn-icon:var(--color-blue-300)] active:[--btn-icon:var(--color-blue-300)]",
    ],
    red: [
      "text-white [--btn-bg:var(--color-red-600)] [--btn-border:var(--color-red-700)]/90 [--btn-hover-overlay:var(--color-white)]/10",
      "[--btn-icon:var(--color-red-400)] hover:[--btn-icon:var(--color-red-300)] active:[--btn-icon:var(--color-red-300)]",
    ],
  },
};

export function Button({
  color = "zinc",
  outline,
  plain,
  class: className,
  children,
  ...props
}: ButtonProps) {
  const classes = clsx(
    typeof className === "string" ? className : className?.value,
    styles.base,
    outline ? styles.outline : plain ? styles.plain : clsx(styles.solid, styles.colors[color]),
  );

  if ("href" in props) {
    return (
      <a class={classes} {...props}>
        <TouchTarget>{children}</TouchTarget>
      </a>
    );
  }

  return (
    <button class={classes} {...(props as ButtonHTMLAttributes)}>
      <TouchTarget>{children}</TouchTarget>
    </button>
  );
}

/**
 * Expand the hit area to at least 44×44px on touch devices
 */
export function TouchTarget({ children }: { children: ComponentChildren }) {
  return (
    <>
      <span
        class="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 [@media(pointer:fine)]:hidden"
        aria-hidden="true"
      />
      {children}
    </>
  );
}
