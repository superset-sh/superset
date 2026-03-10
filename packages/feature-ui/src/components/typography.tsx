import { cn } from "@superbuilder/feature-ui/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";

interface Props extends VariantProps<typeof typographyVariants> {
  children: React.ReactNode;
}

export function Typography({ children, ...variants }: Props) {
  const Element = variants.as || "p";

  return (
    <Element className={cn(typographyVariants(variants))} data-slot="typography">
      {children}
    </Element>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Styles
 * -----------------------------------------------------------------------------------------------*/

const typographyVariants = cva("min-h-[1lh] break-keep", {
  variants: {
    as: {
      h1: "text-4xl font-extrabold tracking-tight",
      h2: "text-3xl font-semibold tracking-tight",
      h3: "text-2xl font-semibold tracking-tight",
      h4: "text-xl font-semibold tracking-tight",
      h5: "text-lg font-medium tracking-tight",
      p: "text-md font-regular tracking-normal",
      div: "text-md font-regular tracking-normal",
    },

    family: {
      sans: "font-sans",
      serif: "font-serif",
    },

    size: {
      "4xl": "text-4xl tracking-tight",
      "3xl": "text-3xl tracking-tight",
      "2xl": "text-2xl tracking-tight",
      xl: "text-xl tracking-tight",
      lg: "text-lg tracking-tight",
      md: "text-md tracking-normal",
      sm: "text-sm tracking-normal",
      xs: "text-xs tracking-normal",
    },

    weight: {
      extrabold: "font-extrabold",
      bold: "font-bold",
      semibold: "font-semibold",
      medium: "font-medium",
      regular: "font-regular",
      light: "font-light",
    },

    color: {
      inherit: "text-inherit",
      foreground: "text-foreground",
      "muted-foreground": "text-muted-foreground",
    },

    balance: {
      balance: "text-balance",
      pretty: "text-pretty",
      nowrap: "text-nowrap",
      wrap: "text-wrap",
    },

    lineClamp: {
      10: "line-clamp-10 min-h-[10lh] text-wrap",
      9: "line-clamp-9 min-h-[9lh] text-wrap",
      8: "line-clamp-8 min-h-[8lh] text-wrap",
      7: "line-clamp-7 min-h-[7lh] text-wrap",
      6: "line-clamp-6 min-h-[6lh] text-wrap",
      5: "line-clamp-5 min-h-[5lh] text-wrap",
      4: "line-clamp-4 min-h-[4lh] text-wrap",
      3: "line-clamp-3 min-h-[3lh] text-wrap",
      2: "line-clamp-2 min-h-[2lh] text-wrap",
      1: "truncate text-nowrap",
      none: "",
    },

    caption: {
      true: "text-muted-foreground [[data-slot=typography]+&]:mt-[0.25lh]",
      false: "[[data-slot=typography]+&]:mt-[0.5lh]",
    },
  },

  defaultVariants: {
    as: "p",
    family: "sans",
    color: "inherit",
    lineClamp: "none",
    caption: false,
  },
});
