import type { ComponentChildren, HTMLAttributes } from "preact";

import { clsx } from "../lib/utils.js";

export function Heading({
  class: className,
  level = 1,
  children,
  ...props
}: {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLHeadingElement>) {
  const Element = `h${level}` as const;

  return (
    <Element
      {...props}
      class={clsx(className, "text-2xl/8 font-semibold text-zinc-950 sm:text-xl/8 dark:text-white")}
    >
      {children}
    </Element>
  );
}

export function Subheading({
  class: className,
  level = 2,
  children,
  ...props
}: {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLHeadingElement>) {
  const Element = `h${level}` as const;

  return (
    <Element
      {...props}
      class={clsx(
        className,
        "text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white",
      )}
    >
      {children}
    </Element>
  );
}
