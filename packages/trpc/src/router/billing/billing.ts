import { stripeClient } from "@superset/auth/stripe";
import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";

function subtractMonthsClamped(date: Date, months: number) {
	const result = new Date(date);
	const originalDay = result.getDate();

	result.setDate(1);
	result.setMonth(result.getMonth() - months);

	const lastDayOfTargetMonth = new Date(
		result.getFullYear(),
		result.getMonth() + 1,
		0,
	).getDate();

	result.setDate(Math.min(originalDay, lastDayOfTargetMonth));

	return result;
}

async function requireOwnerWithCustomer(ctx: {
	session: { user: { id: string } };
	activeOrganizationId: string | null;
}) {
	const activeOrgId = ctx.activeOrganizationId;
	if (!activeOrgId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No active organization",
		});
	}

	const [member, subscription] = await Promise.all([
		db.query.members.findFirst({
			where: and(
				eq(members.userId, ctx.session.user.id),
				eq(members.organizationId, activeOrgId),
			),
		}),
		db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, activeOrgId),
				isNotNull(subscriptions.stripeCustomerId),
			),
			orderBy: desc(subscriptions.createdAt),
		}),
	]);

	if (!member || member.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only owners can manage billing",
		});
	}

	if (!subscription?.stripeCustomerId) {
		return null;
	}

	return subscription.stripeCustomerId;
}

export const billingRouter = {
	activePlan: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.activeOrganizationId;
		if (!activeOrgId) return { plan: "free" as const, status: null };

		const subscription = await db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, activeOrgId),
				inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
			),
			orderBy: desc(subscriptions.createdAt),
		});

		if (!subscription) {
			return { plan: "free" as const, status: null };
		}

		return { plan: subscription.plan, status: subscription.status };
	}),

	invoices: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.activeOrganizationId;
		if (!activeOrgId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "No active organization",
			});
		}

		// The subscriptions table is the only org -> Stripe customer mapping, so
		// gather every customer this org has ever billed under. Intentionally
		// unfiltered by status so invoices stay accessible after a downgrade, and
		// an org can accumulate more than one customer over its lifetime.
		const subscriptionRows = await db.query.subscriptions.findMany({
			where: and(
				eq(subscriptions.referenceId, activeOrgId),
				isNotNull(subscriptions.stripeCustomerId),
			),
			columns: { stripeCustomerId: true },
		});

		const customerIds = [
			...new Set(
				subscriptionRows
					.map((row) => row.stripeCustomerId)
					.filter((id): id is string => id !== null),
			),
		];

		if (customerIds.length === 0) {
			return [];
		}

		const twelveMonthsAgo = subtractMonthsClamped(new Date(), 12);

		// A paid invoice belongs to exactly one customer, so merging across
		// customers never produces duplicates.
		const invoiceLists = await Promise.all(
			customerIds.map((customer) =>
				stripeClient.invoices.list({
					customer,
					limit: 100,
					status: "paid",
					created: { gte: Math.floor(twelveMonthsAgo.getTime() / 1000) },
				}),
			),
		);

		return invoiceLists
			.flatMap((list) => list.data)
			.sort((a, b) => b.created - a.created)
			.map((invoice) => ({
				id: invoice.id,
				date: invoice.created,
				amount: invoice.amount_paid,
				currency: invoice.currency,
				hostedInvoiceUrl: invoice.hosted_invoice_url,
			}));
	}),

	details: protectedProcedure.query(async ({ ctx }) => {
		const stripeCustomerId = await requireOwnerWithCustomer(ctx);
		if (!stripeCustomerId) return null;

		const [customer, taxIds, paymentMethods] = await Promise.all([
			stripeClient.customers.retrieve(stripeCustomerId),
			stripeClient.customers.listTaxIds(stripeCustomerId, { limit: 1 }),
			stripeClient.paymentMethods.list({
				customer: stripeCustomerId,
				limit: 1,
			}),
		]);

		if ((customer as Stripe.DeletedCustomer).deleted) return null;

		const { name, email, address } = customer as Stripe.Customer;
		const pm = paymentMethods.data[0] ?? null;
		const taxId = taxIds.data[0] ?? null;

		function getPaymentMethodSummary(pm: Stripe.PaymentMethod | null) {
			if (!pm) return null;
			if (pm.card) {
				return {
					type: "card" as const,
					brand: pm.card.brand,
					last4: pm.card.last4,
				};
			}
			if (pm.link) {
				return { type: "link" as const, brand: "Link", last4: null };
			}
			if (pm.us_bank_account) {
				return {
					type: "bank" as const,
					brand: pm.us_bank_account.bank_name ?? "Bank account",
					last4: pm.us_bank_account.last4 ?? null,
				};
			}
			return { type: pm.type as string, brand: pm.type, last4: null };
		}

		return {
			name: name ?? null,
			email: email ?? null,
			address: address
				? {
						line1: address.line1,
						line2: address.line2,
						city: address.city,
						state: address.state,
						postalCode: address.postal_code,
						country: address.country,
					}
				: null,
			paymentMethod: getPaymentMethodSummary(pm),
			taxId: taxId ? { type: taxId.type, value: taxId.value } : null,
		};
	}),

	portal: protectedProcedure
		.input(
			z.object({
				flowType: z
					.enum(["payment_method_update", "general"])
					.optional()
					.default("general"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const stripeCustomerId = await requireOwnerWithCustomer(ctx);
			if (!stripeCustomerId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No Stripe customer found",
				});
			}

			const portalSession = await stripeClient.billingPortal.sessions.create({
				customer: stripeCustomerId,
				return_url: `${env.NEXT_PUBLIC_WEB_URL}/settings/billing`,
				...(input.flowType === "payment_method_update" && {
					flow_data: { type: "payment_method_update" as const },
				}),
			});

			return { url: portalSession.url };
		}),
} satisfies TRPCRouterRecord;
