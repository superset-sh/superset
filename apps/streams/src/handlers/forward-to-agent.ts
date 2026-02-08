export async function forwardToAgent({
	agentEndpoint,
	path,
	body,
}: {
	agentEndpoint: string;
	path: string;
	body: unknown;
}): Promise<boolean> {
	try {
		const base = agentEndpoint.endsWith("/")
			? agentEndpoint.slice(0, -1)
			: agentEndpoint;
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;

		const res = await fetch(`${base}${normalizedPath}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			console.error(
				`[forward-to-agent] Failed: ${res.status} ${res.statusText}`,
			);
			return false;
		}

		return true;
	} catch (err) {
		console.error("[forward-to-agent] Error:", err);
		return false;
	}
}
