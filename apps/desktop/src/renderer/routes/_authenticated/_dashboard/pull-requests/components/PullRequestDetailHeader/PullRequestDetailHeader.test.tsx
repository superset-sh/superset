import { expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own an isolated header fixture.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Remove the owned fixture directory.
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_PROVIDER_HEADER !== "1") {
	test("MR header has correct provider external label and icon", () => {
		const cwd = mkdtempSync("/tmp/superset-provider-header-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_PROVIDER_HEADER: "1",
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
	const React = await import("react");
	const { render, cleanup, fireEvent, act, waitFor } = await import(
		"@testing-library/react"
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	mock.module("@lingui/react/macro", () => ({
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
		Trans: ({ children }: { children: React.ReactNode }) => children,
	}));
	mock.module("react-icons/fa", () => ({
		FaGithub: () => <span>GitHub icon</span>,
		FaGitlab: () => <span>GitLab icon</span>,
	}));
	mock.module("renderer/hooks/useCopyToClipboard", () => ({
		useCopyToClipboard: () => ({ copyToClipboard: () => {}, copied: false }),
	}));
	mock.module("renderer/hooks/useOpenNewWorkspace", () => ({
		useOpenNewWorkspace: () => () => {},
	}));
	const calls: unknown[] = [];
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: () => ({
			pullRequests: {
				mergePR: {
					mutate: async (input: unknown) => {
						calls.push(input);
						return { merged: true };
					},
				},
				setState: {
					mutate: async (input: unknown) => {
						calls.push(input);
					},
				},
			},
		}),
	}));
	mock.module("renderer/stores/new-workspace-draft", () => ({
		useNewWorkspaceDraftStore: () => () => {},
	}));
	mock.module("../../hooks/usePullRequestDetail", () => ({
		useInvalidatePullRequestDetail: () => () => {},
	}));
	mock.module("renderer/screens/main/components/PRIcon", () => ({
		normalizePRState: () => "open",
		PRIcon: () => null,
	}));
	const View = ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	);
	mock.module("@superset/ui/dropdown-menu", () => ({
		DropdownMenu: View,
		DropdownMenuContent: View,
		DropdownMenuItem: ({
			children,
			onClick,
		}: {
			children?: React.ReactNode;
			onClick?: () => void;
		}) => (
			<button type="button" onClick={onClick}>
				{children}
			</button>
		),
		DropdownMenuLabel: View,
		DropdownMenuSeparator: View,
		DropdownMenuTrigger: View,
	}));
	mock.module("@superset/ui/alert-dialog", () => ({
		AlertDialog: ({
			children,
			open,
		}: {
			children?: React.ReactNode;
			open: boolean;
		}) => (open ? <div role="dialog">{children}</div> : null),
		AlertDialogAction: ({
			children,
			onClick,
		}: {
			children?: React.ReactNode;
			onClick?: () => void;
		}) => (
			<button type="button" onClick={onClick}>
				{children}
			</button>
		),
		AlertDialogDescription: View,
		AlertDialogFooter: View,
		AlertDialogHeader: View,
		AlertDialogTitle: View,
		EnterEnabledAlertDialogContent: View,
	}));
	const { PullRequestDetailHeader } = await import("./PullRequestDetailHeader");
	test.each([
		[
			"https://git.example/team/repo/-/merge_requests/7",
			"Open in GitLab",
			"GitLab icon",
			"GitHub icon",
		],
		[
			"https://github.com/team/repo/pull/7",
			"Open pull request in GitHub",
			"GitHub icon",
			"GitLab icon",
		],
	])("provider from %s retains matching external link", (url, label, icon, wrongIcon) => {
		const client = new QueryClient();
		const data = {
			number: 7,
			url,
			title: "Change",
			repoFullName: "team/repo",
			state: "open",
			isDraft: false,
			author: null,
			head: { ref: "feature" },
			base: { ref: "main" },
			createdAt: "",
			updatedAt: "",
			checks: [],
			checksStatus: null,
			reviewDecision: null,
			body: "",
		};
		const view = render(
			<QueryClientProvider client={client}>
				<PullRequestDetailHeader
					projectId={null}
					hostId={null}
					hostUrl={null}
					prNumber={7}
					data={data as never}
					isLoading={false}
				/>
			</QueryClientProvider>,
		);
		expect(view.getByRole("link", { name: label }).getAttribute("href")).toBe(
			url,
		);
		expect(view.getByText(icon)).toBeTruthy();
		expect(view.queryByText(wrongIcon)).toBeNull();
		cleanup();
		client.clear();
	});
	test.each([
		"https://git.example/team/repo/-/merge_requests/7",
		"https://github.com/team/repo/pull/7",
	])("merge of %s retains the captured canonical native URL and legacy input", async (url) => {
		calls.length = 0;
		const client = new QueryClient();
		const data = {
			number: 7,
			url,
			title: "Change",
			repoFullName: "team/repo",
			state: "open",
			isDraft: false,
			author: null,
			head: { ref: "feature" },
			base: { ref: "main" },
			createdAt: "",
			updatedAt: "",
			checks: [],
			checksStatus: null,
			reviewDecision: null,
			body: "",
		};
		const view = render(
			<QueryClientProvider client={client}>
				<PullRequestDetailHeader
					projectId="project"
					hostId="host"
					hostUrl="http://owned-host"
					prNumber={7}
					data={data as never}
					isLoading={false}
				/>
			</QueryClientProvider>,
		);
		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: /Merge commit/ }));
		});
		const dialog = view.getByRole("dialog");
		const confirm = Array.from(dialog.querySelectorAll("button")).find(
			(button) => button.textContent === "Merge pull request",
		);
		if (!confirm) throw Error("Merge confirmation missing");
		await act(async () => {
			fireEvent.click(confirm);
		});
		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]).toEqual({
			projectId: "project",
			prNumber: 7,
			mergeMethod: "merge",
			commitMessage: undefined,
			...(url.includes("/-/merge_requests/") ? { expectedUrl: url } : {}),
		});
		cleanup();
		client.clear();
	});
}
