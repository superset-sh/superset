import { env } from "../../env";
import { syncOrganizationSubscription } from "./sync-subscription";
import { verifySvixSignature } from "./verify-svix";

const PLAN_CHANGE_EVENTS = new Set([
	"billing.updated",
	"customer.products.updated",
]);

export async function handleAutumnWebhook(args: {
	headers: Headers;
	body: string;
}): Promise<{ status: number; synced?: string }> {
	const secret = env.AUTUMN_WEBHOOK_SECRET;
	if (!secret) return { status: 503 };
	const valid = verifySvixSignature({
		secret,
		id: args.headers.get("svix-id"),
		timestamp: args.headers.get("svix-timestamp"),
		signature: args.headers.get("svix-signature"),
		body: args.body,
	});
	if (!valid) return { status: 401 };
	const event = JSON.parse(args.body) as {
		type?: string;
		data?: { customer_id?: string; customer?: { id?: string } };
	};
	const customerId = event.data?.customer_id ?? event.data?.customer?.id;
	if (!event.type || !PLAN_CHANGE_EVENTS.has(event.type) || !customerId) {
		return { status: 200 };
	}
	await syncOrganizationSubscription(customerId);
	return { status: 200, synced: customerId };
}
