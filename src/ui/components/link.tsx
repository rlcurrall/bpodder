import type { ComponentChildren, AnchorHTMLAttributes } from "preact";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ComponentChildren;
  href: string;
}

export function Link({ children, href, class: className = "", ...props }: LinkProps) {
  const baseClasses =
    "text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 hover:underline transition-colors";
  const classes = `${baseClasses} ${className}`;

  return (
    <a href={href} class={classes} {...props}>
      {children}
    </a>
  );
}
