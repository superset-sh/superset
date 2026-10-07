import { expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own an isolated query fixture.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Remove the owned fixture directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";

if (process.env.SUPERSET_ISSUE_CAPABILITY_REFRESH !== "1") {
	test("issue capability refresh and offline targets keep truthful selection", () => {
		const cwd = mkdtempSync("/tmp/superset-issue-capability-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_ISSUE_CAPABILITY_REFRESH: "1",
					},
					stdio: "pipe",
					timeout: 20000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 25000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Issue capability network denied");
		},
		{ preconnect: () => {} },
	);
	const React = await import("react");
	const { renderHook, act, waitFor, cleanup } = await import(
		"@testing-library/react"
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	let release: (() => void) | undefined;
	let refreshing = false;
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: () => ({
			workspaceCreation: {
				getIssueSearchCapabilities: {
					query: async () => {
						if (refreshing)
							await new Promise<void>((resolve) => {
								release = resolve;
							});
						return [{ projectId: "native", provider: "gitlab" }];
					},
				},
			},
		}),
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets",
		() => ({
			groupProjectTargetsByHost: (
				targets: Array<{ projectId: string; hostUrl: string | null }>,
			) =>
				targets.map((target) => ({
					key: target.projectId,
					hostUrl: target.hostUrl,
					projects: [target],
				})),
		}),
	);
	mock.module("@superset/i18n/errors", () => ({
		errorMessage: (error: Error) => error.message,
	}));
	const { useIssueSearchSelection } = await import("./useIssueSearchSelection");
	test("cached native selection stays native during refresh; offline coverage settles unknown", async () => {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: 0 } },
		});
		const wrapper = ({ children }: { children?: React.ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		const native: ProjectQueryTarget = {
			projectId: "native",
			projectName: "Native",
			hostId: "online",
			hostUrl: "http://owned-host",
		};
		const targets = [native];
		const view = renderHook(
			({ items }) => useIssueSearchSelection(items, true),
			{ wrapper, initialProps: { items: targets } },
		);
		await waitFor(() => expect(view.result.current.mode).toBe("gitlab"));
		refreshing = true;
		let refresh!: Promise<unknown>;
		await act(async () => {
			refresh = client.invalidateQueries();
			await Promise.resolve();
		});
		await waitFor(() => expect(release).toBeDefined());
		expect(client.isFetching()).toBeGreaterThan(0);
		expect(view.result.current).toMatchObject({
			mode: "gitlab",
			pending: false,
		});
		await act(async () => {
			refreshing = false;
			release?.();
			await refresh;
		});
		view.rerender({
			items: [
				native,
				{
					projectId: "offline",
					projectName: "Offline",
					hostId: "offline",
					hostUrl: null,
				},
			],
		});
		await waitFor(() =>
			expect(view.result.current).toMatchObject({
				mode: "unknown",
				pending: false,
			}),
		);
		cleanup();
		client.clear();
	});
}
