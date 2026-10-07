import { expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolate DOM globals in a test subprocess.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: The test owns and removes its subprocess directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";

if (process.env.SUPERSET_PR_INTENT_FIXTURE !== "1") {
	test("the real React intent consumer preserves hosted merge requests", () => {
		const cwd = mkdtempSync("/tmp/superset-pr-intent-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_PR_INTENT_FIXTURE: "1",
					},
					stdio: "pipe",
					timeout: 15000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 20000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Intent fixture transport denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny test subprocess transport before app imports.
	const socket = await import("node:net");
	const denySocket = spyOn(
		socket.Socket.prototype,
		"connect",
	).mockImplementation(() => {
		throw new Error("Intent fixture socket denied");
	});
	const { usePullRequestPaneIntent } = await import(
		"../../../../../../../stores/pull-request-pane-intent"
	);
	mock.module("renderer/stores/pull-request-pane-intent", () => ({
		usePullRequestPaneIntent,
	}));
	expect(
		(await import("renderer/stores/pull-request-pane-intent"))
			.usePullRequestPaneIntent,
	).toBe(usePullRequestPaneIntent);
	const { usePullRequestPaneIntentOpener } = await import(
		"./usePullRequestPaneIntentOpener"
	);
	const { act, cleanup, renderHook } = await import("@testing-library/react");
	test("waits for its layout, consumes once and retains exact host/provider", async () => {
		const ref = {
			repoFullName: "team/sub/repo",
			number: 7,
			provider: "gitlab" as const,
			host: "gl.example:8443",
		};
		const open = mock((_ref: PullRequestRef) => {});
		usePullRequestPaneIntent
			.getState()
			.request({ workspaceId: "wanted", ...ref });
		const hook = renderHook(
			({ workspaceId, ready }) =>
				usePullRequestPaneIntentOpener({
					workspaceId,
					isLayoutReady: ready,
					openPullRequestPane: open,
				}),
			{ initialProps: { workspaceId: "other", ready: true } },
		);
		try {
			expect(open).not.toHaveBeenCalled();
			hook.rerender({ workspaceId: "wanted", ready: false });
			expect(open).not.toHaveBeenCalled();
			hook.rerender({ workspaceId: "wanted", ready: true });
			expect(open).toHaveBeenCalledTimes(1);
			expect(open).toHaveBeenCalledWith(ref);
			expect(usePullRequestPaneIntent.getState().intent).toBeNull();
			hook.rerender({ workspaceId: "wanted", ready: true });
			expect(open).toHaveBeenCalledTimes(1);
			const github = { repoFullName: "team/repo", number: 8 };
			act(() =>
				usePullRequestPaneIntent
					.getState()
					.request({ workspaceId: "wanted", ...github }),
			);
			expect(open).toHaveBeenLastCalledWith(github);
			expect(open).toHaveBeenCalledTimes(2);
		} finally {
			hook.unmount();
			cleanup();
			usePullRequestPaneIntent.setState({ intent: null });
			denySocket.mockRestore();
			await GlobalRegistrator.unregister();
		}
	});
}
