/**
 * The hooks a repository declares for its cloud workspaces, read from
 * `.superset/config.json` on the branch a workspace is created from. Ports
 * are the one key the control plane must know before the box exists (a
 * sandbox publishes its ports at create); `start` the box reads itself.
 */
import { z } from "zod";
import type { RepositoryRow } from "./repositories";

/**
 * The cloud keys of `.superset/config.json`: `setup` runs when an
 * environment's golden is built, `start` on every boot once host-service is
 * up, and `ports` are published beside the platform's own.
 */
export const repositoryHooksSchema = z.object({
	setup: z.array(z.string()).optional(),
	start: z.array(z.string()).optional(),
	ports: z.array(z.number().int().min(1).max(65535)).max(13).optional(),
});
export type RepositoryHooks = z.infer<typeof repositoryHooksSchema>;

const READ_TIMEOUT_MS = 5_000;

export async function readRepoHooks(args: {
	repo: Pick<RepositoryRow, "owner" | "name">;
	branch: string;
	token: string | null;
}): Promise<RepositoryHooks | null> {
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
		const parsed = repositoryHooksSchema.safeParse(await response.json());
		return parsed.success ? parsed.data : null;
	} catch (error) {
		console.warn(
			`[cloud-workspace] could not read .superset/config.json on ${args.branch}`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}
