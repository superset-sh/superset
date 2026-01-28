import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Fragment, useState } from "react";
import { HiArrowLeft, HiArrowUpRight, HiCheck } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PlanTier } from "../constants";

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

type PlanCardAction =
	| "current"
	| "upgrade"
	| "downgrade"
	| "restore"
	| "contact";

type PlanCardData = {
	id: "free" | "pro" | "enterprise";
	name: string;
	price: { monthly: string; yearly: string } | string;
	priceNote?: { monthly: string; yearly: string } | string;
	billingText: { monthly: string; yearly: string } | string;
	showBillingToggle?: boolean;
	actions: Array<{
		label: string;
		action: PlanCardAction;
		variant: "default" | "secondary" | "outline";
		size?: "default" | "sm";
		fullWidth?: boolean;
		align?: "center" | "start";
	}>;
};

type ComparisonValue = string | boolean | null;

type ComparisonRow = {
	label: string;
	values: ComparisonValue[];
};

type ComparisonSection = {
	title: string;
	rows: ComparisonRow[];
};

const PLAN_CARDS: PlanCardData[] = [
	{
		id: "free",
		name: "Free",
		price: "$0",
		priceNote: "per user/month",
		billingText: "Free for everyone",
		actions: [
			{
				label: "Current plan",
				action: "current",
				variant: "secondary",
			},
		],
	},
	{
		id: "pro",
		name: "Pro",
		price: { monthly: "$20", yearly: "$180" },
		priceNote: { monthly: "per user/month", yearly: "per user/year" },
		billingText: { monthly: "Billed monthly", yearly: "Billed yearly" },
		showBillingToggle: true,
		actions: [
			{
				label: "Upgrade",
				action: "upgrade",
				variant: "default",
			},
		],
	},
	{
		id: "enterprise",
		name: "Enterprise",
		price: "Custom pricing",
		billingText: "Billed yearly",
		actions: [
			{
				label: "Request a trial",
				action: "contact",
				variant: "outline",
			},
		],
	},
];

const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		title: "Usage",
		rows: [
			{
				label: "Team members",
				values: ["1", "Unlimited", "Unlimited"],
			},
			{
				label: "Workspaces",
				values: ["Unlimited", "Unlimited", "Unlimited"],
			},
			{
				label: "Projects",
				values: ["Unlimited", "Unlimited", "Unlimited"],
			},
		],
	},
	{
		title: "Features",
		rows: [
			{
				label: "Desktop app",
				values: [true, true, true],
			},
			{
				label: "Local workspaces",
				values: [true, true, true],
			},
			{
				label: "GitHub integration",
				values: [true, true, true],
			},
			{
				label: "Cloud workspaces",
				values: [null, true, true],
			},
			{
				label: "Mobile app",
				values: [null, true, true],
			},
			{
				label: "Linear integration",
				values: [null, true, true],
			},
			{
				label: "Team collaboration",
				values: [null, true, true],
			},
		],
	},
	{
		title: "Support",
		rows: [
			{
				label: "Priority support",
				values: [null, true, true],
			},
			{
				label: "Uptime SLA",
				values: [null, null, true],
			},
			{
				label: "Custom contracts",
				values: [null, null, true],
			},
		],
	},
	{
		title: "Security",
		rows: [
			{
				label: "SSO/SAML",
				values: [null, null, true],
			},
			{
				label: "IP restrictions",
				values: [null, null, true],
			},
			{
				label: "SCIM provisioning",
				values: [null, null, true],
			},
			{
				label: "Audit log",
				values: [null, null, true],
			},
		],
	},
];

