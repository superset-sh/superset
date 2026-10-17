import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	originCheck,
	sessionMiddleware,
} from "better-auth/api";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { autumnClient, billingUsesAutumn } from "../../../autumn";
import { countBillableSeats } from "../../../utils/billing";
import { ensureAutumnCustomer, paidAutumnPlanId } from "./customer";
import {
	ACTIVE_CPU_MINUTES_FEATURE_ID,
	BOX_GB_MINUTES_FEATURE_ID,
	SEATS_FEATURE_ID,
} from "./features";
import { invalidateOrganizationBilling } from "./plan-state";
import { syncOrganizationSubscription } from "./projection";
import {
	ADMIN_EXPAND,
	type BillingRole,
	checkoutSessionParams,
	OWNER_EXPAND,
	ROUTE_ROLES,
	selfServePlan,
} from "./routes-policy";

interface SessionContext {
	context: {
		session: {
			user: { id: string };
			session: { activeOrganizationId?: string | null };
		};
	};
}

const organizationBody = { organizationId: z.string().uuid().optional() };

async function billingCaller(
	ctx: unknown,
	route: keyof typeof ROUTE_ROLES,
): Promise<{ organizationId: string; userId: string; role: BillingRole }> {
	if (!billingUsesAutumn) throw new APIError("NOT_FOUND");
	const { context, body } = ctx as SessionContext & {
		body?: { organizationId?: string };
	};
	const { session } = context;
	const organizationId =
		body?.organizationId ?? session.session.activeOrganizationId;
	if (!organizationId) {
		throw new APIError("BAD_REQUEST", {
			message: "No active organization selected",
		});
	}
	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, session.user.id),
			eq(members.organizationId, organizationId),
		),
		columns: { role: true },
	});
	const role = member?.role as BillingRole | undefined;
	if (!role || !(ROUTE_ROLES[route] as readonly BillingRole[]).includes(role)) {
		throw new APIError("FORBIDDEN", {
			message: "You don't have permission to manage billing",
		});
	}
	return { organizationId, userId: session.user.id, role };
}

function refuseEnterprise(planId: string): void {
	if (!selfServePlan(planId)) {
		throw new APIError("FORBIDDEN", {
			message: `Enterprise subscriptions are managed by admins. Contact ${COMPANY.SUPPORT_EMAIL}.`,
		});
	}
}

async function afterPlanChange(organizationId: string): Promise<void> {
	await invalidateOrganizationBilling(organizationId);
	await syncOrganizationSubscription(organizationId).catch((error) =>
		console.error(`[billing/routes] sync of ${organizationId} failed`, error),
	);
}

/**
 * Autumn's checkout, plan and usage routes under /api/auth/autumn/*, with our
 * owner/admin rules. Bodies are whitelisted: the customer, seats and checkout
 * settings come from the server, never from the client.
 */
