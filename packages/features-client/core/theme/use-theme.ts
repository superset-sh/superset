import { useAtom, useAtomValue } from "jotai";
import { themeAtom, resolvedThemeAtom } from "./store";
import type { ThemeMode } from "./store";

export function useTheme() {
  const [theme, setTheme] = useAtom(themeAtom);
  const resolvedTheme = useAtomValue(resolvedThemeAtom);
  return { theme, setTheme, resolvedTheme };
}

export type { ThemeMode };
