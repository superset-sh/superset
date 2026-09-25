import { createHash } from "node:crypto";
import matter from "gray-matter";
import { fetchSkill, SKILL_NAMES } from "../skills-source";

export async function GET() {
	const skills = (
		await Promise.all(
			SKILL_NAMES.map(async (name) => {
				const content = await fetchSkill(name);
				if (!content) return null;
				const { data } = matter(content);
				const digest = createHash("sha256").update(content).digest("hex");
				return {
					name,
					type: "skill-md",
					description: data.description,
					url: `/.well-known/agent-skills/${name}/SKILL.md`,
					files: ["SKILL.md"],
					digest: `sha256:${digest}`,
				};
			}),
		)
	).filter((skill) => skill !== null);

	if (skills.length === 0) {
		return new Response("Skill source unavailable", { status: 503 });
	}

	return Response.json({
		$schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
		repository: "https://github.com/superset-sh/skills",
		skills,
	});
}
