"use client";

import {
	ADMIN_INSIGHTS,
	POSTHOG_PROJECT_URL,
} from "@superset/trpc/insight-registry";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { LuExternalLink, LuRefreshCw } from "react-icons/lu";

import { useInsightResults } from "../../hooks/useInsightResults";
import { FunnelChart } from "../FunnelChart";

interface PostHogFunnelStep {
	name: string;
	custom_name?: string | null;
	count: number;
	median_conversion_time?: number | null;
	average_conversion_time?: number | null;
}

// The OR-group step's API name is the mush of its member events
// ("$pageview, $pageview, …"); the saved definition's group name isn't
// echoed in results, so label it here by position.
const STEP_NAME_OVERRIDES: Record<number, string> = {
	4: "Reached a dashboard page",
};

export function PostHogFunnelTile() {
	const insight = useInsightResults("activationFunnel");

	const steps = Array.isArray(insight.data?.result)
		? (insight.data.result as PostHogFunnelStep[])
		: [];
	const data = steps.map((step, index) => ({
		name: step.custom_name ?? STEP_NAME_OVERRIDES[index] ?? step.name,
		count: step.count,
		medianSeconds: step.median_conversion_time ?? null,
		averageSeconds: step.average_conversion_time ?? null,
	}));

	return (
		<FunnelChart
			title={insight.data?.name ?? "New-user activation"}
			description="First sign-in view → auth → onboarding → real workspace (last 7d, 2d window)"
			steps={data}
			isLoading={insight.isLoading || insight.data?.result == null}
			error={insight.error}
			headerAction={
				<div className="flex items-center gap-1">
					<Button size="sm" variant="ghost" className="size-6 p-0" asChild>
						<a
							href={`${POSTHOG_PROJECT_URL}/insights/${ADMIN_INSIGHTS.activationFunnel}`}
							target="_blank"
							rel="noreferrer"
							aria-label="Open in PostHog"
						>
							<LuExternalLink className="size-3.5" />
						</a>
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="size-6 p-0"
						onClick={() => insight.refetch()}
						disabled={insight.isFetching}
						aria-label="Refresh"
					>
						<LuRefreshCw
							className={cn("size-3.5", insight.isFetching && "animate-spin")}
						/>
					</Button>
				</div>
			}
		/>
	);
}
