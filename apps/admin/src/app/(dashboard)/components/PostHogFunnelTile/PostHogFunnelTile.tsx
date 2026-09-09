"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
const STEP_NAME_OVERRIDES: Record<number, MessageDescriptor> = {
	4: msg({
		message: "Reached a dashboard page",
	}),
};

export function PostHogFunnelTile() {
	const { t } = useLingui();
	const insight = useInsightResults("activationFunnel");

	const steps = Array.isArray(insight.data?.result)
		? (insight.data.result as PostHogFunnelStep[])
		: [];
	const data = steps.map((step, index) => {
		const override = STEP_NAME_OVERRIDES[index];
		return {
			name: step.custom_name ?? (override ? i18n._(override) : step.name),
			count: step.count,
			medianSeconds: step.median_conversion_time ?? null,
			averageSeconds: step.average_conversion_time ?? null,
		};
	});

	return (
		<FunnelChart
			title={
				insight.data?.name ??
				t({
					message: "New-user activation",
				})
			}
			description={t({
				message:
					"First sign-in view → auth → onboarding → real workspace (last 7d, 2d window)",
			})}
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
							aria-label={t({
								message: "Open in PostHog",
							})}
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
						aria-label={t({ message: "Refresh" })}
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
