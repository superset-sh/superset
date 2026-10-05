import { cn } from "@superset/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ComponentType, type MouseEvent, useRef } from "react";

const COLUMNS = 12;
const ROW_HEIGHT = 34;
const OVERSCAN = 4;

interface ProjectIconGridProps {
	names: string[];
	icons: Record<string, ComponentType<{ className?: string; style?: object }>>;
	selected: string | null;
	color: string | null;
	onPick: (name: string, event: MouseEvent<HTMLButtonElement>) => void;
}

export function ProjectIconGrid({
	names,
	icons,
	selected,
	color,
	onPick,
}: ProjectIconGridProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const rowCount = Math.ceil(names.length / COLUMNS);
	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	return (
		<div ref={scrollRef} className="max-h-[320px] overflow-y-auto p-2">
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((row) => (
					<div
						key={row.key}
						className="absolute inset-x-0 grid grid-cols-12 gap-0.5"
						style={{ top: row.start, height: ROW_HEIGHT }}
					>
						{names
							.slice(row.index * COLUMNS, (row.index + 1) * COLUMNS)
							.map((name) => {
								const Icon = icons[name];
								if (!Icon) return null;
								return (
									<button
										key={name}
										type="button"
										aria-label={name.replace(/-/g, " ")}
										onClick={(event) => onPick(name, event)}
										className={cn(
											"flex size-8 items-center justify-center rounded-md hover:bg-fill-hover",
											name === selected && "bg-fill-selected",
										)}
									>
										<Icon
											className={cn(
												"size-5",
												!color && "text-muted-foreground",
											)}
											style={color ? { color } : undefined}
										/>
									</button>
								);
							})}
					</div>
				))}
			</div>
		</div>
	);
}
