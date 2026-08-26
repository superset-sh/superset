import { stripeClient } from "@superset/auth/stripe";
import { db } from "@superset/db/client";
import { members, organizations, subscriptions } from "@superset/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
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

	const [member, organization] = await Promise.all([
		db.query.members.findFirst({
			where: and(
				eq(members.userId, ctx.session.user.id),
				eq(members.organizationId, activeOrgId),
			),
		}),
		db.query.organizations.findFirst({
			where: eq(organizations.id, activeOrgId),
			columns: { stripeCustomerId: true },
		}),
	]);

	if (!member || member.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only owners can manage billing",
		});
	}

	return organization?.stripeCustomerId ?? null;
}

const EMPTY_ACTIVE_PLAN = {
	plan: "free" as const,
	status: null,
	cancelAt: null,
	periodStart: null,
	periodEnd: null,
	billingInterval: null,
};

function isUnpaid(invoice: Stripe.Invoice): boolean {
	return invoice.status === "open" || invoice.status === "uncollectible";
}

/**
 * Drafts are not owed yet and voided invoices never will be; everything else
 * — paid, open, uncollectible — is part of the customer's billing history.
 */
function isBillableInvoice(invoice: Stripe.Invoice): boolean {
	return invoice.status === "paid" || isUnpaid(invoice);
}

function toInvoiceSummary(
	invoice: Stripe.Invoice,
	options: { includeHostedUrl?: boolean } = {},
) {
	return {
		id: invoice.id,
		date: invoice.created,
		status: invoice.status,
		isUnpaid: isUnpaid(invoice),
		amountPaid: invoice.amount_paid,
		// amount_due is frozen at finalization; amount_remaining is what is
		// still owed after any partial payment through the hosted invoice.
		amountDue: invoice.amount_remaining ?? invoice.amount_due,
		currency: invoice.currency,
		hostedInvoiceUrl:
			options.includeHostedUrl === false ? null : invoice.hosted_invoice_url,
		dueDate: invoice.due_date,
	};
}

async function isBillingOwner(userId: string, organizationId: string) {
	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, userId),
			eq(members.organizationId, organizationId),
		),
	});
	return member?.role === "owner";
}

export const billingRouter = {
	activePlan: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.activeOrganizationId;
		if (!activeOrgId) return EMPTY_ACTIVE_PLAN;

		const subscription = await db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, activeOrgId),
				inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
			),
			orderBy: desc(subscriptions.createdAt),
		});

		if (!subscription) {
			return EMPTY_ACTIVE_PLAN;
		}

		return {
			plan: subscription.plan,
			status: subscription.status,
			cancelAt: subscription.cancelAt,
			periodStart: subscription.periodStart,
			periodEnd: subscription.periodEnd,
			billingInterval: subscription.billingInterval,
		};
	}),

	invoices: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.activeOrganizationId;
		if (!activeOrgId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "No active organization",
			});
		}

		const organization = await db.query.organizations.findFirst({
			where: eq(organizations.id, activeOrgId),
			columns: { stripeCustomerId: true },
		});

		if (!organization?.stripeCustomerId) {
			return [];
		}

		const twelveMonthsAgo = subtractMonthsClamped(new Date(), 12);

		const invoiceList = await stripeClient.invoices.list({
			customer: organization.stripeCustomerId,
			limit: 100,
			created: { gte: Math.floor(twelveMonthsAgo.getTime() / 1000) },
		});

		return invoiceList.data
			.filter(isBillableInvoice)
			.sort((a, b) => b.created - a.created)
			.map((invoice) => toInvoiceSummary(invoice));
	}),

	/**
	 * The invoice a failed payment is about. Drives the amount and the direct
	 * "Pay now" link on the payment-failure surfaces, which otherwise can only
	 * say that something failed.
	 */
	outstandingInvoice: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.activeOrganizationId;
		if (!activeOrgId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "No active organization",
			});
		}

		const organization = await db.query.organizations.findFirst({
			where: eq(organizations.id, activeOrgId),
			columns: { stripeCustomerId: true },
		});

		if (!organization?.stripeCustomerId) {
			return null;
		}

		const invoiceList = await stripeClient.invoices.list({
			customer: organization.stripeCustomerId,
			limit: 20,
		});

		const unpaid = invoiceList.data
			.filter(isUnpaid)
			.sort((a, b) => b.created - a.created)[0];

		if (!unpaid) return null;

		const isOwner = await isBillingOwner(ctx.session.user.id, activeOrgId);
		return toInvoiceSummary(unpaid, { includeHostedUrl: isOwner });
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
