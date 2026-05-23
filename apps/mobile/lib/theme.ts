import {
	DarkTheme,
	DefaultTheme,
	type Theme,
} from "expo-router/react-navigation";

/**
 * Superset mobile theme — ember warm palette (Path A, 2026-05-22).
 *
 * Mirrors `apps/mobile/global.css` key-for-key. Tailwind class consumers
 * (`bg-background`, `text-primary`, etc.) resolve through global.css;
 * non-className consumers (e.g. `NAV_THEME` for expo-router, hooks that
 * read raw color values) resolve through this object.
 *
 * Source of truth: `designs/tokens/tokens.css` at the worktree root.
 * Audit: `plans/chat-mobile-plan/14-token-migration-audit.md`.
 */
export const THEME = {
	light: {
		// Surfaces
		background: "hsl(0 0% 100%)",
		foreground: "hsl(0 0% 14.5%)",
		card: "hsl(0 0% 100%)",
		cardForeground: "hsl(0 0% 14.5%)",
		popover: "hsl(0 0% 100%)",
		popoverForeground: "hsl(0 0% 14.5%)",

		// Ember accent (BRAND)
		primary: "hsl(17 69% 60%)",
		primaryForeground: "hsl(0 0% 100%)",

		// Neutrals
		secondary: "hsl(40 5% 95%)",
		secondaryForeground: "hsl(0 0% 14.5%)",
		muted: "hsl(40 5% 95%)",
		mutedForeground: "hsl(0 0% 35%)",
		accent: "hsl(40 7% 90%)",
		accentForeground: "hsl(0 0% 14.5%)",

		// Destructive
		destructive: "hsl(0 84.2% 60.2%)",
		destructiveForeground: "hsl(0 0% 100%)",

		// Structure
		border: "hsl(0 0% 92%)",
		input: "hsl(0 0% 92%)",
		ring: "hsl(0 0% 71%)",
		radius: "0.625rem",

		// State palette
		stateLiveFg: "hsl(160 35% 39%)",
		stateLiveBg: "hsl(160 35% 95%)",
		stateWarningFg: "hsl(38 70% 45%)",
		stateWarningBg: "hsl(38 70% 95%)",
		stateDangerFg: "hsl(0 84% 60%)",
		stateDangerBg: "hsl(0 84% 96%)",
		stateSuccessFg: "hsl(160 35% 39%)",
		stateSuccessBg: "hsl(160 35% 95%)",
		stateNeutralFg: "hsl(0 0% 55%)",

		// Domain — chat
		streamingCursor: "hsl(160 35% 39%)",
		toolRule: "hsl(17 69% 60%)",

		// Typography
		fontBody: "Geist_400Regular",
		fontMono: "GeistMono_400Regular",
	},
	dark: {
		// Surfaces (warm-neutral ramp)
		background: "hsl(13 16% 7%)",
		foreground: "hsl(30 6% 91%)",
		card: "hsl(20 7% 12%)",
		cardForeground: "hsl(30 6% 91%)",
		popover: "hsl(20 7% 12%)",
		popoverForeground: "hsl(30 6% 91%)",

		// Ember accent (BRAND)
		primary: "hsl(17 69% 60%)",
		primaryForeground: "hsl(13 16% 7%)",

		// Neutrals
		secondary: "hsl(15 4% 16%)",
		secondaryForeground: "hsl(30 6% 91%)",
		muted: "hsl(15 4% 16%)",
		mutedForeground: "hsl(15 4% 65%)",
		accent: "hsl(15 6% 14%)",
		accentForeground: "hsl(30 6% 91%)",

		// Destructive
		destructive: "hsl(0 56% 53%)",
		destructiveForeground: "hsl(0 100% 90%)",

		// Structure
		border: "hsl(15 4% 16%)",
		input: "hsl(15 4% 16%)",
		ring: "hsl(15 3% 22%)",
		radius: "0.625rem",

		// State palette
		stateLiveFg: "hsl(149 35% 47%)",
		stateLiveBg: "hsla(149 35% 47% / 0.18)",
		stateWarningFg: "hsl(43 60% 56%)",
		stateWarningBg: "hsla(43 60% 56% / 0.18)",
		stateDangerFg: "hsl(0 56% 53%)",
		stateDangerBg: "hsla(0 56% 53% / 0.18)",
		stateSuccessFg: "hsl(149 35% 47%)",
		stateSuccessBg: "hsla(149 35% 47% / 0.18)",
		stateNeutralFg: "hsl(15 4% 65%)",

		// Domain — chat
		streamingCursor: "hsl(149 35% 47%)",
		toolRule: "hsl(17 69% 60%)",

		// Typography
		fontBody: "Geist_400Regular",
		fontMono: "GeistMono_400Regular",
	},
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
	light: {
		...DefaultTheme,
		colors: {
			...DefaultTheme.colors,
			background: THEME.light.background,
			border: THEME.light.border,
			card: THEME.light.card,
			notification: THEME.light.destructive,
			primary: THEME.light.primary,
			text: THEME.light.foreground,
		},
	},
	dark: {
		...DarkTheme,
		colors: {
			...DarkTheme.colors,
			background: THEME.dark.background,
			border: THEME.dark.border,
			card: THEME.dark.card,
			notification: THEME.dark.destructive,
			primary: THEME.dark.primary,
			text: THEME.dark.foreground,
		},
	},
};
