import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// project-icons resolves its store from SUPERSET_HOME_DIR at import time, so the
// env has to be set before the module is loaded — hence the dynamic import.
let home: string;
let sources: string;
let icons: typeof import("./project-icons");

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "superset-icon-home-"));
	sources = await mkdtemp(join(tmpdir(), "superset-icon-src-"));
	process.env.SUPERSET_HOME_DIR = home;
	icons = await import("./project-icons");
});

afterAll(() => {
	rmSync(home, { recursive: true, force: true });
	rmSync(sources, { recursive: true, force: true });
});

async function writeSource(name: string, contents: string): Promise<string> {
	const sourcePath = join(sources, name);
	await writeFile(sourcePath, contents);
	return sourcePath;
}

describe("saveProjectIconFromFile", () => {
	test("copies a supported icon into the store", async () => {
		const sourcePath = await writeSource("logo.png", "icon-bytes");

		const url = await icons.saveProjectIconFromFile({
			projectId: "project-1",
			sourcePath,
		});

		expect(url).toContain("project-1");
		expect(await readdir(icons.PROJECT_ICONS_DIR)).toContain("project-1.png");
	});

	test("rejects an unsupported extension", async () => {
		const sourcePath = await writeSource("logo.webp", "icon-bytes");

		expect(
			icons.saveProjectIconFromFile({ projectId: "project-2", sourcePath }),
		).rejects.toThrow("Unsupported icon format");
	});

	test("rejects a source larger than the icon size cap", async () => {
		const sourcePath = await writeSource(
			"huge.png",
			"x".repeat(512 * 1024 + 1),
		);

		expect(
			icons.saveProjectIconFromFile({ projectId: "project-3", sourcePath }),
		).rejects.toThrow("too large");
	});

	test("rejects a directory dressed up as an icon", async () => {
		expect(
			icons.saveProjectIconFromFile({
				projectId: "project-4",
				sourcePath: sources,
			}),
		).rejects.toThrow("not a file");
	});

	test("checks the symlink target, not the link", async () => {
		const target = await writeSource("big-target.png", "x".repeat(512 * 1024 + 1));
		const linkPath = join(sources, "link.png");
		await symlink(target, linkPath);

		expect(
			icons.saveProjectIconFromFile({ projectId: "project-5", sourcePath: linkPath }),
		).rejects.toThrow("too large");
	});

	test("refuses a project id that is not a single path segment", async () => {
		const sourcePath = await writeSource("ok.png", "icon-bytes");

		for (const projectId of ["../escape", "nested/id", "..", ""]) {
			expect(
				icons.saveProjectIconFromFile({ projectId, sourcePath }),
			).rejects.toThrow("Invalid project id");
		}
	});
});
