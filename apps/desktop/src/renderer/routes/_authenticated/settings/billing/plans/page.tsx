import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { differenceInDays, format } from "date-fns";
import { Fragment, useState } from "react";
import { HiArrowLeft, HiArrowUpRight, HiCheck } from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { env } from "renderer/env.renderer";
import { resolveCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
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

type PlanCardText =
	| { monthly: MessageDescriptor; yearly: MessageDescriptor }
	| MessageDescriptor;

type PlanCardActionButton = {
	action: PlanCardAction;
	variant: "default" | "secondary" | "outline";
	size?: "default" | "sm";
	fullWidth?: boolean;
	align?: "center" | "start";
};

type PlanCardData = {
	id: "free" | "pro" | "enterprise";
	name: MessageDescriptor;
	price: PlanCardText;
	priceNote?: PlanCardText;
	billingText: PlanCardText;
	showBillingToggle?: boolean;
	actions: Array<PlanCardActionButton & { label: MessageDescriptor }>;
};

type ComparisonValue = MessageDescriptor | boolean | null;

type ComparisonRow = {
	label: MessageDescriptor;
	values: ComparisonValue[];
	badge?: { label: MessageDescriptor; variant: "default" | "secondary" };
};

type ComparisonSection = {
	title: MessageDescriptor;
	rows: ComparisonRow[];
};

const PLAN_CARDS: PlanCardData[] = [
	{
		id: "free",
		name: msg({ message: "Free" }),
		price: msg({ message: "$0" }),
		priceNote: msg({
			message: "per user/month",
		}),
		billingText: msg({
			message: "Free for everyone",
		}),
		actions: [
			{
				label: msg({
					message: "Current plan",
				}),
				action: "current",
				variant: "secondary",
			},
		],
	},
	{
		id: "pro",
		name: msg({ message: "Pro" }),
		price: {
			monthly: msg({
				message: "$20",
			}),
			yearly: msg({
				message: "$15",
			}),
		},
		priceNote: msg({
			message: "per user/month",
		}),
		billingText: {
			monthly: msg({
				message: "Billed monthly",
			}),
			yearly: msg({
				message: "Billed yearly",
			}),
		},
		showBillingToggle: true,
		actions: [
			{
				label: msg({
					message: "Upgrade",
				}),
				action: "upgrade",
				variant: "default",
			},
		],
	},
	{
		id: "enterprise",
		name: msg({
			message: "Enterprise",
		}),
		price: msg({
			message: "Custom pricing",
		}),
		billingText: msg({
			message: "Billed yearly",
		}),
		actions: [
			{
				label: msg({
					message: "Request a trial",
				}),
				action: "contact",
				variant: "outline",
			},
		],
	},
];

const VALUE_ONE = msg({
	message: "1",
});
const VALUE_UNLIMITED = msg({
	message: "Unlimited",
});

const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		title: msg({ message: "Usage" }),
		rows: [
			{
				label: msg({
					message: "Team members",
				}),
				values: [VALUE_ONE, VALUE_UNLIMITED, VALUE_UNLIMITED],
			},
			{
				label: msg({
					message: "Workspaces",
				}),
				values: [VALUE_UNLIMITED, VALUE_UNLIMITED, VALUE_UNLIMITED],
			},
			{
				label: msg({
					message: "Projects",
				}),
				values: [VALUE_UNLIMITED, VALUE_UNLIMITED, VALUE_UNLIMITED],
			},
		],
	},
	{
		title: msg({
			message: "Features",
		}),
		rows: [
			{
				label: msg({
					message: "Desktop app",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "Local workspaces",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "Remote access",
				}),
				values: [null, true, true],
				badge: {
					label: msg({
						message: "Beta",
					}),
					variant: "default",
				},
			},
			{
				label: msg({
					message: "Automations",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "Mobile app",
				}),
				values: [null, true, true],
				badge: {
					label: msg({
						message: "Coming soon",
					}),
					variant: "secondary",
				},
			},
			{
				label: msg({
					message: "GitHub integration",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "Linear integration",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Slack integration",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Team collaboration",
				}),
				values: [null, true, true],
			},
		],
	},
	{
		title: msg({
			message: "Support",
		}),
		rows: [
			{
				label: msg({
					message: "Priority support",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Uptime SLA",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "Custom contracts",
				}),
				values: [null, null, true],
			},
		],
	},
	{
		title: msg({
			message: "Security",
		}),
		rows: [
			{
				label: msg({
					message: "SSO/SAML",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "IP restrictions",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "SCIM provisioning",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "Audit log",
				}),
				values: [null, null, true],
			},
		],
	},
];

