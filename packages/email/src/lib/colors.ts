/**
 * Email-safe color constants
 * Converted from app's OKLCH theme to hex for email client compatibility
 */

export const colors = {
	// Light mode colors (primary theme for emails)
	background: "#FFFFFF",
	foreground: "#212121",
	primary: "#323232",
	primaryForeground: "#FBFBFB",
	secondary: "#F7F7F7",
	secondaryForeground: "#323232",
	muted: "#F7F7F7",
	mutedForeground: "#888888",
	accent: "#F7F7F7",
	accentForeground: "#323232",
	destructive: "#E85D4A",
	border: "#EBEBEB",
	input: "#EBEBEB",
	ring: "#B5B5B5",
} as const;

export type Color = keyof typeof colors;
