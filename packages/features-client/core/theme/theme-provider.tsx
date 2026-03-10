import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { themeAtom, resolvedThemeAtom } from "./store";

interface Props {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: Props) {
  const theme = useAtomValue(themeAtom);
  const resolvedTheme = useAtomValue(resolvedThemeAtom);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      if (e.matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  return <>{children}</>;
}
