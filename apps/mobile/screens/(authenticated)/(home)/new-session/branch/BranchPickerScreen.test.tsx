import { afterEach, expect, test } from "bun:test";
import {
	mobileCloudFixture,
	runMobileM2Child,
} from "../../hooks/useCloudCreateSelection/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual cloud branch screen in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileCloudFixture();
	const { BranchPickerScreen } = await f.branch();
	afterEach(async () => {
		await f.cleanup();
		f.reset();
	});
	test("native branches use org-bound clone and provider default without GH query", async () => {
		await f.render(BranchPickerScreen);
		expect(
			f.state.requests.find((r) => r.method === "native-branches")?.input,
		).toEqual({
			organizationId: "org-a",
			cloneUrl: f.project.cloneUrl,
			page: 1,
			query: undefined,
		});
		expect(f.state.requests.some((r) => r.method === "GH-branches")).toBe(
			false,
		);
		expect(document.body.textContent).toContain("trunk");
	});
	test("native branch search and load more are server-paged", async () => {
		await f.render(BranchPickerScreen);
		const input = f.state.inputs[0]?.onChangeText;
		if (typeof input !== "function") throw Error("search input missing");
		await f.React.act(async () => input("feature"));
		await f.settle();
		expect(f.state.requests.at(-1)?.input).toMatchObject({
			query: "feature",
			page: 1,
			cloneUrl: f.project.cloneUrl,
		});
		const more = f.state.presses.findLast(
			(p) => p.accessibilityLabel === "Load more",
		)?.onPress;
		if (typeof more !== "function") throw Error("native page control missing");
		f.state.branchReply = {
			defaultBranch: "trunk",
			items: [{ name: "second-page" }],
			nextPage: null,
		};
		await f.React.act(async () => more());
		await f.settle();
		expect(f.state.requests.at(-1)?.input).toMatchObject({ page: 2 });
		expect(document.body.textContent).toContain("second-page");
	});
	test("native branch failures are explicit retry instead of empty", async () => {
		f.state.branchReply = new Error("401");
		await f.render(BranchPickerScreen);
		await f.settle();
		expect(document.body.textContent).toContain(
			"Could not load branches. Try again.",
		);
		expect(document.body.textContent).not.toContain("No branches found");
	});
	test("native old branch row cannot select after environment change", async () => {
		await f.render(BranchPickerScreen);
		const old = f.state.presses.find(
			(p) => p["ph-label"] === "new-session-branch-row",
		)?.onPress;
		if (typeof old !== "function") throw Error("branch row missing");
		f.preferences.environmentId = "environment-other";
		f.state.environments = [
			{
				...f.nativeEnvironment,
				id: "environment-other",
				gitlabProject: {
					...f.project,
					cloneUrl: "https://git.example/Other/Repo.git",
					pathWithNamespace: "Other/Repo",
				},
			},
		];
		await f.React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.render(BranchPickerScreen);
		old();
		expect(f.preferences.baseBranch).toBeNull();
		expect(f.state.backs).toBe(0);
	});
	test("retained native branch choice is refused after cached failure or unmount", async () => {
		await f.render(BranchPickerScreen);
		const old = f.state.presses.find(
			(p) => p["ph-label"] === "new-session-branch-row",
		)?.onPress;
		if (typeof old !== "function") throw Error("branch choice missing");
		f.state.branchReply = new Error("503");
		await f.React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.render(BranchPickerScreen);
		old();
		expect(f.state.backs).toBe(0);
		expect(f.preferences.baseBranch).toBeNull();
		await f.cleanup();
		old();
		expect(f.state.backs).toBe(0);
	});
	test("GH branch query retains own input and cache key", async () => {
		f.state.environments = [f.githubEnvironment];
		f.preferences.environmentId = "environment-gh";
		await f.render(BranchPickerScreen);
		expect(
			f.state.requests.find((r) => r.method === "GH-branches")?.input,
		).toEqual({
			organizationId: "org-a",
			repositoryId: "repo-gh",
			query: undefined,
		});
		expect(
			f.client
				.getQueryCache()
				.getAll()
				.some(
					(q) =>
						JSON.stringify(q.queryKey) ===
						JSON.stringify([
							"cloud-branches",
							"branches",
							null,
							"cloud",
							"repo-gh",
							"",
						]),
				),
		).toBe(true);
	});
	test("native pending branches never declare empty", async () => {
		f.state.branchReply = new Promise(() => {});
		await f.render(BranchPickerScreen);
		expect(document.body.textContent).toContain("Owned spinner");
		expect(document.body.textContent).not.toContain("No branches found");
	});
	test("native cached failed branch refetch withholds old choices", async () => {
		await f.render(BranchPickerScreen);
		f.state.branchReply = new Error("503");
		await f.React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.render(BranchPickerScreen);
		expect(document.body.textContent).not.toContain("native-feature");
		expect(document.body.textContent).toContain(
			"Could not load branches. Try again.",
		);
	});
	test("native read retry preserves full provider input and does not select", async () => {
		f.state.branchReply = new Error("401");
		await f.render(BranchPickerScreen);
		await f.settle();
		const retry = f.state.presses.findLast(
			(p) => p.accessibilityLabel === "Try again",
		)?.onPress;
		if (typeof retry !== "function") throw Error("retry missing");
		f.state.branchReply = {
			defaultBranch: "trunk",
			items: [{ name: "trunk" }],
			nextPage: null,
		};
		await f.React.act(async () => retry());
		await f.settle();
		expect(
			f.state.requests.filter((r) => r.method === "native-branches").at(-1)
				?.input,
		).toEqual({
			organizationId: "org-a",
			cloneUrl: f.project.cloneUrl,
			query: undefined,
			page: 1,
		});
		expect(f.state.backs).toBe(0);
		expect(f.preferences.baseBranch).toBeNull();
		expect(document.body.textContent).toContain("trunk");
	});
}
