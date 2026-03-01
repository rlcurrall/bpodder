import type { AnchorHTMLAttributes } from "preact";

import { clsx } from "../lib/utils";

export function Link({
  children,
  href,
  class: className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const classes = clsx(
    "text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 hover:underline transition-colors",
    typeof className === "string" ? className : className.value,
  );

  return (
    <a href={href} class={classes} {...props}>
      {children}
    </a>
  );
}
