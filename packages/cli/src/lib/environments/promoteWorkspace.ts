import { CLIError } from "@superset/cli-framework";
import { type ApiClient, ApiHttpError } from "../api-client";

type EnvironmentScope = "organization" | "personal";

/** A new environment by name, or an existing one whose golden the workspace replaces. */
export type PromoteInto =
	| { name: string }
	| { environment: { id: string; sourceRef: string } };

/**
 * Snapshots a cloud workspace into an environment. The snapshot can outlast
 * the gateway's request timeout while the server finishes it, so a gateway
 * error waits for the row instead of failing.
 */
export async function promoteWorkspace({
	api,
	organizationId,
	workspaceId,
	into,
	scope,
	pollIntervalMs = 5_000,
	pollTimeoutMs = 5 * 60_000,
}: {
	api: ApiClient;
	organizationId: string;
	workspaceId: string;
	into: PromoteInto;
	scope?: EnvironmentScope;
	pollIntervalMs?: number;
	pollTimeoutMs?: number;
}) {
	const target = "environment" in into ? into.environment : null;
	const name = "name" in into ? into.name : undefined;
	// Names are not unique, so a new environment is the named row that was not there before.
	const existingIds = target
		? new Set<string>()
		: new Set(
				(await api.environment.list.query({ organizationId })).map(
					(row) => row.id,
				),
			);

	const waitForRow = async () => {
		const deadline = Date.now() + pollTimeoutMs;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, pollIntervalMs));
			const rows = await api.environment.list.query({ organizationId });
			const row = target
				? rows.find(
						(candidate) =>
							candidate.id === target.id &&
							candidate.sourceRef !== target.sourceRef,
					)
				: rows.find(
						(candidate) =>
							candidate.name === name && !existingIds.has(candidate.id),
					);
			if (row) return row;
		}
		throw new CLIError(
			`The snapshot did not finish in ${Math.round(pollTimeoutMs / 60_000)} minutes`,
			"Check with: superset environments list",
		);
	};

	const saved = await api.environment.promote
		.mutate({
			cloudWorkspaceId: workspaceId,
			name,
			environmentId: target?.id,
			scope,
		})
		.catch((error: unknown) => {
			const httpError =
				error instanceof ApiHttpError
					? error
					: error instanceof Error && error.cause instanceof ApiHttpError
						? error.cause
						: undefined;
			if (httpError && httpError.status >= 502) return waitForRow();
			throw error;
		});
	if (!saved) throw new CLIError("The environment was not saved");
	return saved;
}
