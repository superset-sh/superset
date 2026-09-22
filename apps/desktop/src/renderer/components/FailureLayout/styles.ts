export const failureLayoutStyles = {
	frame: {
		display: "flex",
		flexDirection: "column",
		position: "fixed",
		inset: 0,
		background: "var(--background, #151110)",
		color: "var(--foreground, #eae8e6)",
		fontFamily: "system-ui, sans-serif",
	},
	titleBar: {
		height: "48px",
		flexShrink: 0,
		WebkitAppRegion: "drag",
	},
	content: {
		flex: 1,
		minHeight: 0,
		overflow: "auto",
		padding: "24px",
		WebkitAppRegion: "no-drag",
	},
} as const;
