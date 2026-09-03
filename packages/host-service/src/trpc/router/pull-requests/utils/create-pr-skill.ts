import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MANAGED_SKILL_MARKER } from "@superset/agent-setup";
import { getBundledPluginDir } from "@superset/agent-setup/config";

export const CREATE_PR_SKILL_NAME = "create-pr";

/** Repo-relative path a project writes to override the skill. */
export const PROJECT_SKILL_RELATIVE_PATH = path.join(
	".agents",
	"skills",
	CREATE_PR_SKILL_NAME,
	"SKILL.md",
);

/** Home-relative path of the copy managed-skills provisions for every agent
 * CLI; a user who edits it owns it from then on (the provisioner skips it). */
export const USER_SKILL_RELATIVE_PATH = path.join(
	".agents",
	"skills",
	`superset-${CREATE_PR_SKILL_NAME}`,
	"SKILL.md",
);

export type CreatePrSkillSource = "project" | "user" | "bundled";

export interface ResolvedCreatePrSkill {
	source: CreatePrSkillSource;
	path: string;
	/** SKILL.md without its frontmatter or the managed-file marker. */
	body: string;
}

/** Drops the YAML frontmatter block and the provisioner's marker comment. */
export function stripSkillFrontmatter(content: string): string {
	let body = content;
	if (body.startsWith("---\n")) {
		const end = body.indexOf("\n---\n", 4);
		if (end !== -1) body = body.slice(end + "\n---\n".length);
	}
	return body.replaceAll(`${MANAGED_SKILL_MARKER}\n`, "").trim();
}

async function readIfExists(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

/**
 * The `create-pr` skill the agent follows, most specific first: the project's
 * own `.agents/skills/create-pr` (or `.claude/skills/create-pr`, which Claude
 * Code reads directly), then the user's provisioned copy under
 * `~/.agents/skills/superset-create-pr`, then the bundled default. Null only
 * when the bundle itself is missing.
 */
export async function resolveCreatePrSkill({
	worktreePath,
	homeDir = os.homedir(),
	bundledPluginDir = getBundledPluginDir(),
}: {
	worktreePath: string;
	homeDir?: string;
	bundledPluginDir?: string;
}): Promise<ResolvedCreatePrSkill | null> {
	const candidates: Array<{ source: CreatePrSkillSource; path: string }> = [
		{
			source: "project",
			path: path.join(worktreePath, PROJECT_SKILL_RELATIVE_PATH),
		},
		{
			source: "project",
			path: path.join(
				worktreePath,
				".claude",
				"skills",
				CREATE_PR_SKILL_NAME,
				"SKILL.md",
			),
		},
		{ source: "user", path: path.join(homeDir, USER_SKILL_RELATIVE_PATH) },
		{
			source: "bundled",
			path: path.join(
				bundledPluginDir,
				"skills",
				CREATE_PR_SKILL_NAME,
				"SKILL.md",
			),
		},
	];
	for (const candidate of candidates) {
		const content = await readIfExists(candidate.path);
		if (content === null) continue;
		const body = stripSkillFrontmatter(content);
		if (!body) continue;
		return { ...candidate, body };
	}
	return null;
}
