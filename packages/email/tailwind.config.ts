import type { Config } from "tailwindcss";
import { colors } from "./src/lib/colors";

export default {
	content: ["./src/**/*.{js,jsx,ts,tsx}"],
	theme: {
		extend: {
			colors: {
				background: colors.background,
				foreground: colors.foreground,
				primary: {
					DEFAULT: colors.primary,
					foreground: colors.primaryForeground,
				},
				secondary: {
					DEFAULT: colors.secondary,
					foreground: colors.secondaryForeground,
				},
				muted: {
					DEFAULT: colors.muted,
					foreground: colors.mutedForeground,
				},
				accent: {
					DEFAULT: colors.accent,
					foreground: colors.accentForeground,
				},
				destructive: colors.destructive,
				border: colors.border,
				input: colors.input,
				ring: colors.ring,
			},
			borderRadius: {
				sm: "6px",
				DEFAULT: "8px",
				md: "9px",
				lg: "10px",
				xl: "12px",
			},
		},
	},
	plugins: [],
} satisfies Config;
