const FORWARD_TIMEOUT_MS = 30_000;

export type ForwardResult =
	| { ok: true }
	| { ok: false; status: number; statusText: string }
	| { ok: false; status: 0; statusText: string };

export async function forwardToAgent({
	agentEndpoint,
	path,
	body,
}: {
	agentEndpoint: string;
	path: string;
	body: unknown;
}): Promise<ForwardResult> {
	try {
		const base = agentEndpoint.endsWith("/")
			? agentEndpoint.slice(0, -1)
			: agentEndpoint;
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;

		const res = await fetch(`${base}${normalizedPath}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
		});

		if (!res.ok) {
			console.error(
				`[forward-to-agent] Failed: ${res.status} ${res.statusText}`,
			);
			return { ok: false, status: res.status, statusText: res.statusText };
		}

		return { ok: true };
	} catch (err) {
		console.error("[forward-to-agent] Error:", err);
		return {
			ok: false,
			status: 0,
			statusText: (err as Error).message ?? "Connection failed",
		};
	}
}
