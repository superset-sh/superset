import { tierRgb } from "@/app/[lang]/components/TierBadge";
import type { ProductionRun, RunStatus } from "../../../../constants";
import { LiveDot } from "../../../LiveDot";
import { RunTargets } from "../../../RunTargets";

interface RunPanelProps {
	run: ProductionRun;
	status: RunStatus;
	statusLabel: string;
}

export function RunPanel({ run, status, statusLabel }: RunPanelProps) {
	const rgb = tierRgb(2);

	return (
		<div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				{status === "active" && <LiveDot rgb={rgb} />}
				<span
					className="font-mono text-[11px] uppercase tracking-[0.16em]"
					style={{ color: `rgb(${rgb})` }}
				>
					{run.label} · {statusLabel}
				</span>
				<span className="font-mono text-[11px] text-muted-foreground">
					{run.window}
				</span>
			</div>

			<h3 className="text-xl md:text-2xl font-medium tracking-tight text-foreground mt-3">
				{run.title}
			</h3>
			<p className="text-muted-foreground mt-2 leading-relaxed">{run.goal}</p>
			<p className="text-muted-foreground mt-3 leading-relaxed">{run.blurb}</p>

			<h4 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-8">
				What it takes
			</h4>
			<div className="mt-3">
				<RunTargets targets={run.targets} />
			</div>

			<h4 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-8">
				What you get
			</h4>
			<ol className="mt-3 grid gap-px bg-border border border-border sm:grid-cols-3">
				{run.rewards.map((reward, index) => (
					<li key={reward.kind} className="bg-background p-5">
						<span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60">
							{String(index + 1).padStart(2, "0")}
						</span>
						<span
							className="block font-mono text-[11px] uppercase tracking-[0.14em] mt-1.5"
							style={{ color: `rgb(${rgb})` }}
						>
							{reward.title}
						</span>
						<p className="text-sm text-muted-foreground mt-2 leading-relaxed">
							{reward.detail}
						</p>
					</li>
				))}
			</ol>
		</div>
	);
}
