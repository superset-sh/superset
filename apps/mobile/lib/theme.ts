import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";

export const THEME = {
	light: {
		background: "hsl(0 0% 100%)", // --color-background
		foreground: "hsl(240 10% 3.9%)", // --color-foreground
		card: "hsl(0 0% 100%)", // --color-card
		cardForeground: "hsl(240 10% 3.9%)", // --color-card-foreground
		popover: "hsl(0 0% 100%)", // --color-popover
		popoverForeground: "hsl(240 10% 3.9%)", // --color-popover-foreground
		primary: "hsl(240 5.9% 10%)", // --color-primary
		primaryForeground: "hsl(0 0% 98%)", // --color-primary-foreground
		secondary: "hsl(240 4.8% 95.9%)", // --color-secondary
		secondaryForeground: "hsl(240 5.9% 10%)", // --color-secondary-foreground
		muted: "hsl(240 4.8% 95.9%)", // --color-muted
		mutedForeground: "hsl(240 3.8% 46.1%)", // --color-muted-foreground
		accent: "hsl(240 4.8% 95.9%)", // --color-accent
		accentForeground: "hsl(240 5.9% 10%)", // --color-accent-foreground
		destructive: "hsl(0 84.2% 60.2%)", // --color-destructive
		border: "hsl(240 5.9% 90%)", // --color-border
		input: "hsl(240 5.9% 90%)", // --color-input
		ring: "hsl(240 5.9% 10%)", // --color-ring
		radius: "0.5rem",
	},
	dark: {
		background: "hsl(240 10% 3.9%)", // --color-background
		foreground: "hsl(0 0% 98%)", // --color-foreground
		card: "hsl(240 10% 3.9%)", // --color-card
		cardForeground: "hsl(0 0% 98%)", // --color-card-foreground
		popover: "hsl(240 10% 3.9%)", // --color-popover
		popoverForeground: "hsl(0 0% 98%)", // --color-popover-foreground
		primary: "hsl(0 0% 98%)", // --color-primary
		primaryForeground: "hsl(240 5.9% 10%)", // --color-primary-foreground
		secondary: "hsl(240 3.7% 15.9%)", // --color-secondary
		secondaryForeground: "hsl(0 0% 98%)", // --color-secondary-foreground
		muted: "hsl(240 3.7% 15.9%)", // --color-muted
		mutedForeground: "hsl(240 5% 64.9%)", // --color-muted-foreground
		accent: "hsl(240 3.7% 15.9%)", // --color-accent
		accentForeground: "hsl(0 0% 98%)", // --color-accent-foreground
		destructive: "hsl(0 62.8% 30.6%)", // --color-destructive
		border: "hsl(240 3.7% 15.9%)", // --color-border
		input: "hsl(240 3.7% 15.9%)", // --color-input
		ring: "hsl(240 4.9% 83.9%)", // --color-ring
		radius: "0.5rem",
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
