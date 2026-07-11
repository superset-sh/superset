import type { AuthContext } from "./auth";

const HOST_UPDATE_SCOPE = "host-update";
const HOST_UPDATE_PROCEDURE = "host.update.start";

function trpcProcedures(path: string): string[] {
	const pathname = path.split("?", 1)[0] ?? "";
	const encodedProcedures = pathname.startsWith("/trpc/")
		? pathname.slice("/trpc/".length)
		: "";
	let decodedProcedures = encodedProcedures;
	while (decodedProcedures.includes("%")) {
		try {
			const next = decodeURIComponent(decodedProcedures);
			if (next === decodedProcedures) break;
			decodedProcedures = next;
		} catch {
			break;
		}
	}
	return decodedProcedures.split(",").filter(Boolean);
}

export function canProxyHostTrpcPath(
	auth: AuthContext,
	hostId: string,
	path: string,
): boolean {
	const requestsHostUpdate = trpcProcedures(path).includes(
		HOST_UPDATE_PROCEDURE,
	);
	return (
		!requestsHostUpdate ||
		(auth.scope === HOST_UPDATE_SCOPE &&
			auth.runId === `${HOST_UPDATE_SCOPE}:${hostId}`)
	);
}
