import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual mobile consumer in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	afterEach(f.cleanup);
	f.setupScreen(new URL("./WorkspaceScreen.tsx", import.meta.url));
	const { WorkspaceScreen } = await f.loadConsumer(
		new URL("./WorkspaceScreen.tsx", import.meta.url),
	);
	test("actual native composer chip callback retains full identity", async () => {
		f.state.rows = [f.nativeRow];
		await f.render(WorkspaceScreen);
		expect(f.state.composer).not.toBeNull();
		const press = f.state.composer?.onQuickKeysActionPress;
		if (typeof press !== "function") throw Error("composer callback missing");
		press();
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]",
			params: {
				id: "workspace",
				pullRequestId: "17",
				owner: "Group/Sub",
				repo: "Repo",
				provider: "gitlab",
				expectedUrl: f.nativeUrl,
			},
		});
	});
	test("actual GH chip retains its distinct original route keys", async () => {
		f.state.rows = [f.githubRow];
		await f.render(WorkspaceScreen);
		const press = f.state.composer?.onQuickKeysActionPress;
		if (typeof press !== "function") throw Error("composer callback missing");
		press();
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]",
			params: { id: "workspace", pullRequestId: "17" },
		});
	});
	test("multiple chips preserve history route", async () => {
		f.state.rows = [f.nativeRow, f.githubRow];
		await f.render(WorkspaceScreen);
		const press = f.state.composer?.onQuickKeysActionPress;
		if (typeof press !== "function") throw Error("composer callback missing");
		press();
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-requests",
			params: { id: "workspace" },
		});
	});
	test("contradictory native chip cannot open a GH route", async () => {
		f.state.rows = [{ ...f.nativeRow, repoName: "Other" }];
		await f.render(WorkspaceScreen);
		const press = f.state.composer?.onQuickKeysActionPress;
		if (typeof press !== "function") throw Error("composer callback missing");
		press();
		expect(f.state.pushes).toEqual([]);
	});
}
