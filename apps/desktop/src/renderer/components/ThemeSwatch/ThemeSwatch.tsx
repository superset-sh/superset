import { getTerminalColors, type Theme } from "shared/themes";

export function ThemeSwatch({ theme }: { theme: Theme }) {
	const terminal = getTerminalColors(theme);
	const isDark = theme.type === "dark";
	return (
		<div
			className="flex h-5 w-7 shrink-0 items-center justify-center gap-1 rounded-sm font-semibold"
			style={{
				backgroundColor: terminal.background,
				boxShadow: "inset 0 0 0 0.5px rgba(128, 128, 128, 0.3)",
			}}
		>
			<span
				className="h-1 w-1 rounded-full"
				style={{ backgroundColor: terminal.green }}
			/>
			<span
				className="text-[9px] leading-none"
				style={{ color: isDark ? "#fff" : "#000", opacity: 0.9 }}
			>
				Aa
			</span>
		</div>
	);
}
