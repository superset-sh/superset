import { Check, Loader, Minus, X } from "lucide-react-native";
import type { EffectiveCheck } from "../../../../utils/pullRequest";

export type CheckOutcome = "failed" | "running" | "passed" | "skipped";

export const CHECK_OUTCOME: Record<EffectiveCheck, CheckOutcome> = {
	failed: "failed",
	"needs-action": "failed",
	running: "running",
	passed: "passed",
	ignored: "skipped",
};

export const CHECK_STYLE: Record<
	CheckOutcome,
	{ icon: typeof Check; surface: string; ink: string }
> = {
	failed: { icon: X, surface: "bg-red-500/15", ink: "text-red-500" },
	running: { icon: Loader, surface: "bg-amber-500/15", ink: "text-amber-500" },
	passed: { icon: Check, surface: "bg-green-500/15", ink: "text-green-500" },
	skipped: {
		icon: Minus,
		surface: "bg-secondary",
		ink: "text-muted-foreground",
	},
};
