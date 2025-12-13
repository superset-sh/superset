"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { cn } from "@superset/ui/utils";
import { LuArrowRight, LuLoaderCircle } from "react-icons/lu";

interface FunnelStep {
	name: string;
	count: number;
	conversionRate?: number;
}

interface ActivationFunnelProps {
	steps: FunnelStep[];
	isLoading?: boolean;
	error?: string;
}

export function ActivationFunnel({
	steps,
	isLoading,
	error,
}: ActivationFunnelProps) {
	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Activation Funnel</CardTitle>
					<CardDescription>
						Signup → Download → First Task → Completed
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-12">
					<LuLoaderCircle className="text-muted-foreground h-8 w-8 animate-spin" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Activation Funnel</CardTitle>
				</CardHeader>
				<CardContent className="text-muted-foreground py-12 text-center">
					<p>Failed to load funnel data</p>
					<p className="text-sm">{error}</p>
				</CardContent>
			</Card>
		);
	}

	const maxCount = Math.max(...steps.map((s) => s.count), 1);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Activation Funnel</CardTitle>
				<CardDescription>
					Track users through signup to first completed task
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-end justify-between gap-2">
					{steps.map((step, index) => (
						<div key={step.name} className="flex flex-1 items-center gap-2">
							<div className="flex flex-1 flex-col items-center">
								<div
									className="bg-primary/20 mb-2 w-full rounded-t-md transition-all"
									style={{
										height: `${Math.max((step.count / maxCount) * 120, 20)}px`,
									}}
								>
									<div
										className="bg-primary h-full w-full rounded-t-md"
										style={{
											opacity: 1 - index * 0.15,
										}}
									/>
								</div>
								<div className="text-center">
									<div className="text-2xl font-bold">
										{step.count.toLocaleString()}
									</div>
									<div className="text-muted-foreground text-xs">
										{step.name}
									</div>
									{step.conversionRate !== undefined && index > 0 && (
										<div
											className={cn(
												"mt-1 text-xs font-medium",
												step.conversionRate >= 50
													? "text-green-600"
													: step.conversionRate >= 25
														? "text-yellow-600"
														: "text-red-600",
											)}
										>
											{step.conversionRate.toFixed(0)}%
										</div>
									)}
								</div>
							</div>
							{index < steps.length - 1 && (
								<LuArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
							)}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
