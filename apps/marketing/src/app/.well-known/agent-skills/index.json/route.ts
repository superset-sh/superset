import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export const dynamic = "force-static";

const SKILL_PATH = path.join(process.cwd(), "../../skills/superset/SKILL.md");

export function GET() {
	const content = fs.readFileSync(SKILL_PATH, "utf-8");
	const { data } = matter(content);
	const digest = createHash("sha256").update(content).digest("hex");
	const name = data.name as string;

	return Response.json({
		$schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
		skills: [
			{
				name,
				type: "skill-md",
				description: data.description,
				url: `/.well-known/agent-skills/${name}/SKILL.md`,
				files: ["SKILL.md"],
				digest: `sha256:${digest}`,
			},
		],
	});
}