function PlansPage() {
	const [isYearly, setIsYearly] = useState(true);
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const { data: session } = authClient.useSession();
	const collections = useCollections();

	const activeOrgId = session?.session?.activeOrganizationId;

	const { data: subscriptionData, refetch: refetchSubscription } = useQuery({
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

	const currentPlan: PlanTier = (subscriptionData?.plan as PlanTier) ?? "free";
	const cancelAt = subscriptionData?.cancelAt;

	const { data: membersData } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.select(({ members }) => ({ id: members.id })),
		[collections],
	);
	const memberCount = membersData?.length ?? 1;

	const currentPlanLabelByTier: Record<PlanTier, string> = {
		free: "Free",
		pro: "Pro",
		enterprise: "Enterprise",
	};
	const currentPlanLabel = currentPlanLabelByTier[currentPlan];

	const getValue = <T,>(value: T | { monthly: T; yearly: T }): T => {
		if (typeof value === "object" && value !== null && "monthly" in value) {
			return isYearly ? value.yearly : value.monthly;
		}
		return value as T;
	};

	const handlePlanAction = async (action: PlanCardAction) => {
		if (action === "current") {
			return;
		}

		if (action === "contact") {
			window.open("mailto:founders@superset.sh", "_blank");
			return;
		}

		if (!activeOrgId) return;

		if (action === "downgrade") {
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
			return;
		}

		if (action === "restore") {
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
			return;
		}

		setIsUpgrading(true);
		try {
			await authClient.subscription.upgrade(
				{
					plan: "pro",
					referenceId: activeOrgId,
					annual: isYearly,
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

	const renderComparisonValue = (value: ComparisonValue) => {
		if (value === null || value === false) {
			return <span className="sr-only">Not included</span>;
		}

		if (value === true) {
			return <HiCheck className="h-3.5 w-3.5 text-muted-foreground" />;
		}

		return (
			<>
				<HiCheck className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="text-sm">{value}</span>
			</>
		);
	};

	const highlightColumnIndex = 1;
	const highlightColumnStart = highlightColumnIndex + 2;
	const gridColumnsClass = "grid grid-cols-[180px_repeat(3,_1fr)]";

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-6 space-y-4">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/settings/billing">
						<HiArrowLeft className="h-4 w-4" />
						Billing
					</Link>
				</Button>
				<div>
					<h2 className="text-xl font-semibold">Plans</h2>
					<p className="text-sm text-muted-foreground mt-1">
						You are on the{" "}
						<span className="text-foreground font-medium">
							{currentPlanLabel} plan
						</span>
						. If you have any questions or would like further support with your
						plan,{" "}
						<a
							href="mailto:founders@superset.sh"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							contact us
							<HiArrowUpRight className="h-3 w-3" />
						</a>
						.
					</p>
				</div>
			</div>

			<div className="overflow-x-auto">
				<div className="relative min-w-[720px]">
					<div
						className={cn(
							gridColumnsClass,
							"pointer-events-none absolute inset-0",
						)}
					>
						<div
							className="bg-accent/30 border border-border/60 rounded-lg"
							style={{
								gridColumn: `${highlightColumnStart} / ${highlightColumnStart + 1}`,
								gridRow: "span 3",
							}}
						/>
					</div>
					<div className={cn(gridColumnsClass, "relative z-10 items-start")}>
						{(["plan", "billing", "cta"] as const).map((rowKey, rowIndex) => (
							<Fragment key={rowKey}>
								<div
									className={cn("px-2", rowKey === "cta" ? "py-3" : "py-2.5")}
								/>
								{PLAN_CARDS.map((plan) => {
									const isCurrent = currentPlanLabel === plan.name;
									const isDowngrade =
										plan.id === "free" && currentPlan !== "free";

									let planActions: typeof plan.actions;
									if (isCurrent && cancelAt) {
										planActions = [
											{
												label: isRestoring ? "Restoring..." : "Restore plan",
												action: "restore" as const,
												variant: "default" as const,
											},
										];
									} else if (isCurrent) {
										planActions = [
											{
												label: "Current plan",
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isDowngrade && cancelAt) {
										planActions = [
											{
												label: `Starts ${cancelAt ? format(new Date(cancelAt), "MMMM d, yyyy") : ""}`,
												action: "current" as const,
												variant: "outline" as const,
											},
										];
									} else if (isDowngrade) {
										planActions = [
											{
												label: isCanceling
													? "Downgrading..."
													: "Downgrade to Free",
												action: "downgrade" as const,
												variant: "outline" as const,
											},
										];
									} else {
										planActions = plan.actions;
									}

									if (rowKey === "plan") {
										return (
											<div key={plan.id} className="px-4 py-2.5">
												<div className="space-y-0.5">
													<div className="text-base font-medium">
														{plan.name}
													</div>
													<div
														className={cn(
															plan.priceNote
																? "text-xl font-semibold leading-tight"
																: "text-base font-medium text-muted-foreground",
														)}
													>
														{getValue(plan.price)}
													</div>
													{plan.priceNote && (
														<div className="text-xs text-muted-foreground">
															{getValue(plan.priceNote)}
														</div>
													)}
												</div>
											</div>
										);
									}

									if (rowKey === "billing") {
										return (
											<div
												key={plan.id}
												className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground"
											>
												{plan.showBillingToggle && (
													<Switch
														checked={isYearly}
														onCheckedChange={setIsYearly}
														aria-label="Billed yearly"
													/>
												)}
												<span>{getValue(plan.billingText)}</span>
											</div>
										);
									}

									return (
										<div key={plan.id} className="px-4 py-3">
											<div className="flex flex-col gap-2">
												{planActions.map((action) => (
													<Button
														key={action.label}
														variant={action.variant}
														size={action.size ?? "sm"}
														className={cn(
															action.fullWidth === false ? "w-fit" : "w-full",
															action.align === "center" && "self-center",
															action.align === "start" && "self-start",
														)}
														disabled={
															action.action === "current" ||
															(action.action === "upgrade" && isUpgrading)
														}
														onClick={() => handlePlanAction(action.action)}
													>
														{action.label}
													</Button>
												))}
											</div>
										</div>
									);
								})}

								{rowIndex < 2 && (
									<>
										<div />
										<div className="col-span-3 h-px bg-border/60" />
									</>
								)}
							</Fragment>
						))}

						{COMPARISON_SECTIONS.map((section, sectionIndex) => (
							<Fragment key={section.title}>
								<div className="col-span-4 pt-6 pb-3 px-2">
									<span className="text-sm font-semibold">{section.title}</span>
								</div>
								<div className="col-span-4 h-px bg-border/60" />

								{section.rows.map((row, rowIndex) => {
									const isLastRow =
										sectionIndex === COMPARISON_SECTIONS.length - 1 &&
										rowIndex === section.rows.length - 1;

									return (
										<Fragment key={row.label}>
											<div className="flex items-center px-2 py-2.5 text-xs text-muted-foreground">
												{row.label}
											</div>
											{row.values.map((value, valueIndex) => (
												<div
													key={`${row.label}-${valueIndex}`}
													className="flex items-center justify-start gap-2 px-4 py-2.5"
												>
													{renderComparisonValue(value)}
												</div>
											))}
											{!isLastRow && (
												<div className="col-span-4 h-px bg-border/60" />
											)}
										</Fragment>
									);
								})}
							</Fragment>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
