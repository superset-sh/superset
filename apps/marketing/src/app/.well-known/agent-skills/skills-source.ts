const REPO_RAW = "https://raw.githubusercontent.com/superset-sh/skills/main";

export const SKILL_NAMES = ["superset", "superset-mcp"] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export function isSkillName(value: string): value is SkillName {
	return (SKILL_NAMES as readonly string[]).includes(value);
}

export async function fetchSkill(name: SkillName): Promise<string | null> {
	const response = await fetch(`${REPO_RAW}/skills/${name}/SKILL.md`, {
		next: { revalidate: 3600 },
	});
	if (!response.ok) {
		return null;
	}
	return response.text();
}
