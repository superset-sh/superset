import { afterEach, expect, test } from "bun:test";
import {
	mobileCloudFixture,
	runMobileM2Child,
} from "../../../../../hooks/useCloudCreateSelection/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual cloud create in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileCloudFixture();
	let action: ReturnType<typeof f.create.useCreateCloudWorkspace>;
	const native = {
		organizationId: "org-a",
		environmentId: "environment-a",
		...f.project,
	};
	const args = {
		branch: "native-feature",
		environmentId: "environment-a",
		agent: "claude",
		model: null,
		effort: null,
		message: { text: "hello", attachments: [] },
		attachmentFileIds: [],
		gitlab: native,
	};
	function Probe() {
		action = f.create.useCreateCloudWorkspace();
		return null;
	}
	afterEach(async () => {
		await f.cleanup();
		f.reset();
	});
	test("native create sends authoritative clone only with complete binding", async () => {
		await f.render(Probe);
		await f.React.act(async () => {
			await action.mutateAsync(args);
		});
		expect(
			f.state.requests.find((r) => r.method === "workspace-create")?.input,
		).toMatchObject({
			organizationId: "org-a",
			environmentId: "environment-a",
			gitlabCloneUrl: f.project.cloneUrl,
			branch: "native-feature",
		});
	});
	test("retained native create cannot dispatch under changed org", async () => {
		await f.render(Probe);
		const old = action.mutateAsync;
		f.state.organizationId = "org-b";
		await f.render(Probe);
		await f.React.act(async () => {
			await old(args).catch(() => {});
		});
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
	});
	test("native completed create after unmount stays discoverable without navigation", async () => {
		let resolve!: (value: unknown) => void;
		f.state.createReply = new Promise((r) => (resolve = r));
		await f.render(Probe);
		let pending!: Promise<unknown>;
		await f.React.act(async () => {
			pending = action.mutateAsync(args).catch(() => {});
		});
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve({ id: "workspace-new" }));
		await pending.catch(() => {});
		expect(f.state.pushes).toEqual([]);
		expect(f.state.reviewCreates).toBe(1);
	});
	test("GH create retains original own-property payload", async () => {
		f.state.environments = [f.githubEnvironment];
		f.preferences.environmentId = "environment-gh";
		await f.render(Probe);
		const { gitlab, ...legacy } = args;
		await f.React.act(async () => {
			await action.mutateAsync({ ...legacy, environmentId: "environment-gh" });
		});
		const input = f.state.requests.find(
			(r) => r.method === "workspace-create",
		)?.input;
		expect(input).not.toHaveProperty("gitlabCloneUrl");
		expect(input).toEqual({
			organizationId: "org-a",
			environmentId: "environment-gh",
			prompt: "hello",
			branch: "native-feature",
			agent: "claude",
			model: undefined,
			effort: undefined,
		});
	});
	test("native create rejects mismatching project tuple before RPC", async () => {
		await f.render(Probe);
		await f.React.act(async () => {
			await action
				.mutateAsync({ ...args, gitlab: { ...native, projectId: "other" } })
				.catch(() => {});
		});
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
	});
	test("native create completion under another environment cannot navigate", async () => {
		let resolve!: (row: unknown) => void;
		f.state.createReply = new Promise((r) => (resolve = r));
		await f.render(Probe);
		let pending!: Promise<unknown>;
		await f.React.act(async () => {
			pending = action.mutateAsync(args).catch(() => {});
		});
		await f.settle();
		f.preferences.environmentId = "environment-other";
		f.state.environments = [
			{ ...f.nativeEnvironment, id: "environment-other" },
		];
		await f.React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.render(Probe);
		await f.React.act(async () => resolve({ id: "workspace-new" }));
		await pending.catch(() => {});
		expect(f.state.pushes).toEqual([]);
		expect(f.state.reviewCreates).toBe(1);
		expect(
			f.client.getQueryData(["cloud", "workspaces", "org-a"]),
		).toBeDefined();
	});
	test("native caller cannot omit genuine project binding", async () => {
		await f.render(Probe);
		const { gitlab, ...missing } = args;
		await f.React.act(async () => {
			await action.mutateAsync(missing).catch(() => {});
		});
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
	});
	test("native clone, instance, branch metadata and connection contradictions are refused", async () => {
		await f.render(Probe);
		for (const mismatch of [
			{ cloneUrl: "https://other.example/Group/Sub/Repo.git" },
			{ connectionId: "other-connection" },
			{ pathWithNamespace: "group/Sub/Repo" },
			{ defaultBranch: "other-default" },
		]) {
			await f.React.act(async () => {
				await action
					.mutateAsync({ ...args, gitlab: { ...native, ...mismatch } })
					.catch(() => {});
			});
		}
		expect(
			f.state.requests.filter((r) => r.method === "workspace-create"),
		).toEqual([]);
	});
}
