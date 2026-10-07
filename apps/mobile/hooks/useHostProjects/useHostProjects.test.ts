import { expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_MOBILE_PROJECT_ICON_FIXTURE !== "1") {
	test("mobile host project mapper runs without native/app/provider bootstrap", () => {
		const cwd = mkdtempSync("/tmp/superset-mobile-project-icon-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_MOBILE_PROJECT_ICON_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35000);
} else {
	const deny = () => {
		throw Error("Unexpected query/client/native bootstrap");
	};
	spyOn(globalThis, "fetch").mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	mock.module("@tanstack/react-query", () => ({ useQuery: deny }));
	mock.module("react", () => ({ useMemo: deny }));
	mock.module("@/lib/host-service/client", () => ({
		getHostServiceClientByUrl: deny,
		hostServiceUrl: deny,
	}));
	const { toHostProjectItem } = await import("./useHostProjects");
	const base = {
		id: "project",
		repoPath: "/tmp/Widget",
		repoOwner: "Group/Sub",
		repoName: "Widget",
		icon: null,
	};
	for (const identity of [
		{
			repoProvider: "gitlab",
			repoUrl: "https://git.example.invalid:8443/Group/Sub/Widget",
		},
		{ repoProvider: "gitlab", repoUrl: null },
		{
			repoProvider: null,
			repoUrl: "https://git.example.invalid/Group/Sub/Widget",
		},
		{ repoProvider: "github", repoUrl: "https://gitlab.com/Group/Widget" },
		{ repoProvider: null, repoUrl: "unrecognizable" },
		{ repoProvider: "other", repoUrl: null },
	])
		test(`native or unknown identity refuses GH avatar ${identity.repoProvider}:${identity.repoUrl}`, () => {
			expect(toHostProjectItem({ ...base, ...identity })).toMatchObject({
				name: "Widget",
				iconUrl: null,
				repoProvider: identity.repoProvider,
				repoUrl: identity.repoUrl,
			});
			expect(
				toHostProjectItem({
					...base,
					...identity,
					icon: "data:image/png;base64,AAAA",
				}).iconUrl,
			).toBe("data:image/png;base64,AAAA");
			expect(
				toHostProjectItem({ ...base, ...identity, icon: "none" }).iconUrl,
			).toBeNull();
		});
	for (const repoUrl of [
		null,
		"https://github.com/acme/widget",
		"git@github.com:acme/widget.git",
	])
		test(`existing genuine or legacy GH fallback ${repoUrl}`, () => {
			expect(
				toHostProjectItem({ ...base, repoOwner: "acme", repoUrl }).iconUrl,
			).toBe("https://github.com/acme.png?size=64");
			expect(
				toHostProjectItem({
					...base,
					repoOwner: "acme",
					repoUrl,
					repoProvider: "github",
				}).iconUrl,
			).toBe("https://github.com/acme.png?size=64");
		});
	test("old local-only rows keep fallback folder name and no image", () => {
		expect(
			toHostProjectItem({ id: "old", repoPath: "C:\\projects\\Folder" }),
		).toMatchObject({
			id: "old",
			name: "Folder",
			iconUrl: null,
			repoOwner: null,
			repoName: null,
			repoUrl: null,
		});
	});
	test("legacy GH explicit empty icon retains original nullish behavior", () => {
		expect(
			toHostProjectItem({
				...base,
				repoProvider: "github",
				repoOwner: "acme",
				repoUrl: "https://github.com/acme/Widget",
				icon: "",
			}).iconUrl,
		).toBe("");
	});
}
