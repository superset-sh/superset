import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { HiArrowRight } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { resolveCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import type { PlanTier } from "../../constants";
import { BillingDetails } from "./components/BillingDetails";
import { CurrentPlanCard } from "./components/CurrentPlanCard";
import { RecentInvoices } from "./components/RecentInvoices";
import { UpgradeCard } from "./components/UpgradeCard";

interface BillingOverviewProps {
	visibleItems?: SettingItemId[] | null;
}

export function BillingOverview({ visibleItems }: BillingOverviewProps) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const searchQuery = useSettingsSearchQuery();
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);

	const activeOrgId = session?.session?.activeOrganizationId;

	const { data: activeOrg } = authClient.useActiveOrganization();
	const currentUserId = session?.user?.id;
	const currentMember = activeOrg?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const isOwner = currentMember?.role === "owner";

	const { data: subscriptionsData, isReady: subscriptionsReady } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);
	const subscriptionData = subscriptionsData?.find(
		(s) => s.status === "active",
	);

	// Subscription rows win over the session (which can lag a checkout), but a
	// cold collection must not read as "free" — fall back to the session plan
	// until rows or readiness arrive.
	const plan: PlanTier = resolveCurrentPlan({
		subscriptionPlan: subscriptionData?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded:
			subscriptionsReady || (subscriptionsData?.length ?? 0) > 0,
	});

	const { data: membersData, isReady: membersReady } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.select(({ members }) => ({ id: members.id })),
		[collections],
	);
	// Seats are billed from this — never derive it from a cold collection.
	// undefined (not 0) keeps the upgrade action disabled until synced.
	const memberCount =
		membersReady && membersData && membersData.length > 0
			? membersData.length
			: undefined;

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
			toast.success("Plan restored");
		} finally {
			setIsRestoring(false);
		}
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Billing</h2>
					<p className="text-sm text-muted-foreground mt-1">
						For questions about billing,{" "}
						<a
							href="mailto:support@superset.sh"
							className="text-primary hover:underline"
						>
							contact us
						</a>
						.
					</p>
				</div>
				<Button variant="ghost" size="sm" asChild>
					<Link to="/settings/billing/plans">
						<HighlightText text="All plans" query={searchQuery} />
						<HiArrowRight className="h-3 w-3" />
					</Link>
				</Button>
			</div>

			<div className="space-y-6">
				{showOverview && (
					<div>
						<h3 className="text-sm font-medium mb-2">Plan</h3>
						<div className="divide-y divide-border">
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
						</div>
					</div>
				)}
				{showOverview && isOwner && plan !== "free" && <BillingDetails />}
				<RecentInvoices />
			</div>
		</div>
	);
}
