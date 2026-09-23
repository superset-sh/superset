import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { DropdownMenu, DropdownMenuContent } = await import(
	"@superset/ui/dropdown-menu"
);
const { SourceFolderRow } = await import("./components/SourceFolderRow");
const { SourceFolderMenuItems } = await import(
	"./components/SourceFolderRow/components/SourceFolderMenuItems"
);
const { toSourceFolders, withoutFolder, withPrimaryFolder } = await import(
	"./SourceFoldersSection.utils"
);

interface ProjectFolderShape {
	id: string;
	projectId: string;
	position: number;
	folder: string;
	repoPath: string | null;
	repoUrl: string | null;
	baseBranch: string | null;
}

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function folder(
	id: string,
	name: string,
	position: number,
): ProjectFolderShape {
	return {
		id,
		projectId: "project-1",
		position,
		folder: name,
		repoPath: `/repos/${name}`,
		repoUrl: null,
		baseBranch: null,
	};
}

const FOLDERS: ProjectFolderShape[] = [
	folder("f-api", "api", 0),
	folder("f-web", "web", 1),
];

async function renderList(folders: ProjectFolderShape[]) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			folders.map((entry) => (
				<SourceFolderRow
					key={entry.id}
					folder={entry}
					isPrimary={entry.position === 0}
					onMakePrimary={() => {}}
					onRename={() => {}}
					onRemove={() => {}}
				/>
			)),
		);
	});
	return within(view.baseElement as HTMLElement);
}

async function renderMenu(isPrimary: boolean, canRenameFolder = true) {
	const onRemove = mock(() => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<DropdownMenu open>
				<DropdownMenuContent>
					<SourceFolderMenuItems
						isPrimary={isPrimary}
						onMakePrimary={() => {}}
						onRename={canRenameFolder ? () => {} : undefined}
						onRemove={onRemove}
					/>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
	});
	return { ui: within(view.baseElement as HTMLElement), onRemove };
}

function primaryRowName(ui: Awaited<ReturnType<typeof renderList>>): string {
	const badge = ui.getByTestId("source-folder-primary-badge");
	return (
		badge
			.closest("[data-testid=source-folder-row]")
			?.getAttribute("data-folder") ?? ""
	);
}

describe("the Primary badge", () => {
	test("sits on the folder at position 0 and nowhere else", async () => {
		const ui = await renderList(FOLDERS);

		expect(ui.getAllByTestId("source-folder-primary-badge")).toHaveLength(1);
		expect(primaryRowName(ui)).toBe("api");
	});
});

describe("the primary folder's actions", () => {
	test("offer Remove as a disabled item with a reason", async () => {
		const { ui, onRemove } = await renderMenu(true);
		const item = ui.getByText("Remove").closest("[role=menuitem]");

		expect(item?.getAttribute("data-disabled")).not.toBeNull();
		expect(onRemove).not.toHaveBeenCalled();

		const trigger = ui.getByTestId("source-folder-remove-reason");
		await act(async () => {
			fireEvent.focus(trigger);
		});
		expect(
			ui.getAllByText(
				"The primary folder can't be removed. Make another folder primary first.",
			).length,
		).toBeGreaterThan(0);
	});

	test("omit Make primary, which it already is", async () => {
		const { ui } = await renderMenu(true);

		expect(ui.queryByText("Make primary")).toBeNull();
	});
});

describe("making another folder primary", () => {
	test("moves it to the front and hands it the badge", async () => {
		const reordered = withPrimaryFolder(FOLDERS, "f-web");

		expect(reordered.map((entry) => entry.folder)).toEqual(["web", "api"]);
		expect(reordered.map((entry) => entry.position)).toEqual([0, 1]);

		const ui = await renderList(reordered);
		expect(ui.getAllByTestId("source-folder-primary-badge")).toHaveLength(1);
		expect(primaryRowName(ui)).toBe("web");
	});
});

const MEMBERS = [
	{
		id: "member-api",
		projectId: "project-api",
		position: 0,
		folder: "api",
		baseBranch: null,
	},
	{
		id: "member-web",
		projectId: "project-web",
		position: 1,
		folder: "web",
		baseBranch: null,
	},
];

const REPOSITORIES = [
	{ id: "project-api", repoPath: "/repos/api", repoUrl: null },
	{ id: "project-web", repoPath: "/repos/web", repoUrl: "git@github/web" },
];

describe("a project's source folders", () => {
	test("show each member's repository, ordered with the primary first", async () => {
		const folders = toSourceFolders([...MEMBERS].reverse(), REPOSITORIES);

		expect(folders.map((folder) => folder.folder)).toEqual(["api", "web"]);
		expect(folders.map((folder) => folder.repoPath)).toEqual([
			"/repos/api",
			"/repos/web",
		]);

		const ui = await renderList(folders);
		expect(primaryRowName(ui)).toBe("api");
	});

	test("survive a member whose repository the host no longer serves", () => {
		const [folder] = toSourceFolders(MEMBERS, []);

		expect(folder?.repoPath).toBeNull();
		expect(folder?.repoUrl).toBeNull();
	});

	test("re-badge the primary after one is removed", () => {
		const remaining = withoutFolder(
			toSourceFolders(MEMBERS, REPOSITORIES),
			"member-api",
		);

		expect(remaining.map((folder) => folder.folder)).toEqual(["web"]);
		expect(remaining[0]?.position).toBe(0);
	});

	test("offer no folder rename, which the container has no endpoint for", async () => {
		const { ui } = await renderMenu(false, false);

		expect(ui.queryByText("Rename folder")).toBeNull();
		expect(ui.getByText("Make primary")).not.toBeNull();
		expect(ui.getByText("Remove")).not.toBeNull();
	});
});
