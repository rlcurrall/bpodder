import type { HTMLAttributes } from "preact";

import { clsx } from "../lib/utils.js";

export function Divider({
  soft = false,
  class: className,
  ...props
}: {
  soft?: boolean;
} & HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      role="presentation"
      {...props}
      class={clsx(
        typeof className === "string" ? className : className?.value,
        "w-full border-t",
        soft && "border-zinc-950/5 dark:border-white/5",
        !soft && "border-zinc-950/10 dark:border-white/10",
      )}
    />
  );
}
