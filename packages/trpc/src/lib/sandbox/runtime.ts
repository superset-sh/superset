import { SANDBOX_PORTS } from "@superset/shared/sandbox-contract";
import { type SandboxClaim, SandboxNotReadyError } from "./types";
export const HOST_SERVICE_PORT = SANDBOX_PORTS.hostService;

const HOST_READY_TIMEOUT_MS = 60_000;
const HOST_READY_POLL_MS = 100;

async function waitForHostService(
	target: string,
	providerSandboxId: string,
	hostSecret?: string,
): Promise<void> {
	const deadline = Date.now() + HOST_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const ok = await fetch(`${target}/trpc/health.check`, {
			signal: AbortSignal.timeout(HOST_READY_POLL_MS * 6),
			...(hostSecret
				? { headers: { authorization: `Bearer ${hostSecret}` } }
				: {}),
		})
			.then((response) => response.ok)
			.catch(() => false);
		if (ok) return;
		await new Promise((resolve) => setTimeout(resolve, HOST_READY_POLL_MS));
	}
	throw new SandboxNotReadyError(providerSandboxId);
}

/**
 * The half of a wake after boot is fired: wait for host-service to answer,
 * then push the managed environment. What a create runs once its box is
 * booted, so it never re-runs the wake's own calls on a box it just made.
 */
export async function settleSandbox(args: {
	providerSandboxId: string;
	hostTarget: string;
	claim: SandboxClaim;
}): Promise<void> {
	await waitForHostService(
		args.hostTarget,
		args.providerSandboxId,
		args.claim.hostSecret,
	);
	await pushManagedEnv(
		args.hostTarget,
		args.claim.hostSecret,
		args.claim.managedEnv,
	);
}

/**
 * Replaces host-service's managed environment. Direct to the box with the
 * host secret, the way the gate would; superjson is host-service's wire
 * format, so the input is wrapped the way its client would wrap it.
 */
export async function pushManagedEnv(
	target: string,
	hostSecret: string,
	variables: Record<string, string>,
): Promise<void> {
	const response = await fetch(`${target}/trpc/sandbox.setEnvironment`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${hostSecret}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ json: { variables } }),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`sandbox.setEnvironment answered ${response.status}`);
	}
}
