import { stripeClient } from "@superset/auth/stripe";
import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
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

export const billingRouter = {
	invoices: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.session.session.activeOrganizationId;
		if (!activeOrgId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "No active organization",
			});
		}

		const subscription = await db.query.subscriptions.findFirst({
			where: eq(subscriptions.referenceId, activeOrgId),
		});

		if (!subscription?.stripeCustomerId) {
			return [];
		}

		const twelveMonthsAgo = subtractMonthsClamped(new Date(), 12);

		const stripeInvoices = await stripeClient.invoices.list({
			customer: subscription.stripeCustomerId,
			limit: 100,
			status: "paid",
			created: { gte: Math.floor(twelveMonthsAgo.getTime() / 1000) },
		});

		return stripeInvoices.data.map((invoice) => ({
			id: invoice.id,
			date: invoice.created,
			amount: invoice.amount_paid,
			currency: invoice.currency,
			hostedInvoiceUrl: invoice.hosted_invoice_url,
		}));
	}),
} satisfies TRPCRouterRecord;
