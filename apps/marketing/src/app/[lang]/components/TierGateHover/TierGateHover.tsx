"use client";

import type { AxisValues } from "@superset/trpc/leaderboard-tier";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import Link from "next/link";
import { TierBadge } from "@/app/[lang]/components/TierBadge";
import { TierGate } from "@/app/[lang]/components/TierGate";

interface TierGateHoverProps {
	tier: number;
	axes: AxisValues;
	handle: string;
}

export function TierGateHover({ tier, axes, handle }: TierGateHoverProps) {
	return (
		<HoverCard openDelay={120} closeDelay={80}>
			<HoverCardTrigger asChild>
				<Link
					href={`/${handle}`}
					className="inline-block cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
				>
					<TierBadge tier={tier} />
				</Link>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-72">
				<TierGate tier={tier} axes={axes} />
			</HoverCardContent>
		</HoverCard>
	);
}
