import { tierLabel, tierRgb } from "@/app/[lang]/components/TierBadge";
import { avatarUrl } from "@/app/[lang]/utils/avatarUrl";
import type { Fighter, Kit } from "../../utils/simulateFight";

interface FighterPanelProps {
	fighter: Fighter;
	kit: Kit;
	hp: number;
	align: "left" | "right";
	dimmed: boolean;
}

export function FighterPanel({
	fighter,
	kit,
	hp,
	align,
	dimmed,
}: FighterPanelProps) {
	const rgb = tierRgb(fighter.tier);
	const share = Math.max(0, Math.min(1, hp / kit.hp));
	const critical = share <= 0.25;
	const right = align === "right";

	return (
		<div
			className={`flex flex-col gap-2 transition-opacity duration-500 ${right ? "items-end text-right" : "items-start text-left"} ${dimmed ? "opacity-40" : ""}`}
		>
			<div
				className={`flex items-center gap-2.5 ${right ? "flex-row-reverse" : ""}`}
			>
				{/* biome-ignore lint/performance/noImgElement: avatars are remote and unoptimised by design */}
				<img
					src={avatarUrl(fighter.handle)}
					alt=""
					width={36}
					height={36}
					className="border shrink-0"
					style={{ borderColor: `rgba(${rgb},0.4)` }}
				/>
				<div>
					<p className="text-sm md:text-base text-foreground leading-tight truncate max-w-[9rem] md:max-w-none">
						{fighter.name}
					</p>
					<p
						className="font-mono text-[0.55rem] uppercase tracking-[0.14em]"
						style={{ color: `rgb(${rgb})` }}
					>
						{fighter.tier >= 1 ? tierLabel(fighter.tier).message : "Unranked"}
					</p>
				</div>
			</div>

			<div className="relative w-full h-3 border border-border/70 bg-background/40 p-px">
				<div
					className="absolute inset-px transition-[width] duration-[900ms] delay-300 ease-out bg-[rgb(214,64,52)]"
					style={{
						width: share <= 0 ? "0px" : `calc(${share * 100}% - 2px)`,
						left: right ? "auto" : undefined,
						right: right ? "1px" : undefined,
					}}
				/>
				<div
					className="absolute inset-px transition-[width] duration-200 ease-out"
					style={{
						width: share <= 0 ? "0px" : `calc(${share * 100}% - 2px)`,
						left: right ? "auto" : undefined,
						right: right ? "1px" : undefined,
						background: critical ? "rgb(236,120,64)" : `rgb(${rgb})`,
					}}
				/>
			</div>

			<div
				className={`flex items-baseline gap-3 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground ${right ? "flex-row-reverse" : ""}`}
			>
				<span className="tabular-nums text-foreground/80">
					{Math.round(hp)}/{kit.hp} HP
				</span>
				<span>{kit.hits}× swing</span>
				<span>{Math.round(kit.armor * 100)}% armor</span>
			</div>
		</div>
	);
}
