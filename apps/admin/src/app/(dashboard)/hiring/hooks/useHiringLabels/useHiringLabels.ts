import { useLingui } from "@lingui/react/macro";
import type {
	HiringEventKind,
	HiringOutcome,
	HiringScore,
	HiringSource,
	HiringStage,
} from "@superset/db/enums";
import { useMemo } from "react";

export function useHiringLabels() {
	const { t } = useLingui();
	return useMemo(
		() => ({
			stage: {
				sourced: t({ message: "Sourced" }),
				reached_out: t({ message: "Reached out" }),
				screen: t({ message: "Screening call" }),
				technical: t({ message: "Technical interview" }),
				system_design: t({ message: "System design" }),
				work_trial: t({ message: "Work trial" }),
				onsite: t({ message: "Onsite" }),
				offer: t({ message: "Offer" }),
			} satisfies Record<HiringStage, string>,
			outcome: {
				active: t({ message: "Active" }),
				hired: t({ message: "Hired" }),
				rejected: t({ message: "Rejected" }),
				withdrew: t({ message: "Withdrew" }),
				not_looking: t({ message: "Not looking" }),
			} satisfies Record<HiringOutcome, string>,
			source: {
				power_user: t({ message: "Power user" }),
				referral: t({ message: "Referral" }),
				waas: t({ message: "Work at a Startup" }),
				inbound: t({ message: "Inbound" }),
				outbound: t({ message: "Outbound" }),
			} satisfies Record<HiringSource, string>,
			score: {
				strong_hire: t({ message: "Strong hire" }),
				lean_hire: t({ message: "Lean hire" }),
				lean_no_hire: t({ message: "Lean no hire" }),
				strong_no_hire: t({ message: "Strong no hire" }),
			} satisfies Record<HiringScore, string>,
			eventKind: {
				note: t({ message: "Note" }),
				stage_change: t({ message: "Stage change" }),
				outcome_change: t({ message: "Outcome change" }),
				outreach: t({ message: "Outreach" }),
				reply: t({ message: "Reply" }),
				interview: t({ message: "Interview" }),
			} satisfies Record<HiringEventKind, string>,
		}),
		[t],
	);
}
