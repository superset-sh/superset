/**
 * Keeps a running box's credential rules fresh. The API re-applies them on
 * every wake, but a box nobody reopens (an agent left running, a workspace
 * started by an automation) would otherwise lose GitHub access when the token
 * in the rule expires: an hour for the App's, eight for a person's.
 */
const REFRESH_INTERVAL_MS = 30 * 60_000;

export function startSandboxCredentialRefresh(args: {
	apiUrl: string;
	workspaceId: string;
	hostSecret: string;
}): () => void {
	const refresh = async () => {
		try {
			const response = await fetch(
				`${args.apiUrl}/api/cloud-workspaces/${args.workspaceId}/credentials`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${args.hostSecret}` },
					signal: AbortSignal.timeout(30_000),
				},
			);
			if (!response.ok) {
				console.warn(
					`[sandbox] credential refresh answered ${response.status}`,
				);
			}
		} catch (error) {
			console.warn(
				"[sandbox] credential refresh failed",
				error instanceof Error ? error.message : error,
			);
		}
	};
	const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
	timer.unref();
	return () => clearInterval(timer);
}
