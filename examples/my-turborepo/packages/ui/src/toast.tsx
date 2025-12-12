"use client";

import type { ToasterProps } from "sonner";
import { Toaster as Sonner, toast } from "sonner";

import { useTheme } from "./theme";

export const Toaster = ({ ...props }: ToasterProps) => {
  const { themeMode } = useTheme();

  return (
    <Sonner
      theme={themeMode === "auto" ? "system" : themeMode}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { toast };
