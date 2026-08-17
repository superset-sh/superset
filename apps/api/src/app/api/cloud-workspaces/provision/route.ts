import { provisionCloudWorkspace } from "@superset/trpc/cloud-workspace-provision";
import { Receiver } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";

// Provisioning is a second or two warm, but the first sandboxes after an image
// rebuild pull the image and take tens of seconds.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z
	.object({
		cloudWorkspaceId: z.string().uuid(),
		/** Absent when the user typed a name, which the row already holds. */
		namingPrompt: z.string().max(20000).optional(),
	})
	.strict();

/**
 * Provisions the sandbox for a `cloud_workspaces` row that `cloudWorkspace.create`
 * already wrote. The row's status is the only thing the client waits on, so
 * this job is what turns the provisioning screen into a workspace.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	// `verify` throws rather than returning false on a signature it can't even
	// parse, so a malformed header answered 500 — reported as a server fault,
	// noisy in Sentry, and a different answer than a well-formed wrong
	// signature gets. Both are the same refusal.
	let valid = false;
	try {
		valid = await receiver.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/cloud-workspaces/provision`,
		});
	} catch {
		valid = false;
	}
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[cloud-workspaces/provision] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	// A failure here is already recorded on the row and the sandbox already
	// torn down, so answering 200 is right: a redelivery would repeat work that
	// deliberately gave up. QStash's retries are for the deliveries that never
	// reach this line.
	const outcome = await provisionCloudWorkspace(parsed.data);
	return Response.json({ ok: true, outcome });
}
