import type { SessionConfigOption } from "@superset/chat/protocol";
import { Slider } from "@superset/ui/slider";
import { cn } from "@superset/ui/utils";
import { LuZap } from "react-icons/lu";

const SNAP_MOTION_CLASS =
	"transition-[left,right,width] duration-150 ease-[cubic-bezier(0.22,1.1,0.36,1)] motion-reduce:transition-none";

export function EffortSliderCard({
	effort,
	fast,
	onSelect,
}: {
	effort: SessionConfigOption;
	fast: SessionConfigOption | undefined;
	onSelect: (configId: string, value: string) => void;
}) {
	const levels = effort.options;
	const lastIndex = Math.max(levels.length - 1, 0);
	const index = Math.max(
		levels.findIndex((level) => level.id === effort.currentValue),
		0,
	);
	const fastOn = fast?.currentValue === "on";
	const marks = levels.map((_, i) =>
		lastIndex === 0 ? 0 : (i / lastIndex) * 100,
	);

	return (
		<div className="px-1 pt-0.5 pb-1" data-slot="effort-slider-card">
			<div className="grid grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center gap-1">
				{fast ? (
					<button
						aria-label={fast.label}
						aria-pressed={fastOn}
						className={cn(
							"flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							fastOn ? "text-highlight" : "text-muted-foreground/70",
						)}
						onClick={() => onSelect(fast.id, fastOn ? "off" : "on")}
						title={fast.label}
						type="button"
					>
						<LuZap className={cn("size-3.5", fastOn && "fill-current")} />
					</button>
				) : (
					<span aria-hidden="true" className="size-6" />
				)}
				<span className="truncate text-center text-[13px] font-medium text-highlight">
					{levels[index]?.label ?? effort.label}
				</span>
				<span aria-hidden="true" className="size-6" />
			</div>
			<div className="mt-1 px-0.5">
				<Slider
					aria-label={effort.label}
					className="group/slider py-0.5"
					max={lastIndex}
					min={0}
					onValueChange={([next]) => {
						const level = next === undefined ? undefined : levels[next];
						if (level && level.id !== effort.currentValue) {
							onSelect(effort.id, level.id);
						}
					}}
					rangeClassName={cn(
						"rounded-full bg-highlight",
						SNAP_MOTION_CLASS,
						index === 0 && "opacity-0",
					)}
					step={1}
					thumbClassName={cn(
						"size-7 cursor-grab border-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.05)] hover:ring-0 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing",
						SNAP_MOTION_CLASS,
					)}
					trackClassName="overflow-visible bg-foreground/[0.14] data-[orientation=horizontal]:h-6"
					value={[index]}
				>
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-0 left-3.5 right-3.5"
					>
						{marks.map((percent, i) => (
							<span
								className={cn(
									"absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
									i <= index ? "bg-white/55" : "bg-foreground/[0.28]",
								)}
								key={levels[i]?.id}
								style={{ left: `${percent}%` }}
							/>
						))}
					</span>
				</Slider>
			</div>
		</div>
	);
}
