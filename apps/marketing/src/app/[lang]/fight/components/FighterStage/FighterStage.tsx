import { tierLabel, tierRgb } from "@/app/[lang]/components/TierBadge";
import { buildKit, type Fighter } from "../../utils/simulateFight";
import { DinoSprite } from "../DinoSprite";

const EMPTY_RGB = "120,120,128";

interface FighterStageProps {
	fighter: Fighter | null;
	side: "a" | "b";
	isViewer?: boolean;
	onClear: () => void;
}

export function FighterStage({
	fighter,
	side,
	isViewer = false,
	onClear,
}: FighterStageProps) {
	const rgb = fighter ? tierRgb(fighter.tier) : EMPTY_RGB;
	const right = side === "b";

	return (
		<div
			className={`flex flex-col ${right ? "items-end text-right" : "items-start text-left"}`}
		>
			<div className="relative">
				<div className="fight-bob">
					<DinoSprite
						frame="stand"
						rgb={rgb}
						facing={right ? "left" : "right"}
						title={
							fighter
								? `${fighter.name} as a terminal dinosaur`
								: "An empty fighter slot"
						}
						style={{ width: "var(--stage-dino)" }}
						className={`h-auto ${fighter ? "" : "opacity-25"}`}
					/>
				</div>
				{!fighter && (
					<span
						aria-hidden="true"
						className="fight-pulse absolute inset-0 flex items-center justify-center font-mono text-5xl md:text-6xl font-bold text-muted-foreground/70"
					>
						?
					</span>
				)}
			</div>

			<div
				aria-hidden="true"
				className="h-1.5 w-20 md:w-28 rounded-[50%] bg-black/50 blur-[1px] -mt-1"
			/>

			{fighter ? (
				<div className="mt-4">
					<div
						className={`flex items-baseline gap-2 ${right ? "flex-row-reverse" : ""}`}
					>
						<p className="min-w-0 break-words text-lg md:text-2xl text-foreground leading-tight">
							{fighter.name}
						</p>
						{isViewer && (
							<span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-brand">
								you
							</span>
						)}
					</div>
					<p
						className="font-mono text-[0.6rem] uppercase tracking-[0.14em] mt-1"
						style={{ color: `rgb(${rgb})` }}
					>
						{fighter.tier >= 1 ? tierLabel(fighter.tier).message : "Unranked"} ·{" "}
						{buildKit(fighter).rating} pwr
					</p>
					<button
						type="button"
						onClick={onClear}
						className="mt-2 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors"
					>
						change
					</button>
				</div>
			) : (
				<p className="mt-4 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
					choose your dino
				</p>
			)}
		</div>
	);
}
