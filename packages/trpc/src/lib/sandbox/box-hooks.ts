/** Above the box's own 60s archive limit, so the box reports its timeout. */
const ARCHIVE_HOOK_REQUEST_TIMEOUT_MS = 90_000;
const START_HOOK_REQUEST_TIMEOUT_MS = 30_000;

export type BoxHookOutcome =
	| { kind: "ran"; status: string }
	| { kind: "unsupported" }
	| { kind: "error"; message: string };

/**
 * Calls a host-service procedure on a running box, direct with the host
 * secret the way the gate would, in host-service's superjson wire format.
 * Never throws: a box hook is best effort.
 */
async function callBoxProcedure({
	hostTarget,
	hostSecret,
	procedure,
	input,
	timeoutMs,
}: {
	hostTarget: string;
	hostSecret: string;
	procedure: string;
	input: unknown;
	timeoutMs: number;
}): Promise<BoxHookOutcome> {
	try {
		const response = await fetch(`${hostTarget}/trpc/${procedure}`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${hostSecret}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ json: input }),
			signal: AbortSignal.timeout(timeoutMs),
		});
		// A box whose host-service predates the procedure.
		if (response.status === 404) return { kind: "unsupported" };
		if (!response.ok) {
			return {
				kind: "error",
				message: `${procedure} answered ${response.status}`,
			};
		}
		const body = (await response.json()) as {
			result?: { data?: { json?: { status?: unknown; started?: unknown } } };
		};
		const data = body.result?.data?.json;
		const status =
			typeof data?.status === "string"
				? data.status
				: data?.started === true
					? "started"
					: "done";
		return { kind: "ran", status };
	} catch (error) {
		return {
			kind: "error",
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Runs the repository's cloud `[archive]` commands on a running box. */
export function runBoxArchiveHook(args: {
	hostTarget: string;
	hostSecret: string;
}): Promise<BoxHookOutcome> {
	return callBoxProcedure({
		...args,
		procedure: "sandbox.runArchiveHook",
		input: {},
		timeoutMs: ARCHIVE_HOOK_REQUEST_TIMEOUT_MS,
	});
}

/** Re-runs setup on a box whose archive was undone while its archive hook ran. */
export function rerunBoxStartHook(args: {
	hostTarget: string;
	hostSecret: string;
}): Promise<BoxHookOutcome> {
	return callBoxProcedure({
		...args,
		procedure: "sandbox.runStartHook",
		input: { force: true },
		timeoutMs: START_HOOK_REQUEST_TIMEOUT_MS,
	});
}
