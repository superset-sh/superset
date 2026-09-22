import { PixelIcon } from "@/app/[lang]/components/PixelIcon";

const ART = [
	[
		"#########",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.#####.#",
		"#########",
	],
	[
		"#########",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.#####.#",
		"#.#####.#",
		"#########",
	],
	[
		"#########",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#########",
	],
	[
		"#########",
		"#.......#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#########",
	],
] as const;

const FRAME = [
	"#########",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#########",
] as const;

interface TierIconProps {
	tier: number;

	size?: number;
	hollow?: boolean;
	className?: string;
}

export function TierIcon({
	tier,
	size = 18,
	hollow = false,
	className = "",
}: TierIconProps) {
	const art = hollow ? FRAME : ART[tier - 1];
	if (!art) return null;

	return <PixelIcon art={art} size={size} className={className} />;
}
