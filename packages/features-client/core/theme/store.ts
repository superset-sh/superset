import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

export const themeAtom = atomWithStorage<ThemeMode>(THEME_STORAGE_KEY, "system");

export const resolvedThemeAtom = atom<"light" | "dark">((get) => {
  const theme = get(themeAtom);
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
});
