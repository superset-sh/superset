import { tierRgb } from "@/app/[lang]/components/TierBadge";
import type { Fighter } from "../../../../utils/simulateFight";
import { DinoSprite } from "../../../DinoSprite";

interface RosterCardProps {
	fighter: Fighter;
	seated: boolean;
	onPick: (fighter: Fighter) => void;
}

export function RosterCard({ fighter, seated, onPick }: RosterCardProps) {
	const rgb = tierRgb(fighter.tier);

	return (
		<button
			type="button"
			disabled={seated}
			onClick={() => onPick(fighter)}
			style={{ borderColor: seated ? undefined : `rgba(${rgb},0.35)` }}
			className={`fight-card group relative flex flex-col items-center gap-2 border px-2 py-3 transition-colors ${
				seated
					? "border-border/60 opacity-40 cursor-not-allowed"
					: "hover:bg-foreground/[0.04]"
			}`}
		>
			<div className="fight-card-dino">
				<DinoSprite
					frame="stand"
					rgb={rgb}
					facing="right"
					title={fighter.name}
					style={{ width: "3.25rem" }}
					className="h-auto"
				/>
			</div>
			<span className="text-[0.7rem] text-foreground leading-tight text-center truncate w-full">
				{fighter.name}
			</span>
			<span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted-foreground truncate w-full text-center">
				{seated ? "in the ring" : `@${fighter.handle}`}
			</span>
		</button>
	);
}
