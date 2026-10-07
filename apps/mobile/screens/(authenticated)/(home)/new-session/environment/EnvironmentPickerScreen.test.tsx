import { afterEach, expect, test } from "bun:test";
import {
	mobileCloudFixture,
	runMobileM2Child,
} from "../../hooks/useCloudCreateSelection/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual cloud environment and project picker in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileCloudFixture();
	const { EnvironmentPickerScreen } = await f.environment();
	afterEach(async () => {
		await f.cleanup();
		f.reset();
	});
	test("native bound project path is shown and picker queries authoritative projects", async () => {
		await f.render(EnvironmentPickerScreen);
		expect(document.body.textContent).toContain(f.project.pathWithNamespace);
		expect(
			f.state.requests.find((r) => r.method === "native-projects")?.input,
		).toEqual({ organizationId: "org-a", query: undefined, page: 1 });
	});
	test("native selected listed project creates exact environment and clears branch", async () => {
		f.preferences.baseBranch = "old";
		await f.render(EnvironmentPickerScreen);
		const row = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof row !== "function") throw Error("native project row missing");
		await f.React.act(async () => row());
		await f.settle();
		expect(
			f.state.requests.find((r) => r.method === "environment-create")?.input,
		).toMatchObject({
			organizationId: "org-a",
			name: f.project.pathWithNamespace,
			gitlabCloneUrl: f.project.cloneUrl,
		});
		expect(f.preferences.environmentId).toBe("environment-new");
		expect(f.preferences.baseBranch).toBeNull();
	});
	test("native project failed list renders error and explicit retry", async () => {
		f.state.projectReply = new Error("503");
		await f.render(EnvironmentPickerScreen);
		await f.settle();
		expect(document.body.textContent).toContain(
			"Could not load GitLab projects. Try again.",
		);
		expect(
			f.state.presses.some((p) => p.accessibilityLabel === "Try again"),
		).toBe(true);
	});
	test("native project row cannot retarget after org change or owner unmount", async () => {
		await f.render(EnvironmentPickerScreen);
		const row = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof row !== "function") throw Error("native project row missing");
		f.state.organizationId = "org-b";
		await f.render(EnvironmentPickerScreen);
		await f.React.act(async () => row());
		await f.settle();
		expect(
			f.state.requests.filter((r) => r.method === "environment-create"),
		).toEqual([]);
		await f.cleanup();
		row();
		expect(
			f.state.requests.filter((r) => r.method === "environment-create"),
		).toEqual([]);
	});
	test("native project search and further pages use authoritative server RPC", async () => {
		await f.render(EnvironmentPickerScreen);
		const change = f.state.inputs.find(
			(p) => p.placeholder === "Search GitLab projects...",
		)?.onChangeText;
		if (typeof change !== "function")
			throw Error("native project search missing");
		await f.React.act(async () => change("nested"));
		await f.settle();
		expect(f.state.requests.at(-1)?.input).toEqual({
			organizationId: "org-a",
			query: "nested",
			page: 1,
		});
		const more = f.state.presses.findLast(
			(p) => p.accessibilityLabel === "Load more",
		)?.onPress;
		if (typeof more !== "function") throw Error("native project page missing");
		f.state.projectReply = {
			items: [
				{
					...f.project,
					projectId: "18",
					cloneUrl: "https://git.example/Other/Repo.git",
					pathWithNamespace: "Other/Repo",
				},
			],
			nextPage: null,
		};
		await f.React.act(async () => more());
		await f.settle();
		expect(f.state.requests.at(-1)?.input).toMatchObject({
			page: 2,
			query: "nested",
		});
	});
	test("native project create completion after org switch cannot select", async () => {
		let resolve!: (row: unknown) => void;
		f.state.environmentCreateReply = new Promise((r) => (resolve = r));
		await f.render(EnvironmentPickerScreen);
		const row = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof row !== "function") throw Error("native project row missing");
		await f.React.act(async () => row());
		await f.settle();
		f.state.organizationId = "org-b";
		await f.render(EnvironmentPickerScreen);
		await f.React.act(async () => resolve({ id: "environment-new" }));
		await f.settle();
		expect(f.preferences.environmentId).toBe("environment-a");
		expect(f.state.backs).toBe(0);
	});
	test("native pending project list never declares empty", async () => {
		f.state.projectReply = new Promise(() => {});
		await f.render(EnvironmentPickerScreen);
		expect(document.body.textContent).toContain("Owned spinner");
		expect(document.body.textContent).not.toContain("No GitLab projects found");
	});
	test("native cached project failure removes rows and refuses retained choice", async () => {
		await f.render(EnvironmentPickerScreen);
		const old = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof old !== "function") throw Error("project row missing");
		f.state.projectReply = new Error("401");
		await f.React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.render(EnvironmentPickerScreen);
		old();
		await f.settle();
		expect(
			f.state.requests.filter((r) => r.method === "environment-create"),
		).toEqual([]);
		expect(document.body.textContent).toContain(
			"Could not load GitLab projects. Try again.",
		);
	});
	test("native project create after owner unmount does not select or alert", async () => {
		let resolve!: (row: unknown) => void;
		f.state.environmentCreateReply = new Promise((r) => (resolve = r));
		await f.render(EnvironmentPickerScreen);
		const old = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof old !== "function") throw Error("project row missing");
		await f.React.act(async () => old());
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve({ id: "environment-new" }));
		await f.settle();
		expect(f.preferences.environmentId).toBe("environment-a");
		expect(f.state.backs).toBe(0);
		expect(f.state.alerts).toEqual([]);
	});
	test("native project create request clamps server name and prevents double tap", async () => {
		const project = {
			...f.project,
			pathWithNamespace: `Nested/${"r".repeat(150)}`,
		};
		f.state.projectReply = { items: [project], nextPage: null };
		let resolve!: (row: unknown) => void;
		f.state.environmentCreateReply = new Promise((r) => (resolve = r));
		await f.render(EnvironmentPickerScreen);
		const row = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof row !== "function") throw Error("project row missing");
		await f.React.act(async () => {
			row();
			row();
		});
		await f.settle();
		const requests = f.state.requests.filter(
			(r) => r.method === "environment-create",
		);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.input).toEqual({
			organizationId: "org-a",
			name: project.pathWithNamespace.slice(0, 100),
			gitlabCloneUrl: project.cloneUrl,
		});
		await f.React.act(async () => resolve({ id: "environment-new" }));
		await f.settle();
	});

	test("native project metadata change during create revokes completion", async () => {
		let resolve!: (row: unknown) => void;
		f.state.environmentCreateReply = new Promise((r) => (resolve = r));
		await f.render(EnvironmentPickerScreen);
		const row = f.state.presses.find(
			(p) => p["ph-label"] === "gitlab-environment-project",
		)?.onPress;
		if (typeof row !== "function") throw Error("project row missing");
		await f.React.act(async () => row());
		await f.settle();
		f.state.projectReply = {
			items: [
				{
					...f.project,
					connectionId: "connection-replaced",
					cloneUrl: "https://other.example/Group/Sub/Repo.git",
				},
			],
			nextPage: null,
		};
		await f.React.act(async () => {
			await f.client.invalidateQueries({
				predicate: (q) => q.queryKey.includes("gitlab-projects"),
			});
		});
		await f.render(EnvironmentPickerScreen);
		await f.React.act(async () => resolve({ id: "environment-new" }));
		await f.settle();
		expect(f.preferences.environmentId).toBe("environment-a");
		expect(f.state.backs).toBe(0);
	});

	test("cached mixed environment failure revokes retained native row while GH remains selected", async () => {
		f.state.environments = [f.githubEnvironment, f.nativeEnvironment];
		f.preferences.environmentId = "environment-gh";
		await f.render(EnvironmentPickerScreen);
		const rows = f.state.presses.filter(
			(p) => p["ph-label"] === "new-session-environment-row",
		);
		const old = rows.at(-1)?.onPress;
		if (typeof old !== "function") throw Error("native env row missing");
		f.state.environmentReply = new Error("503");
		await f.React.act(async () => {
			await f.client.invalidateQueries({
				predicate: (q) => q.queryKey.includes("environment"),
			});
		});
		await f.render(EnvironmentPickerScreen);
		old();
		await f.settle();
		expect(f.preferences.environmentId).toBe("environment-gh");
		expect(f.state.backs).toBe(0);
		expect(document.body.textContent).toContain("GitHub");
		expect(document.body.textContent).toContain("Native");
		const refreshed = f.state.presses.filter(
			(p) => p["ph-label"] === "new-session-environment-row",
		);
		expect(refreshed).toHaveLength(2);
		expect(refreshed[1]?.disabled).toBe(true);
		expect(refreshed[0]?.disabled).toBe(false);
		const github = refreshed[0]?.onPress;
		if (typeof github !== "function") throw Error("cachedGitHub row missing");
		github();
		await f.settle();
		expect(f.preferences.environmentId).toBe("environment-gh");
		expect(f.state.backs).toBe(1);
	});
}
