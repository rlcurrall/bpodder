import type { ComponentChildren, SelectHTMLAttributes } from "preact";

import { clsx } from "../lib/utils.js";

type SelectProps = Omit<SelectHTMLAttributes, "class" | "multiple"> & {
  class?: string;
  children: ComponentChildren;
  ref?: preact.Ref<HTMLSelectElement>;
  multiple?: boolean;
};

export function Select({ class: className, children, ref, multiple, ...props }: SelectProps) {
  return (
    <span
      data-slot="control"
      class={clsx(
        // Basic layout
        "group relative block w-full",
        // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
        "before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm",
        // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
        "dark:before:hidden",
        // Focus ring
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset focus-within:after:ring-2 focus-within:after:ring-blue-500",
        // Disabled state
        "has-[:disabled]:opacity-50 has-[:disabled]:before:bg-zinc-950/5 has-[:disabled]:before:shadow-none",
      )}
    >
      <select
        ref={ref}
        multiple={multiple}
        class={clsx(
          // Basic layout
          "relative block w-full appearance-none rounded-lg py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]",
          // Horizontal padding
          multiple
            ? "px-[calc(--spacing(3.5)-1px)] sm:px-[calc(--spacing(3)-1px)]"
            : "pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]",
          // Options (multi-select)
          "[&_optgroup]:font-semibold",
          // Typography
          "text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white dark:*:text-white",
          // Border
          "border border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10 dark:hover:border-white/20",
          // Background color
          "bg-transparent dark:bg-white/5 dark:*:bg-zinc-800",
          // Hide default focus styles
          "focus:outline-none",
          // Invalid state
          "aria-invalid:border-red-500 aria-invalid:hover:border-red-500 dark:aria-invalid:border-red-600 dark:aria-invalid:hover:border-red-600",
          // Disabled state
          "disabled:border-zinc-950/20 dark:disabled:border-white/15 dark:disabled:bg-white/2.5 dark:hover:disabled:border-white/15",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {!multiple && (
        <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg
            class="size-5 stroke-zinc-500 group-has-[:disabled]:stroke-zinc-600 sm:size-4 dark:stroke-zinc-400"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path
              d="M5.75 10.75L8 13L10.25 10.75"
              stroke-width={1.5}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M10.25 5.25L8 3L5.75 5.25"
              stroke-width={1.5}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      )}
    </span>
  );
}
