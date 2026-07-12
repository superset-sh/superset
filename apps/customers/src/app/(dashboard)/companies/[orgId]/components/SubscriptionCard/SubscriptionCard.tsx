"use client";

import type { RouterOutputs } from "@superset/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import { toast } from "@superset/ui/sonner";
import { format } from "date-fns";
import { LuCopy, LuTriangleAlert } from "react-icons/lu";

import { PlanBadge } from "../../../../components/PlanBadge";

type Subscription = RouterOutputs["customers"]["companyDetail"]["subscription"];

export interface SubscriptionCardProps {
	subscription: Subscription;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}

export function SubscriptionCard({ subscription }: SubscriptionCardProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Subscription</CardTitle>
					<PlanBadge
						plan={subscription?.plan}
						status={subscription?.status}
						isPaying={subscription?.isPaying ?? false}
					/>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				{!subscription ? (
					<p className="text-muted-foreground text-sm">
						No subscription on file — free account.
					</p>
				) : (
					<>
						<Row label="Status" value={subscription.status} />
						<Row label="Seats" value={subscription.seats ?? "—"} />
						<Row label="Interval" value={subscription.billingInterval ?? "—"} />
						<Row
							label="Period ends"
							value={
								subscription.periodEnd
									? format(subscription.periodEnd, "MMM d, yyyy")
									: "—"
							}
						/>
						{subscription.trialEnd && (
							<Row
								label="Trial ends"
								value={format(subscription.trialEnd, "MMM d, yyyy")}
							/>
						)}
						{subscription.cancelAtPeriodEnd && (
							<p className="text-amber-500 flex items-center gap-1.5 pt-1 text-sm">
								<LuTriangleAlert className="size-4" />
								Cancels at period end
							</p>
						)}
						{subscription.stripeCustomerId && (
							<button
								type="button"
								className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 pt-1 font-mono text-xs"
								onClick={() => {
									navigator.clipboard.writeText(
										subscription.stripeCustomerId ?? "",
									);
									toast.success("Stripe customer ID copied");
								}}
							>
								<LuCopy className="size-3" />
								{subscription.stripeCustomerId}
							</button>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
