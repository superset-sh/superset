import { formatNumber } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
	type Ref,
} from "react";
import { DashboardSidebarGroupHeader } from "../DashboardSidebarGroupHeader";

interface DashboardSidebarCollectionHeaderProps
	extends Omit<
		ComponentPropsWithoutRef<typeof DashboardSidebarGroupHeader>,
		"label" | "indentation" | "color"
	> {
	color: string | null;
	projectCount: number;
	labelRef?: Ref<HTMLSpanElement>;
	children: ReactNode;
}

export const DashboardSidebarCollectionHeader = forwardRef<
	HTMLDivElement,
	DashboardSidebarCollectionHeaderProps
>(
	(
		{
			color,
			projectCount,
			labelRef,
			children,
			isCollapsed,
			className,
			...props
		},
		ref,
	) => (
		<DashboardSidebarGroupHeader
			ref={ref}
			indentation="top-level"
			isCollapsed={isCollapsed}
			className={cn(
				"-ml-1 pl-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			label={
				<span ref={labelRef} className="flex min-w-0 flex-1 items-center gap-2">
					<span
						className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
						style={color ? { backgroundColor: color } : undefined}
					/>
					{children}
					{isCollapsed && (
						<span className="ml-auto text-xs tabular-nums">
							{formatNumber(projectCount)}
						</span>
					)}
				</span>
			}
			{...props}
		/>
	),
);
