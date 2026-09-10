"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { FunnelChart } from "../FunnelChart";

type PaywallStageKey =
	RouterOutputs["growth"]["paywallFunnel"]["stages"][number]["key"];

const PAYWALL_FUNNEL_WEEKS = 12;
const STALE_TIME_MS = 10 * 60 * 1000;

// Descriptors, translated at render: a module-scope `t` would freeze the
// English at import time and stay stale through a language change.
const STAGE_LABELS: Record<PaywallStageKey, MessageDescriptor> = {
	paywall_viewed: msg({ message: "Saw the paywall" }),
	upgrade_clicked: msg({ message: "Clicked upgrade" }),
	checkout_started: msg({ message: "Started checkout" }),
	paid: msg({ message: "Paid" }),
};

export function PaywallFunnelTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.growth.paywallFunnel.queryOptions(
			{ weeks: PAYWALL_FUNNEL_WEEKS },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const stages = query.data?.stages ?? [];

	const steps = stages.map((stage) => ({
		name: t(STAGE_LABELS[stage.key]),
		count: stage.people,
		medianSeconds: stage.medianSeconds,
		averageSeconds: stage.averageSeconds,
	}));

	// A stage with no events at all, while a later one has some, is an
	// instrumentation gap rather than a conversion cliff — say so, instead of
	// letting it read as "nobody got this far".
	const gaps = stages
		.filter(
			(stage, index) =>
				stage.people === 0 &&
				stages.slice(index + 1).some((later) => later.people > 0),
		)
		.map((stage) => stage.event)
		.join(", ");

	return (
		<FunnelChart
			title={t({ message: "Paywall → paid" })}
			description={
				<>
					<Trans>
						People whose first paywall view was in the last{" "}
						{PAYWALL_FUNNEL_WEEKS} weeks, and how far they got. A stage counts
						anyone who reached it after that view, so recent cohorts are still
						maturing.
					</Trans>
					{gaps ? (
						<>
							{" "}
							<Trans>No {gaps} events in this window yet.</Trans>
						</>
					) : null}
				</>
			}
			steps={steps}
			isLoading={query.isLoading}
			error={query.error}
		/>
	);
}
