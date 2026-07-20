import type { ProviderId, ProviderSnapshot } from "../../types";
import { formatRelativeAgo } from "../../utils/format";
import { CostStats } from "../CostStats";
import { DailyBarChart } from "../DailyBarChart";
import { ProviderLogo } from "../ProviderLogo";
import { RateLimitBar } from "../RateLimitBar";

interface ProviderCardProps {
	providerId: ProviderId;
	snapshot: ProviderSnapshot | undefined;
}

const PROVIDER_NAME: Record<ProviderId, string> = {
	claude: "Claude",
	codex: "Codex",
	copilot: "Copilot",
	gemini: "Gemini",
};

function StatLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-bold tabular-nums text-foreground">{value}</span>
		</div>
	);
}

export function ProviderCard({ providerId, snapshot }: ProviderCardProps) {
	const cost = snapshot?.cost ?? null;
	const credits = snapshot?.credits ?? null;
	const windows = snapshot?.windows ?? [];
	const errorMessage = snapshot?.errorMessage ?? null;
	const hasBody = !errorMessage && (windows.length > 0 || !!cost);

	return (
		<div className="rounded-xl border border-border bg-card/30 px-5 py-4">
			<header className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<ProviderLogo id={providerId} className="size-[18px]" />
						<span className="text-[15px] font-bold tracking-tight text-foreground">
							{PROVIDER_NAME[providerId]}
						</span>
					</div>
					<div className="mt-1 text-[11px] text-muted-foreground">
						{snapshot
							? `Updated ${formatRelativeAgo(snapshot.updatedAt)}`
							: "No data yet"}
					</div>
				</div>
				<div className="flex flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
					{snapshot?.email && (
						<span className="truncate">{snapshot.email}</span>
					)}
					{snapshot?.planLabel && (
						<span className="uppercase tracking-widest text-foreground/70">
							{snapshot.planLabel}
						</span>
					)}
				</div>
			</header>

			{errorMessage ? (
				<p className="mt-4 select-text cursor-text text-xs leading-relaxed text-amber-500">
					{errorMessage}
				</p>
			) : hasBody ? (
				<div className="mt-5 space-y-5">
					{windows.length > 0 && (
						<div className="space-y-4">
							{windows.map((window) => (
								<RateLimitBar key={window.label} window={window} />
							))}
						</div>
					)}

					{credits && (
						<div className="space-y-2 border-t border-border/60 pt-4">
							<StatLine
								label="Credits"
								value={`${credits.balance.toLocaleString()} credits`}
							/>
							<StatLine
								label="Limit reset credits"
								value={`${credits.resetCredits} available`}
							/>
						</div>
					)}

					{cost && (
						<div className="space-y-4 border-t border-border/60 pt-4">
							<CostStats cost={cost} />
							<DailyBarChart buckets={cost.dailyBuckets} />
							<div className="space-y-0.5 text-[11px] text-muted-foreground">
								{cost.topModel && <div>Top model: {cost.topModel}</div>}
								{cost.estimatedFromLogs && (
									<div>Estimated from local logs at API rates.</div>
								)}
							</div>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
