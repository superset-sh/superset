import type { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export async function waitForPageAgent({
	client,
	workspaceId,
	terminalId,
	timeoutMs = 30_000,
}: {
	client: Pick<ReturnType<typeof getHostServiceClientByUrl>, "terminalAgents">;
	workspaceId: string;
	terminalId: string;
	timeoutMs?: number;
}) {
	const signal = AbortSignal.timeout(timeoutMs);
	while (!signal.aborted) {
		const bindings = await client.terminalAgents.listByWorkspace.query(
			{ workspaceId },
			{ signal },
		);
		const binding = bindings.find(
			(candidate) => candidate.terminalId === terminalId,
		);
		if (binding) return binding;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return undefined;
}
