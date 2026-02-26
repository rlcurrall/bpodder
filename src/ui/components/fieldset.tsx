import type { ComponentChildren, HTMLAttributes, LabelHTMLAttributes } from "preact";

import { clsx } from "../lib/utils.js";

export function Fieldset({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLFieldSetElement>) {
  return (
    <fieldset
      {...props}
      class={clsx(
        "border-none p-0",
        className,
        "*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6",
      )}
    >
      {children}
    </fieldset>
  );
}

export function Legend({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLLegendElement>) {
  return (
    <legend
      data-slot="legend"
      {...props}
      class={clsx(
        className,
        "text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white",
        "has-[:disabled]:opacity-50",
      )}
    >
      {children}
    </legend>
  );
}

export function FieldGroup({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="control" {...props} class={clsx(className, "space-y-8")}>
      {children}
    </div>
  );
}

export function Field({
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
        className,
        "[&>[data-slot=label]+[data-slot=control]]:mt-3",
        "[&>[data-slot=label]+[data-slot=description]]:mt-1",
        "[&>[data-slot=description]+[data-slot=control]]:mt-3",
        "[&>[data-slot=control]+[data-slot=description]]:mt-3",
        "[&>[data-slot=control]+[data-slot=error]]:mt-3",
        "*:data-[slot=label]:font-medium",
      )}
    >
      {children}
    </div>
  );
}

export function Label({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot="label"
      {...props}
      class={clsx(
        className,
        "text-base/6 text-zinc-950 select-none sm:text-sm/6 dark:text-white",
        "has-[:disabled]:opacity-50",
      )}
    >
      {children}
    </label>
  );
}

export function Description({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="description"
      {...props}
      class={clsx(
        className,
        "text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400",
        "has-[:disabled]:opacity-50",
      )}
    >
      {children}
    </p>
  );
}

export function ErrorMessage({
  class: className,
  children,
  ...props
}: {
  class?: string;
  children: ComponentChildren;
} & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="error"
      role="alert"
      {...props}
      class={clsx(
        className,
        "text-base/6 text-red-600 sm:text-sm/6 dark:text-red-500",
        "has-[:disabled]:opacity-50",
      )}
    >
      {children}
    </p>
  );
}