export const autumnBillingRoutes = {
	id: "autumn-billing",
	endpoints: {
		autumnAttach: createAuthEndpoint(
			"/autumn/attach",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					planId: z.string().min(1),
					successUrl: z.string().min(1),
					cancelUrl: z.string().optional(),
				}),
				use: [
					sessionMiddleware,
					originCheck((ctx) => [ctx.body.successUrl, ctx.body.cancelUrl]),
				],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "attach");
				refuseEnterprise(ctx.body.planId);
				const [stripeSubscription, autumnPlanId] = await Promise.all([
					db.query.subscriptions.findFirst({
						where: and(
							eq(subscriptions.referenceId, caller.organizationId),
							inArray(subscriptions.status, ["active", "trialing"]),
						),
						columns: { plan: true },
					}),
					paidAutumnPlanId(caller.organizationId).catch(() => null),
				]);
				if (
					stripeSubscription?.plan === "enterprise" ||
					(autumnPlanId && !selfServePlan(autumnPlanId))
				) {
					refuseEnterprise("enterprise");
				}
				if (stripeSubscription && !autumnPlanId) {
					throw new APIError("BAD_REQUEST", {
						message:
							"This organization already has a subscription. Change it from the billing portal.",
					});
				}
				await ensureAutumnCustomer(caller.organizationId);
				const seats = Math.max(
					1,
					await countBillableSeats(caller.organizationId),
				);
				const result = await autumnClient.billing.attach({
					customerId: caller.organizationId,
					planId: ctx.body.planId,
					featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity: seats }],
					successUrl: ctx.body.successUrl,
					redirectMode: "always",
					checkoutSessionParams: checkoutSessionParams({
						planId: ctx.body.planId,
						organizationId: caller.organizationId,
						userId: caller.userId,
						cancelUrl: ctx.body.cancelUrl,
					}),
				});
				if (!result.paymentUrl) await afterPlanChange(caller.organizationId);
				return ctx.json(result);
			},
		),
		autumnPreviewAttach: createAuthEndpoint(
			"/autumn/previewAttach",
			{
				method: "POST",
				body: z.object({ ...organizationBody, planId: z.string().min(1) }),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "previewAttach");
				refuseEnterprise(ctx.body.planId);
				const seats = Math.max(
					1,
					await countBillableSeats(caller.organizationId),
				);
				return ctx.json(
					await autumnClient.billing.previewAttach({
						customerId: caller.organizationId,
						planId: ctx.body.planId,
						featureQuantities: [
							{ featureId: SEATS_FEATURE_ID, quantity: seats },
						],
					}),
				);
			},
		),
		autumnUpdateSubscription: createAuthEndpoint(
			"/autumn/updateSubscription",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					planId: z.string().min(1),
					cancelAction: z.enum(["cancel_end_of_cycle", "uncancel"]),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "updateSubscription");
				refuseEnterprise(ctx.body.planId);
				const result = await autumnClient.billing.update({
					customerId: caller.organizationId,
					planId: ctx.body.planId,
					cancelAction: ctx.body.cancelAction,
				});
				await afterPlanChange(caller.organizationId);
				return ctx.json(result);
			},
		),
		autumnPreviewUpdateSubscription: createAuthEndpoint(
			"/autumn/previewUpdateSubscription",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					planId: z.string().min(1),
					cancelAction: z.enum(["cancel_end_of_cycle", "uncancel"]),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "previewUpdateSubscription");
				refuseEnterprise(ctx.body.planId);
				return ctx.json(
					await autumnClient.billing.previewUpdate({
						customerId: caller.organizationId,
						planId: ctx.body.planId,
						cancelAction: ctx.body.cancelAction,
					}),
				);
			},
		),
		autumnOpenCustomerPortal: createAuthEndpoint(
			"/autumn/openCustomerPortal",
			{
				method: "POST",
				body: z.object({ ...organizationBody, returnUrl: z.string().min(1) }),
				use: [sessionMiddleware, originCheck((ctx) => ctx.body.returnUrl)],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "openCustomerPortal");
				await ensureAutumnCustomer(caller.organizationId);
				return ctx.json(
					await autumnClient.billing.openCustomerPortal({
						customerId: caller.organizationId,
						returnUrl: ctx.body.returnUrl,
					}),
				);
			},
		),
		autumnGetOrCreateCustomer: createAuthEndpoint(
			"/autumn/getOrCreateCustomer",
			{
				method: "POST",
				body: z.object(organizationBody).optional(),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "getOrCreateCustomer");
				await ensureAutumnCustomer(caller.organizationId);
				return ctx.json(
					await autumnClient.customers.get({
						customerId: caller.organizationId,
						expand: [
							...(caller.role === "owner" ? OWNER_EXPAND : ADMIN_EXPAND),
						],
					}),
				);
			},
		),
		autumnListPlans: createAuthEndpoint(
			"/autumn/listPlans",
			{
				method: "POST",
				body: z.object(organizationBody).optional(),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "listPlans");
				const plans = await autumnClient.plans.list({
					customerId: caller.organizationId,
				});
				return ctx.json({
					...plans,
					list: plans.list.filter((plan) => selfServePlan(plan.id)),
				});
			},
		),
		autumnAggregateEvents: createAuthEndpoint(
			"/autumn/aggregateEvents",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					featureId: z.enum([
						BOX_GB_MINUTES_FEATURE_ID,
						ACTIVE_CPU_MINUTES_FEATURE_ID,
					]),
					range: z.enum(["24h", "7d", "30d", "90d", "1bc", "3bc"]).optional(),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "aggregateEvents");
				return ctx.json(
					await autumnClient.events.aggregate({
						customerId: caller.organizationId,
						featureId: ctx.body.featureId,
						...(ctx.body.range ? { range: ctx.body.range } : {}),
					}),
				);
			},
		),
	},
} satisfies BetterAuthPlugin;
