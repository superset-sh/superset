/**
 * Shared visual frame for docks. Bordered, amber-tinted row above the
 * composer with a label, optional subtitle, and children for actions.
 */

import type { ReactNode } from "react";

export interface DockFrameProps {
	tone?: "amber" | "blue" | "muted";
	label: string;
	subtitle?: string;
	children?: ReactNode;
}

export function DockFrame({
	tone = "amber",
	label,
	subtitle,
	children,
}: DockFrameProps) {
	const toneClass =
		tone === "amber"
			? "border-amber-300/50 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30"
			: tone === "blue"
				? "border-blue-300/50 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30"
				: "border-border bg-muted/30";
	return (
		<div
			className={`flex flex-col gap-2 rounded-md border px-3 py-2 text-sm ${toneClass}`}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-medium">{label}</span>
				{subtitle && (
					<span className="text-muted-foreground min-w-0 truncate text-xs">
						{subtitle}
					</span>
				)}
			</div>
			{children}
		</div>
	);
}
