import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { type ReactNode, useState } from "react";
import { LuRadioTower } from "react-icons/lu";

const MAX_BADGE_COUNT = 9;

interface DashboardSidebarCloudPortsButtonProps {
	count: number;
	card: ReactNode;
	onOpenChange?: (open: boolean) => void;
}

export function DashboardSidebarCloudPortsButton({
	count,
	card,
	onOpenChange,
}: DashboardSidebarCloudPortsButtonProps) {
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const setOpen = (open: boolean) => {
		setIsOpen(open);
		onOpenChange?.(open);
	};
	return (
		<HoverCard
			open={isOpen}
			onOpenChange={setOpen}
			openDelay={150}
			closeDelay={120}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					onClick={() => setOpen(!isOpen)}
					aria-expanded={isOpen}
					aria-label={t({
						message: plural(count, {
							one: "# active port — show details",
							other: "# active ports — show details",
						}),
					})}
					className="relative mr-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<LuRadioTower className="size-3.5" strokeWidth={1.75} />
					<span
						className="absolute -top-0.5 -right-[3px] size-[11px] rounded-full text-center leading-[11px] bg-muted-foreground font-bold tracking-[-0.02em] text-background tabular-nums ring-[1.5px] ring-sidebar dark:ring-[color-mix(in_oklab,var(--muted)_35%,var(--background))]"
						style={{ fontSize: count > MAX_BADGE_COUNT ? 6 : 7.5 }}
					>
						{count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count}
					</span>
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-64 p-0"
				onClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => event.stopPropagation()}
			>
				{card}
			</HoverCardContent>
		</HoverCard>
	);
}
