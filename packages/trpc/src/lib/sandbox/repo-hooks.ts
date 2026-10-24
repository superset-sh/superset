/**
 * The hooks a repository declares for its cloud workspaces, read from
 * `.superset/config.toml` (else the v1 `.superset/config.json`) on the branch
 * a workspace is created from. Ports are the one key the control plane must
 * know before the box exists (a sandbox publishes its ports at create); the
 * box reads its own setup and terminals.
 */
import {
	parseProjectConfig,
	resolveProjectConfig,
} from "@superset/shared/project-config";
import { z } from "zod";
import type { RepositoryRow } from "./repositories";

/**
 * The cloud keys of `.superset/config.json`: `setup` runs when an
 * environment's golden is built, `start` on every boot once host-service is
 * up, and `ports` are published beside the platform's own. Two phases, and a
 * repository that needs something once makes its own start step idempotent —
 * the platform does not track per-workspace steps on its behalf.
 */
export const repositoryHooksSchema = z.object({
	setup: z.array(z.string()).optional(),
	start: z.array(z.string()).optional(),
	ports: z.array(z.number().int().min(1).max(65535)).max(13).optional(),
});
export type RepositoryHooks = z.infer<typeof repositoryHooksSchema>;

const READ_TIMEOUT_MS = 5_000;

type RepoFileArgs = {
	repo: Pick<RepositoryRow, "owner" | "name">;
	branch: string;
	token: string | null;
};

/** The file's text, or null when it is absent or unreadable. */
async function readRepoFile(
	args: RepoFileArgs,
	path: string,
): Promise<string | null> {
	const url = `https://api.github.com/repos/${args.repo.owner}/${args.repo.name}/contents/${path}?ref=${encodeURIComponent(args.branch)}`;
	try {
		const response = await fetch(url, {
			headers: {
				accept: "application/vnd.github.raw+json",
				"x-github-api-version": "2022-11-28",
				...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
			},
			signal: AbortSignal.timeout(READ_TIMEOUT_MS),
		});
		return response.ok ? await response.text() : null;
	} catch (error) {
		console.warn(
			`[cloud-workspace] could not read ${path} on ${args.branch}`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

/** The v2 file's ports with `preview = true`, as the cloud resolves them. */
export function repoHooksFromToml(text: string): RepositoryHooks | null {
	const parsed = parseProjectConfig(text);
	if (!parsed.ok) return null;
	const ports = resolveProjectConfig({
		base: parsed.config,
		local: null,
		environment: "cloud",
	})
		.ports.filter((port) => port.preview)
		.map((port) => port.default);
	return ports.length > 0 ? { ports } : {};
}

export async function readRepoHooks(
	args: RepoFileArgs,
): Promise<RepositoryHooks | null> {
	const toml = await readRepoFile(args, ".superset/config.toml");
	if (toml !== null) return repoHooksFromToml(toml);
	const json = await readRepoFile(args, ".superset/config.json");
	if (json === null) return null;
	try {
		const parsed = repositoryHooksSchema.safeParse(JSON.parse(json));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
