import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";

// Mirrors the factory tiers on the public board (marketing TierBadge). Names
// and colours are duplicated here because the desktop cannot import from the
// marketing app; keep the two lists in step.
const TIER_NAMES: readonly MessageDescriptor[] = [
	msg({
		message: "Button pusher",
	}),
	msg({
		message: "Operator",
	}),
	msg({
		message: "Plant Manager",
	}),
	msg({
		message: "Henry Ford",
	}),
];

const TIER_RGB = [
	"147,157,171",
	"91,157,251",
	"49,176,108",
	"219,135,34",
] as const;

export function TierBadge({
	tier,
	className,
}: {
	tier: number;
	className?: string;
}) {
	const name = TIER_NAMES[tier - 1];
	const rgb = TIER_RGB[tier - 1];
	if (!name || !rgb) return null;

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-sm border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] whitespace-nowrap not-italic",
				className,
			)}
			style={{ color: `rgb(${rgb})`, borderColor: `rgba(${rgb},0.4)` }}
		>
			{i18n._(name)}
		</span>
	);
}
