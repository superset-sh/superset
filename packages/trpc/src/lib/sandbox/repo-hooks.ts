/**
 * The hooks a repository declares for its cloud workspaces, read from
 * `.superset/config.json` on the branch a workspace is created from. Ports
 * are the one key the control plane must know before the box exists (a
 * sandbox publishes its ports at create); `start` the box reads itself.
 */
import {
	type EnvironmentHooks,
	environmentHooksSchema,
} from "@superset/db/schema";
import type { RepositoryRow } from "./repositories";

const READ_TIMEOUT_MS = 5_000;

export async function readRepoHooks(args: {
	repo: Pick<RepositoryRow, "owner" | "name">;
	branch: string;
	token: string | null;
}): Promise<EnvironmentHooks | null> {
	const url = `https://api.github.com/repos/${args.repo.owner}/${args.repo.name}/contents/.superset/config.json?ref=${encodeURIComponent(args.branch)}`;
	try {
		const response = await fetch(url, {
			headers: {
				accept: "application/vnd.github.raw+json",
				"x-github-api-version": "2022-11-28",
				...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
			},
			signal: AbortSignal.timeout(READ_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const parsed = environmentHooksSchema.safeParse(await response.json());
		return parsed.success ? parsed.data : null;
	} catch (error) {
		console.warn(
			`[cloud-workspace] could not read .superset/config.json on ${args.branch}`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

/** The environment's override wins key by key over what the repository declares. */
export function mergeHooks(
	repo: EnvironmentHooks | null,
	override: EnvironmentHooks | null,
): EnvironmentHooks {
	return {
		setup: override?.setup ?? repo?.setup,
		start: override?.start ?? repo?.start,
		ports: override?.ports ?? repo?.ports,
	};
}
