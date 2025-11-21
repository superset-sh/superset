import colors from "tailwindcss/colors";

const PROJECT_COLORS = [
	colors.blue[500],
	colors.green[500],
	colors.yellow[500],
	colors.red[500],
	colors.purple[500],
	colors.cyan[500],
	colors.orange[500],
	colors.slate[500],
] as const;

export function assignRandomColor(): string {
	return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}
