import { Trans } from "@lingui/react/macro";
import type { HostVersionState } from "@superset/shared/host-version";
import { cn } from "@superset/ui/utils";

interface HostVersionBadgeProps {
	state: HostVersionState;
	/** Shown instead of the version state while the host is unreachable. */
	offline?: boolean;
	className?: string;
}

const TONE: Record<HostVersionState, string> = {
	current:
		"bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
	behind:
		"bg-amber-500/10 text-amber-700 ring-amber-500/35 dark:text-amber-300",
	incompatible: "bg-destructive/10 text-destructive ring-destructive/35",
	ahead: "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300",
	unknown: "bg-muted/40 text-muted-foreground ring-border",
};

const DOT: Record<HostVersionState, string> = {
	current: "bg-emerald-500",
	behind: "bg-amber-500",
	incompatible: "bg-destructive",
	ahead: "bg-sky-500",
	unknown: "bg-muted-foreground/50",
};

/** Colour a status dot the same way the badge is coloured. */
export function hostVersionDotClass(
	state: HostVersionState,
	online: boolean,
): string {
	if (!online) return "bg-muted-foreground/40";
	if (state === "incompatible") return DOT.incompatible;
	if (state === "behind") return DOT.behind;
	return DOT.current;
}

export function HostVersionBadge({
	state,
	offline = false,
	className,
}: HostVersionBadgeProps) {
	const tone = offline ? TONE.unknown : TONE[state];
	const dot = offline ? DOT.unknown : DOT[state];
	return (
		<span
			className={cn(
				"inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-medium ring-1 ring-inset",
				tone,
				className,
			)}
		>
			<span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
			{offline ? (
				<Trans>Offline</Trans>
			) : state === "current" ? (
				<Trans>Up to date</Trans>
			) : state === "behind" ? (
				<Trans>Update available</Trans>
			) : state === "incompatible" ? (
				<Trans>Needs update</Trans>
			) : state === "ahead" ? (
				<Trans>Newer than this app</Trans>
			) : (
				<Trans>Version unknown</Trans>
			)}
		</span>
	);
}
