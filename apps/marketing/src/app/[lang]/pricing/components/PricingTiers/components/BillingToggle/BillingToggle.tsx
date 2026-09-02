"use client";

import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

interface BillingToggleProps {
	isYearly: boolean;
	onChange: (isYearly: boolean) => void;
}

export function BillingToggle({ isYearly, onChange }: BillingToggleProps) {
	return (
		<div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
			<ToggleButton active={!isYearly} onClick={() => onChange(false)}>
				<Trans>Monthly</Trans>
			</ToggleButton>
			<ToggleButton active={isYearly} onClick={() => onChange(true)}>
				<Trans>Yearly</Trans>
				<span
					className={cn(
						"ml-2 rounded-sm px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
						isYearly
							? "bg-background text-foreground"
							: "bg-accent/40 text-muted-foreground",
					)}
				>
					<Trans>Save 25%</Trans>
				</span>
			</ToggleButton>
		</div>
	);
}

function ToggleButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"inline-flex items-center rounded-sm px-4 py-1.5 text-sm font-medium transition-colors",
				active
					? "bg-foreground text-background"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}
