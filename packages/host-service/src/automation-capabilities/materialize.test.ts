import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { strToU8, zipSync } from "fflate";
import { materializeAutomationCapabilities } from "./materialize";

function zipDataUrl(files: Record<string, string>) {
	const zipped = zipSync(
		Object.fromEntries(
			Object.entries(files).map(([filename, content]) => [
				filename,
				strToU8(content),
			]),
		),
	);
	const buffer = Buffer.from(zipped);
	const sha = createHash("sha256").update(buffer).digest("hex");
	return {
		url: `data:application/zip;base64,${buffer.toString("base64")}`,
		sha,
	};
}

function zipBuffer(files: Record<string, string>) {
	const zipped = zipSync(
		Object.fromEntries(
			Object.entries(files).map(([filename, content]) => [
				filename,
				strToU8(content),
			]),
		),
	);
	const buffer = Buffer.from(zipped);
	return {
		buffer,
		sha: createHash("sha256").update(buffer).digest("hex"),
	};
}

function commandsDigest(commands: string[]) {
	return createHash("sha256").update(JSON.stringify(commands)).digest("hex");
}

describe("materializeAutomationCapabilities", () => {
	test("writes Skill packages under the Automation capability directory", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "superset-capabilities-"));
		const archive = zipDataUrl({
			"superset.capability.json": JSON.stringify({
				manifestVersion: 1,
				id: "review-sop",
				type: "skill",
				name: "Review SOP",
				version: "1.0.0",
				entry: "skill",
				skill: { entryFile: "SKILL.md", targets: ["codex"] },
			}),
			"skill/SKILL.md": "# Review SOP",
		});

		try {
			const result = await materializeAutomationCapabilities({
				automationDirectory: root,
				capabilities: [
					{
						capabilityId: "11111111-1111-4111-8111-111111111111",
						capabilityVersionId: "22222222-2222-4222-8222-222222222222",
						type: "skill",
						slug: "review-sop",
						name: "Review SOP",
						version: "1.0.0",
						manifest: {
							type: "skill",
							entry: "skill",
							skill: { entryFile: "SKILL.md", targets: ["codex"] },
						},
						artifactUrl: archive.url,
						artifactSha256: archive.sha,
						config: {},
						displayOrder: 0,
					},
				],
			});

			const skillPath = path.join(
				root,
				"capabilities",
				"skills",
				"review-sop",
				"SKILL.md",
			);
			expect(existsSync(skillPath)).toBe(true);
			expect(readFileSync(skillPath, "utf-8")).toContain("Review SOP");
			expect(result.capabilities[0]?.path).toBe(path.dirname(skillPath));
			expect(result.manifestPath).toStartWith(path.join(root, "capabilities"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reuses a matching CLI install on the second materialization", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "superset-capabilities-"));
		const archive = zipDataUrl({
			"superset.capability.json": JSON.stringify({
				manifestVersion: 1,
				id: "weibo-hot",
				type: "cli",
				name: "Weibo Hot Search",
				version: "0.3.1",
				entry: "tool",
				cli: {
					install: {
						strategy: "shell",
						commands: [
							"mkdir -p .superset-python && printf ok > .superset-python/marker",
						],
					},
					commands: [{ name: "weibo-hot", bin: "weibo-hot" }],
					env: [],
					network: true,
				},
			}),
			"tool/package.json": "{}",
		});
		const capability = {
			capabilityId: "11111111-1111-4111-8111-111111111111",
			capabilityVersionId: "22222222-2222-4222-8222-222222222222",
			type: "cli" as const,
			slug: "weibo-hot",
			name: "Weibo Hot Search",
			version: "0.3.1",
			manifest: {
				type: "cli",
				entry: "tool",
				cli: {
					install: {
						strategy: "shell",
						commands: [
							"mkdir -p .superset-python && printf ok > .superset-python/marker",
						],
					},
					commands: [{ name: "weibo-hot", bin: "weibo-hot" }],
					env: [],
					network: true,
				},
			},
			artifactUrl: archive.url,
			artifactSha256: archive.sha,
			config: {},
			displayOrder: 0,
		};

		try {
			const first = await materializeAutomationCapabilities({
				automationDirectory: root,
				capabilities: [capability],
			});
			const second = await materializeAutomationCapabilities({
				automationDirectory: root,
				capabilities: [capability],
			});

			expect(first.capabilities[0]?.status).toBe("installed");
			expect(second.capabilities[0]?.status).toBe("reused");
			expect(second.pathEntries[0]).toBe(
				path.join(root, "capabilities", "tools", "weibo-hot", "bin"),
			);
			expect(
				readFileSync(
					path.join(
						root,
						"capabilities",
						"tools",
						"weibo-hot",
						"package",
						".superset-python",
						"marker",
					),
					"utf-8",
				),
			).toBe("ok");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reinstalls legacy CLI state that may be missing package-local install artifacts", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "superset-capabilities-"));
		const installCommands = [
			"mkdir -p .superset-python && printf ok > .superset-python/marker",
		];
		const archive = zipDataUrl({
			"superset.capability.json": JSON.stringify({
				manifestVersion: 1,
				id: "weibo-hot",
				type: "cli",
				name: "Weibo Hot Search",
				version: "0.3.1",
				entry: "tool",
				cli: {
					install: {
						strategy: "shell",
						commands: installCommands,
					},
					commands: [{ name: "weibo-hot", bin: "weibo-hot" }],
					env: [],
					network: true,
				},
			}),
			"tool/package.json": "{}",
		});
		const capability = {
			capabilityId: "11111111-1111-4111-8111-111111111111",
			capabilityVersionId: "22222222-2222-4222-8222-222222222222",
			type: "cli" as const,
			slug: "weibo-hot",
			name: "Weibo Hot Search",
			version: "0.3.1",
			manifest: {
				type: "cli",
				entry: "tool",
				cli: {
					install: {
						strategy: "shell",
						commands: installCommands,
					},
					commands: [{ name: "weibo-hot", bin: "weibo-hot" }],
					env: [],
					network: true,
				},
			},
			artifactUrl: archive.url,
			artifactSha256: archive.sha,
			config: {},
			displayOrder: 0,
		};

		try {
			const toolDirectory = path.join(
				root,
				"capabilities",
				"tools",
				"weibo-hot",
			);
			const packageDirectory = path.join(toolDirectory, "package");
			mkdirSync(packageDirectory, { recursive: true });
			writeFileSync(path.join(packageDirectory, "package.json"), "{}");
			writeFileSync(
				path.join(toolDirectory, "install-state.json"),
				JSON.stringify(
					{
						status: "installed",
						artifactSha256: archive.sha,
						commandsHash: commandsDigest(installCommands),
						installedAt: new Date(0).toISOString(),
					},
					null,
					2,
				),
			);

			const result = await materializeAutomationCapabilities({
				automationDirectory: root,
				capabilities: [capability],
			});

			expect(result.capabilities[0]?.status).toBe("installed");
			expect(
				readFileSync(
					path.join(packageDirectory, ".superset-python", "marker"),
					"utf-8",
				),
			).toBe("ok");
			expect(
				JSON.parse(
					readFileSync(path.join(toolDirectory, "install-state.json"), "utf-8"),
				),
			).toMatchObject({ installStateVersion: 2, status: "installed" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("materializes packages from development file artifact URLs", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "superset-capabilities-"));
		const archive = zipBuffer({
			"superset.capability.json": JSON.stringify({
				manifestVersion: 1,
				id: "twitter-spacex-cli",
				type: "cli",
				name: "Twitter SpaceX CLI",
				version: "0.8.6",
				entry: "tool",
				cli: {
					install: { strategy: "none", commands: [] },
					commands: [{ name: "twitter-spacex", bin: "twitter-spacex" }],
					env: [],
					network: true,
				},
			}),
			"tool/package.json": "{}",
		});
		const archivePath = path.join(root, "twitter-spacex-cli.zip");
		writeFileSync(archivePath, archive.buffer);

		try {
			const result = await materializeAutomationCapabilities({
				automationDirectory: root,
				capabilities: [
					{
						capabilityId: "11111111-1111-4111-8111-111111111111",
						capabilityVersionId: "22222222-2222-4222-8222-222222222222",
						type: "cli",
						slug: "twitter-spacex-cli",
						name: "Twitter SpaceX CLI",
						version: "0.8.6",
						manifest: {
							type: "cli",
							entry: "tool",
							cli: {
								install: { strategy: "none", commands: [] },
								commands: [{ name: "twitter-spacex", bin: "twitter-spacex" }],
								env: [],
								network: true,
							},
						},
						artifactUrl: pathToFileURL(archivePath).toString(),
						artifactSha256: archive.sha,
						config: {},
						displayOrder: 0,
					},
				],
			});

			expect(result.capabilities[0]?.status).toBe("installed");
			expect(result.capabilities[0]?.slug).toBe("twitter-spacex-cli");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("makes package bin entrypoints executable for generated CLI shims", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "superset-capabilities-"));
		const archive = zipDataUrl({
			"superset.capability.json": JSON.stringify({
				manifestVersion: 1,
				id: "twitter-spacex-cli",
				type: "cli",
				name: "Twitter SpaceX CLI",
				version: "0.8.6",
				entry: "tool",
				cli: {
					install: { strategy: "none", commands: [] },
					commands: [{ name: "twitter-spacex", bin: "twitter-spacex" }],
					env: [],
					network: true,
				},
			}),
			"tool/bin/twitter-spacex": "#!/bin/sh\necho spacex\n",
		});

		try {
			await materializeAutomationCapabilities({
				automationDirectory: root,
				capabilities: [
					{
						capabilityId: "11111111-1111-4111-8111-111111111111",
						capabilityVersionId: "22222222-2222-4222-8222-222222222222",
						type: "cli",
						slug: "twitter-spacex-cli",
						name: "Twitter SpaceX CLI",
						version: "0.8.6",
						manifest: {
							type: "cli",
							entry: "tool",
							cli: {
								install: { strategy: "none", commands: [] },
								commands: [{ name: "twitter-spacex", bin: "twitter-spacex" }],
								env: [],
								network: true,
							},
						},
						artifactUrl: archive.url,
						artifactSha256: archive.sha,
						config: {},
						displayOrder: 0,
					},
				],
			});

			const output = execFileSync(
				path.join(
					root,
					"capabilities",
					"tools",
					"twitter-spacex-cli",
					"bin",
					"twitter-spacex",
				),
				{ encoding: "utf-8" },
			);

			expect(output.trim()).toBe("spacex");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
