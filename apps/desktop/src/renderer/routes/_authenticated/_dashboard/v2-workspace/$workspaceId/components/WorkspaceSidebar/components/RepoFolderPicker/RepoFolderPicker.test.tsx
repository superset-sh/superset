import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeRepo {
	folder: string;
	path: string;
	projectId: string;
	repository: string | null;
	branch: string;
	base: string | null;
}

function repo(folder: string): FakeRepo {
	return {
		folder,
		path: `/w/${folder}`,
		projectId: `p-${folder}`,
		repository: `acme/${folder}`,
		branch: "feature",
		base: "main",
	};
}

interface FakeStatus {
	againstBase: { path: string; additions: number; deletions: number }[];
	staged: never[];
	unstaged: never[];
}

let workspaceData: { worktreePath: string; repos: FakeRepo[] } = {
	worktreePath: "/w/api",
	repos: [repo("api")],
};
let statusByFolder: Record<string, FakeStatus> = {};

mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		workspace: {
			get: { useQuery: () => ({ data: workspaceData, isLoading: false }) },
		},
		useQueries: (
			build: (t: {
				git: {
					getStatus: (input: { repo?: string }) => { data?: FakeStatus };
				};
			}) => { data?: FakeStatus }[],
		) =>
			build({
				git: {
					getStatus: (input) => ({
						data: input.repo ? statusByFolder[input.repo] : undefined,
					}),
				},
			}),
	},
}));

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { RepoFolderPicker } = await import("./RepoFolderPicker");
const { useSelectedRepoStore } = await import(
	"../../../../state/selectedRepoStore"
);

beforeEach(() => {
	useSelectedRepoStore.setState({ folders: {} });
	workspaceData = { worktreePath: "/w/api", repos: [repo("api")] };
	statusByFolder = {};
});
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("RepoFolderPicker", () => {
	test("renders nothing for a single-repo workspace", () => {
		const { container } = render(<RepoFolderPicker workspaceId="ws-1" />);

		expect(container.innerHTML).toBe("");
	});

	test("shows the primary folder for a multi-repo workspace", () => {
		workspaceData = {
			worktreePath: "/w/api",
			repos: [repo("api"), repo("web")],
		};
		render(<RepoFolderPicker workspaceId="ws-1" />);

		expect(
			within(document.body).getByRole("button", { name: "Change folder" })
				.textContent,
		).toContain("api");
	});

	test("choosing a folder in the menu selects it", async () => {
		workspaceData = {
			worktreePath: "/w/api",
			repos: [repo("api"), repo("web")],
		};
		render(<RepoFolderPicker workspaceId="ws-1" />);
		const page = within(document.body);

		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "Change folder" }));
		});
		await act(async () => {
			fireEvent.click(page.getByText("acme/web"));
		});

		expect(useSelectedRepoStore.getState().folders["ws-1"]).toBe("web");
	});

	test("lists a per-folder changed-file count once status is known", async () => {
		workspaceData = {
			worktreePath: "/w/api",
			repos: [repo("api"), repo("web")],
		};
		statusByFolder = {
			web: {
				againstBase: [
					{ path: "a.ts", additions: 1, deletions: 0 },
					{ path: "b.ts", additions: 2, deletions: 1 },
				],
				staged: [],
				unstaged: [],
			},
		};
		render(<RepoFolderPicker workspaceId="ws-1" />);
		const page = within(document.body);

		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "Change folder" }));
		});

		expect(page.getByTitle("Changed files").textContent).toBe("2");
	});
});
