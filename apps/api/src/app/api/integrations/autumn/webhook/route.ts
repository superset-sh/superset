import { handleAutumnWebhook } from "@superset/auth/billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const { status, synced } = await handleAutumnWebhook({
		headers: request.headers,
		body,
	});
	return Response.json({ ok: status === 200, synced }, { status });
}
