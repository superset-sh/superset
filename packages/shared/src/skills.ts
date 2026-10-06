/**
 * Skill directory names double as the invocation token (`/name` in Claude
 * Code, `$name` in Codex), so they follow the strictest CLI's rule: lowercase
 * letters, digits and single dashes.
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SKILL_NAME_LENGTH = 64;

export function isValidSkillName(name: string): boolean {
	return name.length <= MAX_SKILL_NAME_LENGTH && SKILL_NAME_PATTERN.test(name);
}

/** "cdp-verification" → "Cdp Verification", the fallback Codex shows too. */
export function titleCaseSkillName(name: string): string {
	return name
		.split(/[-_]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Folder names people pick ("My Skill") → "my-skill"; "" when nothing survives. */
export function slugifySkillName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_SKILL_NAME_LENGTH)
		.replace(/-+$/g, "");
}
