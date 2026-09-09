"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

import {
	PAYWALL_FUNNEL_WEEKS,
	type PaywallStageKey,
	usePaywallFunnel,
} from "../../hooks/usePaywallFunnel";
import { FunnelChart } from "../FunnelChart";

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
	const query = usePaywallFunnel();
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

	// Named local, not the constant inline: the macro takes the identifier as
	// the message's placeholder name, and `{weeks}` is what a translator wants
	// to see.
	const weeks = PAYWALL_FUNNEL_WEEKS;
	const description = t({
		message: `People whose first paywall view was in the last ${weeks} weeks, and how far they got. A stage counts anyone who reached it after that view, so recent cohorts are still maturing.`,
	});
	const gapNote = t({
		message: `No ${gaps} events in this window yet.`,
	});

	return (
		<FunnelChart
			title={t({ message: "Paywall → paid" })}
			description={gaps ? `${description} ${gapNote}` : description}
			steps={steps}
			isLoading={query.isLoading}
			error={query.error}
		/>
	);
}
