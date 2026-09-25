import { tierRgb } from "@/app/[lang]/components/TierBadge";
import type { RunTarget } from "../../constants";

export function RunTargets({ targets }: { targets: RunTarget[] }) {
	const rgb = tierRgb(2);

	return (
		<dl className="border border-border divide-y divide-border">
			{targets.map((target) => (
				<div
					key={target.axis}
					className="grid gap-x-5 gap-y-1 px-4 py-3 sm:grid-cols-[4.5rem_minmax(0,13rem)_1fr] sm:items-baseline"
				>
					<dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
						{target.axis}
					</dt>
					<dd
						className="text-sm font-medium tracking-tight"
						style={{ color: `rgb(${rgb})` }}
					>
						{target.value}
					</dd>
					<dd className="text-sm text-muted-foreground leading-relaxed">
						{target.note}
					</dd>
				</div>
			))}
		</dl>
	);
}
