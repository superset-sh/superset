import type { ProviderId, ProviderSnapshot } from "../../types";
import { formatRelativeAgo } from "../../utils/format";
import { CostStats } from "../CostStats";
import { DailyBarChart } from "../DailyBarChart";
import { RateLimitBar } from "../RateLimitBar";

interface ProviderCardProps {
	providerId: ProviderId;
	snapshot: ProviderSnapshot | undefined;
}

const PROVIDER_META: Record<ProviderId, { name: string; icon: string }> = {
	claude: { name: "Claude", icon: "✳" },
	codex: { name: "Codex", icon: "◇" },
	copilot: { name: "Copilot", icon: "⧉" },
	gemini: { name: "Gemini", icon: "✦" },
};

export function ProviderCard({ providerId, snapshot }: ProviderCardProps) {
	const meta = PROVIDER_META[providerId];
	const cost = snapshot?.cost ?? null;
	const credits = snapshot?.credits ?? null;
	const windows = snapshot?.windows ?? [];
	const errorMessage = snapshot?.errorMessage ?? null;

	const hasBody = !errorMessage && (windows.length > 0 || !!cost);

	return (
		<div className="rounded-lg border border-border p-4">
			<header className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-2">
					<span aria-hidden className="text-base leading-none">
						{meta.icon}
					</span>
					<div>
						<div className="font-semibold text-foreground">{meta.name}</div>
						{snapshot && (
							<div className="text-[10px] text-muted-foreground">
								Updated {formatRelativeAgo(snapshot.updatedAt)}
							</div>
						)}
					</div>
				</div>
				<div className="flex flex-col items-end text-[10px] text-muted-foreground">
					{snapshot?.email && <span>{snapshot.email}</span>}
					{snapshot?.planLabel && (
						<span className="uppercase tracking-wider">
							{snapshot.planLabel}
						</span>
					)}
				</div>
			</header>

			{errorMessage ? (
				<p className="mt-3 select-text cursor-text text-xs text-amber-500">
					{errorMessage}
				</p>
			) : hasBody ? (
				<div className="mt-4 space-y-4">
					{windows.length > 0 && (
						<div className="space-y-3">
							{windows.map((window) => (
								<RateLimitBar key={window.label} window={window} />
							))}
						</div>
					)}

					{credits && (
						<div className="space-y-1 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Credits</span>
								<span className="font-mono tabular-nums text-foreground">
									{credits.balance}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">
									Limit reset credits
								</span>
								<span className="font-mono tabular-nums text-foreground">
									{credits.resetCredits}
								</span>
							</div>
						</div>
					)}

					{cost && (
						<div className="space-y-3">
							<CostStats cost={cost} />
							<DailyBarChart buckets={cost.dailyBuckets} />
							<div className="space-y-0.5 text-[10px] text-muted-foreground">
								{cost.topModel && <div>Top model: {cost.topModel}</div>}
								{cost.estimatedFromLogs && (
									<div>Estimated from local logs at API rates.</div>
								)}
							</div>
						</div>
					)}
				</div>
			) : (
				<p className="mt-3 text-xs text-muted-foreground">no data yet</p>
			)}
		</div>
	);
}
