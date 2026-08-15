/**
 * Called directly rather than behind a provider interface: there is one
 * provider, so an interface would be a second thing to keep in sync with no
 * second implementation to justify it.
 *
 * Previews are private, so Blaxel's edge rejects unauthenticated requests
 * before they reach host-service. Clients connect directly with a brokered
 * token — no relay hop, so websockets work and the sandbox can still sleep.
 */
import { SandboxInstance } from "@blaxel/core";
import { TRPCError } from "@trpc/server";
import { env } from "../../env";

/** Short enough that a leaked token is bounded; minted per access. */
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
const PREVIEW_NAME = "hostsvc";
const HOST_SERVICE_PORT = 4879;

function assertConfigured(): void {
	if (!env.BLAXEL_API_KEY || !env.BLAXEL_WORKSPACE) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Cloud workspaces are not configured on this deployment",
			cause: { kind: "BLAXEL_NOT_CONFIGURED" },
		});
	}
	// The SDK reads these from the environment rather than taking arguments.
	process.env.BL_API_KEY = env.BLAXEL_API_KEY;
	process.env.BL_WORKSPACE = env.BLAXEL_WORKSPACE;
}

export interface ProvisionedSandbox {
	providerSandboxId: string;
	previewUrl: string;
}

/**
 * Creates the sandbox and its private preview. Returns once the preview URL
 * exists — not once anything is listening on it, which is the caller's job.
 */
export async function provisionSandbox(args: {
	name: string;
	image: string;
	memoryMb?: number;
	region?: string;
}): Promise<ProvisionedSandbox> {
	assertConfigured();
	const memoryMb = args.memoryMb ?? 4096;
	const region = args.region ?? env.BLAXEL_REGION;

	const sandbox = await SandboxInstance.createIfNotExists({
		name: args.name,
		image: args.image,
		memory: memoryMb,
		// Without disk-backed root the writable layer is tmpfs in RAM, and a
		// checkout plus node_modules is write-heavy enough to exhaust it.
		storageMb: 20480,
		ports: [{ target: HOST_SERVICE_PORT, protocol: "HTTP" }],
		region,
	} as never);

	const preview = await sandbox.previews.createIfNotExists({
		metadata: { name: PREVIEW_NAME },
		spec: { port: HOST_SERVICE_PORT, public: false },
	} as never);

	const previewUrl = preview.spec?.url;
	if (!previewUrl) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Sandbox preview has no URL",
		});
	}
	return { providerSandboxId: args.name, previewUrl };
}

export interface PreviewAccess {
	url: string;
	token: string;
	expiresAt: Date;
}

export async function mintPreviewAccess(
	providerSandboxId: string,
): Promise<PreviewAccess> {
	assertConfigured();
	const sandbox = await SandboxInstance.get(providerSandboxId);
	const preview = await sandbox.previews.get(PREVIEW_NAME);
	const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS);
	const token = await preview.tokens.create(expiresAt);
	const value = (token as { value?: string }).value;
	const url = preview.spec?.url;
	if (!value || !url) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Could not mint sandbox access token",
		});
	}
	return { url, token: value, expiresAt };
}

/** Best-effort: a sandbox already gone is the state we wanted. */
export async function deleteSandbox(providerSandboxId: string): Promise<void> {
	assertConfigured();
	try {
		await SandboxInstance.delete(providerSandboxId);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!/not found|404/i.test(message)) throw error;
	}
}
