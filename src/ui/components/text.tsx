import type { ComponentChildren, HTMLAttributes } from "preact";

import { clsx } from "../lib/utils.js";
import { Link } from "./link.js";

export function Text({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="text"
      {...props}
      class={clsx(className, "text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400")}
    >
      {children}
    </p>
  );
}

export function TextLink({ class: className, ...props }: Parameters<typeof Link>[0]) {
  return (
    <Link
      {...props}
      class={clsx(
        className,
        "text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white",
      )}
    />
  );
}

export function Strong({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLElement>) {
  return (
    <strong {...props} class={clsx(className, "font-medium text-zinc-950 dark:text-white")}>
      {children}
    </strong>
  );
}

export function Code({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLElement>) {
  return (
    <code
      {...props}
      class={clsx(
        className,
        "rounded-sm border border-zinc-950/10 bg-zinc-950/2.5 px-0.5 text-sm font-medium text-zinc-950 sm:text-[0.8125rem] dark:border-white/20 dark:bg-white/5 dark:text-white",
      )}
    >
      {children}
    </code>
  );
}
