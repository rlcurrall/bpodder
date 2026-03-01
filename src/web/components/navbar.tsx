import type {
  ComponentChildren,
  HTMLAttributes,
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
} from "preact";

import { clsx } from "../lib/utils.js";
import { TouchTarget } from "./button.js";
import { Link } from "./link.js";

export function Navbar({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLElement>) {
  return (
    <nav
      {...props}
      class={clsx(
        className,
        "flex flex-1 items-center gap-4 py-2.5 px-4 sm:px-6",
        "bg-white dark:bg-zinc-900",
        "border-b border-zinc-950/10 dark:border-white/10",
      )}
    >
      {children}
    </nav>
  );
}

export function NavbarDivider({ class: className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      class={clsx(
        typeof className === "string" ? className : className?.value,
        "h-6 w-px bg-zinc-950/10 dark:bg-white/10",
      )}
    />
  );
}

export function NavbarSection({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} class={clsx(className, "flex items-center gap-3")}>
      {children}
    </div>
  );
}

export function NavbarSpacer({ class: className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      class={clsx(typeof className === "string" ? className : className?.value, "-ml-4 flex-1")}
    />
  );
}

type NavbarItemProps =
  | (AnchorHTMLAttributes<HTMLAnchorElement> & {
      current?: boolean;
      class?: string;
      children: ComponentChildren;
    })
  | (ButtonHTMLAttributes<HTMLButtonElement> & {
      current?: boolean;
      class?: string;
      children: ComponentChildren;
    });

export function NavbarItem(props: NavbarItemProps) {
  const { current, class: className, children, ...rest } = props;
  const classes = clsx(
    // Base
    "relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5",
    // Leading icon/icon-only
    "*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 sm:*:data-[slot=icon]:size-5",
    // Trailing icon (down chevron or similar)
    "*:not-nth-2:last:data-[slot=icon]:ml-auto *:not-nth-2:last:data-[slot=icon]:size-5 sm:*:not-nth-2:last:data-[slot=icon]:size-4",
    // Hover
    "hover:bg-zinc-950/5 hover:*:data-[slot=icon]:fill-zinc-950",
    // Active
    "active:bg-zinc-950/5 active:*:data-[slot=icon]:fill-zinc-950",
    // Current indicator (static version without motion)
    current && "bg-zinc-950/5 *:data-[slot=icon]:fill-zinc-950",
    // Dark mode
    "dark:text-white dark:*:data-[slot=icon]:fill-zinc-400",
    "dark:hover:bg-white/5 dark:hover:*:data-[slot=icon]:fill-white",
    "dark:active:bg-white/5 dark:active:*:data-[slot=icon]:fill-white",
    current && "dark:bg-white/5 dark:*:data-[slot=icon]:fill-white",
  );

  return (
    <span class={clsx(className, "relative")}>
      {current && (
        <span class="absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-zinc-950 dark:bg-white" />
      )}
      {"href" in rest ? (
        <Link class={classes} data-current={current ? "true" : undefined} {...rest}>
          <TouchTarget>{children}</TouchTarget>
        </Link>
      ) : (
        <button
          class={clsx("cursor-pointer", classes)}
          data-current={current ? "true" : undefined}
          {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          <TouchTarget>{children}</TouchTarget>
        </button>
      )}
    </span>
  );
}

export function NavbarLabel({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} class={clsx(className, "truncate")}>
      {children}
    </span>
  );
}
