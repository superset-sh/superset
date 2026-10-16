interface LevelIndicatorsProps {
	level: number;
}

/**
 * Vertical indent guides for one changes-tree row.
 *
 * Folder and file rows must render this as the first child of the row
 * container, outside anything that adds leading content or vertical padding —
 * otherwise the guides shift sideways or stop short and the column stops
 * reading as one continuous line.
 */
export function LevelIndicators({ level }: LevelIndicatorsProps) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={i} className="w-3 self-stretch border-r border-border" />
			))}
		</div>
	);
}
