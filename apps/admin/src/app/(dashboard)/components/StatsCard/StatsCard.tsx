"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import { cn } from "@superset/ui/utils";
import { LuArrowDown, LuArrowUp, LuMinus } from "react-icons/lu";

interface StatsCardProps {
	title: string;
	value: number | string;
	description?: string;
	trend?: {
		value: number;
		label: string;
	};
	isLoading?: boolean;
}

export function StatsCard({
	title,
	value,
	description,
	trend,
	isLoading,
}: StatsCardProps) {
	const trendDirection =
		trend && trend.value > 0
			? "up"
			: trend && trend.value < 0
				? "down"
				: "neutral";

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2">
						<div className="bg-muted h-8 w-24 animate-pulse rounded" />
						<div className="bg-muted h-4 w-32 animate-pulse rounded" />
					</div>
				) : (
					<>
						<div className="text-3xl font-bold">{value}</div>
						{(trend || description) && (
							<div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
								{trend && (
									<span
										className={cn(
											"flex items-center gap-0.5 font-medium",
											trendDirection === "up" && "text-green-600",
											trendDirection === "down" && "text-red-600",
										)}
									>
										{trendDirection === "up" && (
											<LuArrowUp className="h-3 w-3" />
										)}
										{trendDirection === "down" && (
											<LuArrowDown className="h-3 w-3" />
										)}
										{trendDirection === "neutral" && (
											<LuMinus className="h-3 w-3" />
										)}
										{Math.abs(trend.value)}%
									</span>
								)}
								{trend && <span>{trend.label}</span>}
								{!trend && description && <span>{description}</span>}
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
