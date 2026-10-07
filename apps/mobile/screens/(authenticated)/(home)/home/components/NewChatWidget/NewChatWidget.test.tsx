import { afterEach, expect, test } from "bun:test";
import {
	mobileCloudFixture,
	runMobileM2Child,
} from "../../../hooks/useCloudCreateSelection/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual cloud composer in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileCloudFixture();
	const { NewChatWidget } = await f.widget();
	const Widget = () => f.React.createElement(NewChatWidget, { workspaces: [] });
	afterEach(async () => {
		await f.cleanup();
		f.reset();
	});
	test("native composer resolves provider branch and creates with genuine binding", async () => {
		await f.render(Widget);
		expect(f.state.requests.some((r) => r.method === "native-branches")).toBe(
			true,
		);
		expect(f.state.requests.some((r) => r.method === "GH-branches")).toBe(
			false,
		);
		const send = f.state.composer?.onSubmit;
		if (typeof send !== "function") throw Error("composer missing");
		await f.React.act(async () => send("hello"));
		await f.settle();
		expect(
			f.state.requests.find((r) => r.method === "workspace-create")?.input,
		).toMatchObject({
			organizationId: "org-a",
			environmentId: "environment-a",
			gitlabCloneUrl: f.project.cloneUrl,
			branch: "trunk",
		});
	});
	test("native attachment await cannot create after changed organization", async () => {
		let resolve!: (ids: string[]) => void;
		f.state.uploads = new Promise((r) => (resolve = r));
		await f.render(Widget);
		const send = f.state.composer?.onSubmit;
		if (typeof send !== "function") throw Error("composer missing");
		await f.React.act(async () => {
			send("hello");
		});
		await f.settle();
		f.state.organizationId = "org-b";
		await f.render(Widget);
		await f.React.act(async () => resolve([]));
		await f.settle();
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
		expect(f.state.clears).toBe(0);
	});
	test("GH composer query key and create clone absence retained", async () => {
		f.state.environments = [f.githubEnvironment];
		f.preferences.environmentId = "environment-gh";
		await f.render(Widget);
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
							"",
							"cloud",
							"repo-gh",
							"",
						]),
				),
		).toBe(true);
		const send = f.state.composer?.onSubmit;
		if (typeof send !== "function") throw Error("composer missing");
		await f.React.act(async () => send("hello"));
		await f.settle();
		expect(
			f.state.requests.find((r) => r.method === "workspace-create")?.input,
		).not.toHaveProperty("gitlabCloneUrl");
	});
	test("native attachment await owner unmount cannot dispatch or clear", async () => {
		let resolve!: (ids: string[]) => void;
		f.state.uploads = new Promise((r) => (resolve = r));
		await f.render(Widget);
		const send = f.state.composer?.onSubmit;
		if (typeof send !== "function") throw Error("composer missing");
		await f.React.act(async () => {
			send("hello");
		});
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve([]));
		await f.settle();
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
		expect(f.state.clears).toBe(0);
	});
	test("native failed attachment await after owner unmount is silent", async () => {
		let reject!: (error: Error) => void;
		f.state.uploads = new Promise((_resolve, fail) => (reject = fail));
		await f.render(Widget);
		const send = f.state.composer?.onSubmit;
		if (typeof send !== "function") throw Error("composer missing");
		let pending: unknown;
		await f.React.act(async () => {
			pending = send("hello");
		});
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => {
			reject(new Error("503"));
			await pending;
		});
		expect(f.state.alerts).toEqual([]);
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
	});
	test("native environment transition clears stale branch and label", async () => {
		f.preferences.baseBranch = "old-feature";
		await f.render(Widget);
		f.preferences.environmentId = "environment-other";
		f.state.environments = [
			{
				...f.nativeEnvironment,
				id: "environment-other",
				gitlabProject: {
					...f.project,
					cloneUrl: "https://git.example/Other/Repo.git",
					pathWithNamespace: "Other/Repo",
					defaultBranch: "develop",
				},
			},
		];
		f.state.branchReply = new Promise(() => {});
		await f.React.act(async () => {
			await f.client.invalidateQueries({
				predicate: (query) => query.queryKey.includes("environment"),
			});
		});
		await f.render(Widget);
		expect(f.preferences.baseBranch).toBeNull();
		const chips = f.state.composer?.headerChips;
		expect(chips).not.toContainEqual(
			expect.objectContaining({ id: "branch", label: "old-feature" }),
		);
	});
}
