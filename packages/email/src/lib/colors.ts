/**
 * Email-safe color constants
 * Tailwind neutral palette from packages/ui/src/globals.css
 */

export const colors = {
	// Light mode colors (primary theme for emails)
	background: "#FFFFFF",
	foreground: "#242424", // Tailwind neutral - very dark gray
	primary: "#343434", // Tailwind neutral - dark gray
	primaryForeground: "#FBFBFB", // Tailwind neutral - near white
	secondary: "#F7F7F7",
	secondaryForeground: "#343434",
	muted: "#F7F7F7",
	mutedForeground: "#8E8E8E", // Tailwind neutral - medium gray
	accent: "#F7F7F7",
	accentForeground: "#343434",
	destructive: "#E85D4A",
	border: "#EBEBEB", // Tailwind neutral - light gray
	input: "#EBEBEB",
	ring: "#B5B5B5",
} as const;

export type Color = keyof typeof colors;
