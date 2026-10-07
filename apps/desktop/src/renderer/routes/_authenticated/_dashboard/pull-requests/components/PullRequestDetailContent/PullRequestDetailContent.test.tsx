import { expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own an isolated browser fixture.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Remove the owned fixture directory.
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_PR_DETAIL_REMOUNT !== "1") {
	test("MR composer draft resets for complete identity changes", () => {
		const cwd = mkdtempSync("/tmp/superset-mr-remount-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_PR_DETAIL_REMOUNT: "1",
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
			throw Error("MR remount network denied");
		},
		{ preconnect: () => {} },
	);
	const React = await import("react");
	const { render, fireEvent, cleanup } = await import("@testing-library/react");
	mock.module("@lingui/react/macro", () => ({
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
	}));
	mock.module("@superset/ui/utils", () => ({
		cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
	}));
	mock.module("../../../components/WorkItemDetailState", () => ({
		WorkItemDetailState: () => null,
	}));
	mock.module("../../utils/combinePullRequestReadErrors", () => ({
		pullRequestReadErrorMessage: () => "error",
	}));
	mock.module("../PullRequestSummaryContent", () => ({
		PullRequestSummaryContent: () => null,
	}));
	function ComposerFixture() {
		const [draft, setDraft] = React.useState("");
		return (
			<input
				aria-label="draft"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
			/>
		);
	}
	mock.module("../PullRequestCodeTab", () => ({
		PullRequestCodeTab: ComposerFixture,
	}));
	const { PullRequestDetailContent } = await import(
		"./PullRequestDetailContent"
	);
	test("same instance retains draft; host, project and provider changes remount it", () => {
		const initial = {
			activeTab: "code" as const,
			expectedRef: {
				provider: "gitlab" as const,
				host: "git-a.example",
				repoFullName: "team/repo",
				number: 7,
			},
			projectId: "project-a",
			hostUrl: "http://host-a",
			hostId: "host",
			prNumber: 7,
			repoFullName: "team/repo",
			detail: {
				data: {
					url: "https://git-a.example/team/repo/-/merge_requests/7",
				} as never,
				isLoading: false,
				error: null,
				refetch: () => {},
			},
		};
		const view = render(<PullRequestDetailContent {...initial} />);
		const input = () => view.getByLabelText("draft") as HTMLInputElement;
		fireEvent.change(input(), { target: { value: "belongs to A" } });
		view.rerender(<PullRequestDetailContent {...initial} />);
		expect(input().value).toBe("belongs to A");
		const onB = {
			...initial,
			expectedRef: { ...initial.expectedRef, host: "git-b.example" },
		};
		view.rerender(<PullRequestDetailContent {...onB} />);
		expect(input().value).toBe("");
		fireEvent.change(input(), { target: { value: "belongs to B" } });
		const projectB = { ...onB, projectId: "project-b" };
		view.rerender(<PullRequestDetailContent {...projectB} />);
		expect(input().value).toBe("");
		fireEvent.change(input(), { target: { value: "belongs to project B" } });
		const hostB = { ...projectB, hostUrl: "http://host-b" };
		view.rerender(<PullRequestDetailContent {...hostB} />);
		expect(input().value).toBe("");
		fireEvent.change(input(), { target: { value: "belongs to host B" } });
		view.rerender(
			<PullRequestDetailContent {...hostB} expectedRef={undefined} />,
		);
		expect(input().value).toBe("");
		cleanup();
	});
}
