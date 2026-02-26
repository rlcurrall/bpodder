import type { ComponentChildren, HTMLAttributes } from "preact";

import { clsx } from "../lib/utils.js";

export function Card({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      class={clsx(
        "bg-white dark:bg-zinc-800 rounded-xl",
        "shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      class={clsx("px-6 py-4", "border-b border-zinc-950/5 dark:border-white/5", className)}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      {...props}
      class={clsx(
        "text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function CardContent({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} class={clsx("px-6 py-4", className)}>
      {children}
    </div>
  );
}

export function CardFooter({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      class={clsx("px-6 py-4", "border-t border-zinc-950/5 dark:border-white/5", className)}
    >
      {children}
    </div>
  );
}
