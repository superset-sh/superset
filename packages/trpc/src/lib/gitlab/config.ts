import type { GitLabConfig } from "@superset/db/schema";
import { z } from "zod";
import { gitlabAccountIdentity } from "./scope";
import { parseGitLabOrigin } from "./ssrf";

const configSchema = z.object({
	provider: z.literal("gitlab"),
	host: z.string(),
	groupPath: z.string().nullable().default(null),
	auth: z.enum(["oauth", "token"]),
	webhookSecret: z.string(),
	scopeKind: z.enum(["project", "group"]).optional(),
	scopeId: z
		.string()
		.regex(/^[1-9]\d*$/)
		.refine((value) => Number.isSafeInteger(Number(value)))
		.optional(),
});
export function readGitlabConfig(state: unknown): GitLabConfig | null {
	const parsed = configSchema.safeParse(state);
	if (!parsed.success) return null;
	const config = parsed.data;
	try {
		config.host = parseGitLabOrigin(config.host).host;
		if (config.groupPath !== null)
			gitlabAccountIdentity(
				config.host,
				config.scopeKind ?? "project",
				config.groupPath,
			);
	} catch {
		return null;
	}
	return config;
}