/**
 * Whether the subscription bills yearly, or null when there is nothing to read
 * it from — no subscription yet, or a row predating `billingInterval`, where
 * the period length is the only signal.
 */
function resolveSubscriptionIsYearly(activePlan: {
	billingInterval?: string | null;
	periodStart?: Date | null;
	periodEnd?: Date | null;
}): boolean | null {
	const interval = activePlan.billingInterval;
	if (interval === "year" || interval === "yearly") return true;
	if (interval === "month" || interval === "monthly") return false;

	if (activePlan.periodStart && activePlan.periodEnd) {
		return (
			differenceInDays(
				new Date(activePlan.periodEnd),
				new Date(activePlan.periodStart),
			) > 60
		);
	}

	return null;
}

function PlansPage() {
	// Seeded from the subscription, not hardcoded: showing Annual to a monthly
	// subscriber turned the Pro column's "Current plan" into a live
	// "Change to Annual" that bills a year up front. A manual toggle wins from
	// then on, and Annual stays the default for free and enterprise, which have
	// no interval to read.
	const { t } = useLingui();
	const [manualIsYearly, setManualIsYearly] = useState<boolean | null>(null);
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const { data: session } = authClient.useSession();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const utils = cloudTrpc.useUtils();

	// Per-window org: the shared session holds one org for the whole app, so
	// a second window on another org would render the first window's org here.
	const activeOrgId = useActiveOrganizationId();

	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);

	// An unresolved query must not read as "free": that renders a live Upgrade
	// action for an org that may already be paying. Session plan fills in
	// until it arrives.
	const planResolved = activePlan !== undefined;
	const currentPlan: PlanTier = resolveCurrentPlan({
		subscriptionPlan: activePlan?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded: planResolved,
	});
	const cancelAt = activePlan?.cancelAt;

	const subscriptionIsYearly = activePlan
		? resolveSubscriptionIsYearly(activePlan)
		: null;
	const isYearly = manualIsYearly ?? subscriptionIsYearly ?? true;
	const setIsYearly = setManualIsYearly;

	// Explicit, not defaulted: this list is what checkout bills, and it must be
	// the same definition of a seat the subscription hooks use.
	const { data: membersData } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	// Seats are billed from this — never derive it from an unresolved query.
	const memberCount =
		membersData && membersData.length > 0 ? membersData.length : undefined;

	const currentPlanLabelByTier: Record<PlanTier, string> = {
		free: t({ message: "Free" }),
		pro: t({ message: "Pro" }),
		enterprise: t({
			message: "Enterprise",
		}),
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
			track("enterprise_trial_requested", { source: "billing_plans" });
			openUrl.mutate("mailto:support@superset.sh");
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
			} finally {
				setIsCanceling(false);
				await utils.billing.activePlan.invalidate();
			}
			return;
		}

		if (action === "restore") {
			setIsRestoring(true);
			try {
				await authClient.subscription.restore({
					referenceId: activeOrgId,
				});
				toast.success(
					t({
						message: "Plan restored",
					}),
				);
			} finally {
				setIsRestoring(false);
				await utils.billing.activePlan.invalidate();
			}
			return;
		}

		if (memberCount === undefined) return;

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
					returnUrl: env.NEXT_PUBLIC_WEB_URL,
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
			await utils.billing.activePlan.invalidate();
		}
	};

	const renderComparisonValue = (value: ComparisonValue) => {
		if (value === null || value === false) {
			return (
				<span className="sr-only">
					<Trans>Not included</Trans>
				</span>
			);
		}

		if (value === true) {
			return <HiCheck className="h-3.5 w-3.5 text-muted-foreground" />;
		}

		return (
			<>
				<HiCheck className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="text-sm">{i18n._(value)}</span>
			</>
		);
	};

	const highlightColumnIndex = 1;
	const highlightColumnStart = highlightColumnIndex + 2;
	const gridColumnsClass = "grid grid-cols-[240px_repeat(3,_1fr)]";

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-6 space-y-4">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/settings/billing">
						<HiArrowLeft className="h-4 w-4" />
						<Trans>Billing</Trans>
					</Link>
				</Button>
				<div>
					<h2 className="text-xl font-semibold">
						<Trans>Plans</Trans>
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>
							You are on the{" "}
							<span className="text-foreground font-medium">
								{currentPlanLabel} plan
							</span>
							. If you have any questions or would like further support with
							your plan,{" "}
							<button
								type="button"
								onClick={() => {
									track("billing_support_contacted", {
										source: "billing_plans_inline",
									});
									openUrl.mutate("mailto:support@superset.sh");
								}}
								className="inline-flex items-center gap-1 text-primary hover:underline"
							>
								contact us
								<HiArrowUpRight className="h-3 w-3" />
							</button>
							.
						</Trans>
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
									const isCurrent = currentPlan === plan.id;
									const isDowngrade =
										plan.id === "free" && currentPlan !== "free";
									const isOnEnterprise = currentPlan === "enterprise";

									let planActions: Array<
										PlanCardActionButton & { label: string }
									>;
									if (isOnEnterprise) {
										planActions = [
											{
												label: isCurrent
													? t({
															message: "Current plan",
														})
													: t({
															message: "Included in Enterprise",
														}),
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isCurrent && cancelAt) {
										planActions = [
											{
												label: isRestoring
													? t({
															message: "Restoring...",
														})
													: t({
															message: "Restore plan",
														}),
												action: "restore" as const,
												variant: "default" as const,
											},
										];
									} else if (isCurrent && plan.id === "pro") {
										// Before the plan resolves the billing interval is unknown,
										// so an interval-change action here would be a guess the
										// user can act on. Hold at "Current plan" until it lands — and
										// equally when the row carries no readable interval.
										const intervalMatches =
											subscriptionIsYearly === null || isYearly === subscriptionIsYearly;
										if (!planResolved || intervalMatches) {
											planActions = [
												{
													label: t({
														message: "Current plan",
													}),
													action: "current" as const,
													variant: "secondary" as const,
												},
											];
										} else {
											planActions = [
												{
													label: isUpgrading
														? t({
																message: "Changing...",
															})
														: isYearly
															? t({
																	message: "Change to Annual",
																})
															: t({
																	message: "Change to Monthly",
																}),
													action: "upgrade" as const,
													variant: "default" as const,
												},
											];
										}
									} else if (isCurrent) {
										planActions = [
											{
												label: t({
													message: "Current plan",
												}),
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isDowngrade && cancelAt) {
										planActions = [
											{
												label: t({
													message: `Starts ${cancelAt ? format(new Date(cancelAt), "MMMM d, yyyy") : ""}`,
												}),
												action: "current" as const,
												variant: "outline" as const,
											},
										];
									} else if (isDowngrade) {
										planActions = [
											{
												label: isCanceling
													? t({
															message: "Downgrading...",
														})
													: t({
															message: "Downgrade to Free",
														}),
												action: "downgrade" as const,
												variant: "outline" as const,
											},
										];
									} else {
										planActions = plan.actions.map((action) => ({
											...action,
											label: i18n._(action.label),
										}));
									}

									if (rowKey === "plan") {
										return (
											<div key={plan.id} className="px-4 py-2.5">
												<div className="space-y-0.5">
													<div className="text-base font-medium">
														{i18n._(plan.name)}
													</div>
													<div
														className={cn(
															plan.priceNote
																? "text-xl font-semibold leading-tight"
																: "text-base font-medium text-muted-foreground",
														)}
													>
														{i18n._(getValue(plan.price))}
													</div>
													{plan.priceNote && (
														<div className="text-xs text-muted-foreground">
															{i18n._(getValue(plan.priceNote))}
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
														aria-label={t({
															message: "Billed yearly",
														})}
													/>
												)}
												<span>{i18n._(getValue(plan.billingText))}</span>
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
							<Fragment key={section.title.id}>
								<div className="col-span-4 pt-6 pb-3 px-2">
									<span className="text-sm font-semibold">
										{i18n._(section.title)}
									</span>
								</div>
								<div className="col-span-4 h-px bg-border/60" />

								{section.rows.map((row, rowIndex) => {
									const isLastRow =
										sectionIndex === COMPARISON_SECTIONS.length - 1 &&
										rowIndex === section.rows.length - 1;

									return (
										<Fragment key={row.label.id}>
											<div className="flex items-center gap-1.5 px-2 py-2.5 text-xs text-muted-foreground">
												{i18n._(row.label)}
												{row.badge && (
													<Badge
														variant={row.badge.variant}
														className="px-1.5 py-0 text-[10px] font-medium"
													>
														{i18n._(row.badge.label)}
													</Badge>
												)}
											</div>
											{row.values.map((value, valueIndex) => (
												<div
													key={`${row.label.id}-${valueIndex}`}
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
