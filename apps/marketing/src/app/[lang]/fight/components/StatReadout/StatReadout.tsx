import { tierRgb } from "@/app/[lang]/components/TierBadge";
import { AXES } from "../../constants";
import { buildKit, type Fighter } from "../../utils/simulateFight";
import { axisFill, axisValue } from "./format";

interface StatReadoutProps {
	fighter: Fighter;
	align: "left" | "right";
}

export function StatReadout({ fighter, align }: StatReadoutProps) {
	const kit = buildKit(fighter);
	const rgb = tierRgb(fighter.tier);

	return (
		<dl className="w-full max-w-xs flex flex-col gap-1.5">
			{AXES.map((axis) => {
				const raw = fighter.axes[axis.key];
				const fill = axisFill(axis, raw);
				return (
					<div
						key={axis.key}
						className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}
					>
						<dt className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground w-14 shrink-0">
							{axis.stat}
						</dt>
						<dd className="flex-1 h-1.5 bg-foreground/10 overflow-hidden">
							<div
								className="h-full transition-[width] duration-700 ease-out"
								style={{
									width: `${Math.round(fill * 100)}%`,
									marginLeft: align === "right" ? "auto" : undefined,
									background: `rgb(${rgb})`,
								}}
							/>
						</dd>
						<dd
							className="font-mono text-[0.55rem] tracking-[0.06em] text-foreground/70 w-20 shrink-0 tabular-nums"
							style={{ textAlign: align === "right" ? "left" : "right" }}
						>
							{axisValue(axis, raw)}
						</dd>
					</div>
				);
			})}
			<div
				className={`flex items-baseline gap-2 pt-1 ${align === "right" ? "flex-row-reverse" : ""}`}
			>
				<span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground">
					rating
				</span>
				<span
					className="font-mono text-sm tabular-nums"
					style={{ color: `rgb(${rgb})` }}
				>
					{kit.rating}
				</span>
			</div>
		</dl>
	);
}
