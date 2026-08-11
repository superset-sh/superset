import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SKILL_ROOTS = [".agents/skills", "plugins/superset/skills"] as const;
const ALLOWED_FRONTMATTER_FIELDS = new Set([
	"allowed-tools",
	"compatibility",
	"description",
	"license",
	"metadata",
	"name",
]);
const WORKSPACE_CREATE_EXAMPLE =
	/`(superset workspaces create[^`\n]*--[^`\n]*)`/g;

const problems: string[] = [];
let skillCount = 0;

function report(file: string, message: string): void {
	problems.push(`${file}: ${message}`);
}

function validateOptionalFields(
	file: string,
	frontmatter: Record<string, unknown>,
): void {
	if (
		frontmatter.compatibility !== undefined &&
		(typeof frontmatter.compatibility !== "string" ||
			frontmatter.compatibility.length === 0 ||
			frontmatter.compatibility.length > 500)
	) {
		report(
			file,
			"compatibility must be a non-empty string of at most 500 characters",
		);
	}

	for (const field of ["allowed-tools", "license"] as const) {
		if (
			frontmatter[field] !== undefined &&
			(typeof frontmatter[field] !== "string" ||
				frontmatter[field].length === 0)
		) {
			report(file, `${field} must be a non-empty string`);
		}
	}

	if (frontmatter.metadata !== undefined) {
		if (
			typeof frontmatter.metadata !== "object" ||
			frontmatter.metadata === null ||
			Array.isArray(frontmatter.metadata)
		) {
			report(file, "metadata must be a string-to-string mapping");
		} else if (
			Object.values(frontmatter.metadata).some(
				(value) => typeof value !== "string",
			)
		) {
			report(file, "metadata values must be strings");
		}
	}
}

function validateWorkspaceExamples(file: string, content: string): void {
	for (const match of content.matchAll(WORKSPACE_CREATE_EXAMPLE)) {
		const command = match[1];
		const missing: string[] = [];
		if (!/--(?:local|host)(?:\s|$)/.test(command))
			missing.push("--local/--host");
		if (!/--project(?:\s|$)/.test(command)) missing.push("--project");
		if (!/--name(?:\s|$)/.test(command)) missing.push("--name");
		if (!/--(?:branch|pr)(?:\s|$)/.test(command)) missing.push("--branch/--pr");
		if (missing.length > 0) {
			report(
				file,
				`workspace creation example is missing ${missing.join(", ")}: ${command}`,
			);
		}
	}
}

function validateOpenAiMetadata(skillDirectory: string): void {
	const file = path.join(skillDirectory, "agents", "openai.yaml");
	const isBundledSupersetSkill = skillDirectory.startsWith(
		path.join("plugins", "superset", "skills"),
	);
	if (!existsSync(file)) {
		if (isBundledSupersetSkill)
			report(file, "is required for bundled Superset skills");
		return;
	}

	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(readFileSync(file, "utf8"));
	} catch (error) {
		report(
			file,
			`has invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
		return;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		report(file, "must be a mapping");
		return;
	}

	const metadata = parsed as Record<string, unknown>;
	if (
		typeof metadata.interface !== "object" ||
		metadata.interface === null ||
		Array.isArray(metadata.interface)
	) {
		report(file, "must include an interface mapping");
		return;
	}

	const interfaceMetadata = metadata.interface as Record<string, unknown>;
	if (
		typeof interfaceMetadata.display_name !== "string" ||
		interfaceMetadata.display_name.length === 0
	) {
		report(file, "interface.display_name must be a non-empty string");
	}
	if (
		typeof interfaceMetadata.short_description !== "string" ||
		interfaceMetadata.short_description.length < 25 ||
		interfaceMetadata.short_description.length > 64
	) {
		report(file, "interface.short_description must be 25-64 characters");
	}

	const expectedInvocation = isBundledSupersetSkill
		? `$superset-${path.basename(skillDirectory)}`
		: `$${path.basename(skillDirectory)}`;
	if (
		typeof interfaceMetadata.default_prompt !== "string" ||
		!interfaceMetadata.default_prompt.includes(expectedInvocation)
	) {
		report(file, `interface.default_prompt must mention ${expectedInvocation}`);
	}
}

function validateSkill(skillDirectory: string): void {
	const file = path.join(skillDirectory, "SKILL.md");
	const content = readFileSync(file, "utf8");
	if (!content.startsWith("---\n")) {
		report(file, "must start with YAML frontmatter");
		return;
	}

	const frontmatterEnd = content.indexOf("\n---\n", 4);
	if (frontmatterEnd === -1) {
		report(file, "has no closing YAML frontmatter delimiter");
		return;
	}

	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(content.slice(4, frontmatterEnd));
	} catch (error) {
		report(
			file,
			`has invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
		return;
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		report(file, "frontmatter must be a mapping");
		return;
	}

	const frontmatter = parsed as Record<string, unknown>;
	for (const field of Object.keys(frontmatter)) {
		if (!ALLOWED_FRONTMATTER_FIELDS.has(field)) {
			report(file, `unsupported frontmatter field: ${field}`);
		}
	}

	const directoryName = path.basename(skillDirectory);
	if (frontmatter.name !== directoryName) {
		report(file, `name must match parent directory: ${directoryName}`);
	} else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directoryName)) {
		report(
			file,
			"name must contain only lowercase letters, digits, and single hyphens",
		);
	} else if (directoryName.length > 64) {
		report(file, "name must be at most 64 characters");
	}

	if (
		typeof frontmatter.description !== "string" ||
		frontmatter.description.length === 0 ||
		frontmatter.description.length > 1024
	) {
		report(
			file,
			"description must be a non-empty string of at most 1024 characters",
		);
	}

	validateOptionalFields(file, frontmatter);
	if (content.slice(frontmatterEnd + 5).trim().length === 0) {
		report(file, "must include skill instructions after the frontmatter");
	}
	validateWorkspaceExamples(file, content);
	validateOpenAiMetadata(skillDirectory);
}

for (const root of SKILL_ROOTS) {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		validateSkill(path.join(root, entry.name));
		skillCount += 1;
	}
}

if (problems.length > 0) {
	console.error(`Agent skill validation failed (${problems.length} problems):`);
	for (const problem of problems) console.error(`- ${problem}`);
	process.exit(1);
}

console.log(`Validated ${skillCount} Agent Skills.`);
