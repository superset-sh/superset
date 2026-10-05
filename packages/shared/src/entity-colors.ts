export const ENTITY_COLORS = [
	"#9ca3af",
	"#b0896b",
	"#eab308",
	"#f97316",
	"#22c55e",
	"#3b82f6",
	"#a855f7",
	"#ec4899",
	"#ef4444",
] as const;

/** A color for a new project or label nobody picked one for. */
export function pickEntityColor(): string {
	return ENTITY_COLORS[
		Math.floor(Math.random() * ENTITY_COLORS.length)
	] as string;
}
