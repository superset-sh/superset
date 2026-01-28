import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { HiArrowRight } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import type { PlanTier } from "../../constants";
import { CurrentPlanCard } from "./components/CurrentPlanCard";
import { UpgradeCard } from "./components/UpgradeCard";

interface BillingOverviewProps {
	visibleItems?: SettingItemId[] | null;
}

export function BillingOverview({ visibleItems }: BillingOverviewProps) {
	const { data: session, isPending } = authClient.useSession();
	const collections = useCollections();
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);

	const activeOrgId = session?.session?.activeOrganizationId;

	// Get subscription details - this is the source of truth for plan status
	const {
		data: subscriptionData,
		refetch: refetchSubscription,
		isPending: isSubscriptionPending,
	} = useQuery({
		queryKey: ["subscription", activeOrgId],
		queryFn: async () => {
			if (!activeOrgId) return null;
			const result = await authClient.subscription.list({
				query: { referenceId: activeOrgId },
			});
			return result.data?.find((s) => s.status === "active");
		},
		enabled: !!activeOrgId,
	});

	// Derive plan from subscription data (not session, which can be stale)
	const plan: PlanTier = (subscriptionData?.plan as PlanTier) ?? "free";

	// Get member count from Electric
	const { data: membersData, isLoading: isMembersLoading } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.select(({ members }) => ({ id: members.id })),
		[collections],
	);
	const memberCount = membersData ? membersData.length : undefined;

	const showOverview = isItemVisible(
		SETTING_ITEM_ID.BILLING_OVERVIEW,
		visibleItems,
	);

	const handleUpgrade = async (annual = false) => {
		if (!activeOrgId || memberCount === undefined) return;

		setIsUpgrading(true);
		try {
			await authClient.subscription.upgrade(
				{
					plan: "pro",
					referenceId: activeOrgId,
					annual,
					seats: memberCount,
					successUrl: `${env.NEXT_PUBLIC_WEB_URL}/settings/billing?success=true`,
					cancelUrl: env.NEXT_PUBLIC_WEB_URL,
					disableRedirect: true,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) {
							window.open(ctx.data.url, "_blank");
						}
					},
				},
			);
		} finally {
			setIsUpgrading(false);
		}
	};

	const handleCancel = async () => {
		if (!activeOrgId) return;

		setIsCanceling(true);
		try {
			await authClient.subscription.cancel(
				{
					referenceId: activeOrgId,
					returnUrl: env.NEXT_PUBLIC_WEB_URL,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) {
							window.open(ctx.data.url, "_blank");
						}
					},
				},
			);
			await refetchSubscription();
		} finally {
			setIsCanceling(false);
		}
	};

	const handleRestore = async () => {
		if (!activeOrgId) return;

		setIsRestoring(true);
		try {
			await authClient.subscription.restore({
				referenceId: activeOrgId,
			});
			await refetchSubscription();
			toast.success("Plan restored");
		} finally {
			setIsRestoring(false);
		}
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold">Billing</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							For questions about billing,{" "}
							<a
								href="mailto:founders@superset.sh"
								className="text-primary hover:underline"
							>
								contact us
							</a>
						</p>
					</div>
					<Button variant="ghost" size="sm" asChild>
						<Link to="/settings/billing/plans">
							All plans
							<HiArrowRight className="h-3 w-3" />
						</Link>
					</Button>
				</div>
			</div>

			<div className="space-y-3">
				{showOverview &&
					(isPending || isSubscriptionPending || isMembersLoading ? (
						<Skeleton className="h-20 w-full rounded-lg" />
					) : (
						<>
							<CurrentPlanCard
								currentPlan={plan}
								onCancel={handleCancel}
								isCanceling={isCanceling}
								onRestore={handleRestore}
								isRestoring={isRestoring}
								cancelAt={subscriptionData?.cancelAt}
								periodEnd={subscriptionData?.periodEnd}
							/>
							{plan === "free" && (
								<UpgradeCard
									onUpgrade={() => handleUpgrade(false)}
									isUpgrading={isUpgrading || memberCount === undefined}
								/>
							)}
						</>
					))}
			</div>
		</div>
	);
}
