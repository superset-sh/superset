import { beforeEach, describe, expect, mock, test } from "bun:test";

interface ToastAction {
	label: string;
	onClick: () => void;
}

const toastCalls: { message: string; action: ToastAction | undefined }[] = [];
const errorToasts: string[] = [];

const toast = Object.assign(
	(message: string, options?: { action?: ToastAction }) => {
		toastCalls.push({ message, action: options?.action });
	},
	{
		error: (message: string) => {
			errorToasts.push(message);
		},
	},
);

mock.module("@superset/ui/sonner", () => ({ toast }));
// The hook module transitively imports the hotkeys layout store, which
// subscribes to the electron client at import time; another test file in the
// same process may have left a partial mock of that client behind.
mock.module("renderer/lib/trpc-client", () => ({
	electronReactClient: {},
	electronTrpcClient: {
		keyboardLayout: { changes: { subscribe: () => {} } },
	},
}));

const { archiveWorkspaceWithUndo } = await import(
	"./useDashboardSidebarWorkspaceItemActions"
);
const { useDeletingWorkspacesStore } = await import(
	"renderer/routes/_authenticated/_dashboard/stores/deletingWorkspacesStore"
);

function setup(
	overrides: {
		workspaceId?: string;
		archive?: () => Promise<unknown>;
		restore?: () => Promise<unknown>;
		isActive?: boolean;
	} = {},
) {
	const order: string[] = [];
	const archive = mock(
		overrides.archive ??
			(async () => {
				order.push("archive");
			}),
	);
	const restore = mock(
		overrides.restore ??
			(async () => {
				order.push("restore");
			}),
	);
	const navigateAway = mock(() => {
		order.push("navigateAway");
	});
	const navigateBack = mock(async () => {
		order.push("navigateBack");
	});
	const focusSidebarList = mock(() => {
		order.push("focusSidebarList");
	});

	return {
		order,
		archive,
		restore,
		navigateAway,
		navigateBack,
		focusSidebarList,
		run: () =>
			archiveWorkspaceWithUndo({
				workspaceId: overrides.workspaceId ?? "workspace-1",
				workspaceName: "feature-row",
				isActive: overrides.isActive ?? true,
				archive,
				restore,
				navigateAway,
				navigateBack,
				focusSidebarList,
			}),
	};
}

describe("archiveWorkspaceWithUndo", () => {
	beforeEach(() => {
		toastCalls.length = 0;
		errorToasts.length = 0;
	});

	test("leaves the workspace before the host drops it, then offers Undo", async () => {
		const context = setup();

		await context.run();

		expect(context.order).toEqual([
			"navigateAway",
			"archive",
			"focusSidebarList",
		]);
		expect(toastCalls).toHaveLength(1);
		expect(toastCalls[0]?.message).toBe('Archived "feature-row"');
		expect(toastCalls[0]?.action?.label).toBe("Undo");
		expect(
			useDeletingWorkspacesStore.getState().deletingIds.has("workspace-1"),
		).toBe(false);
	});

	test("hides the row from navigation while the host is working", async () => {
		let seenWhileArchiving = false;
		const context = setup({
			archive: async () => {
				seenWhileArchiving = useDeletingWorkspacesStore
					.getState()
					.deletingIds.has("workspace-1");
			},
		});

		await context.run();

		expect(seenWhileArchiving).toBe(true);
	});

	test("a dirty worktree is refused with an explanation and the user is put back", async () => {
		const context = setup({
			archive: async () => {
				throw { kind: "conflict", message: "Worktree has uncommitted changes" };
			},
		});

		await context.run();

		expect(context.order).toEqual(["navigateAway", "navigateBack"]);
		expect(context.focusSidebarList).not.toHaveBeenCalled();
		expect(toastCalls).toHaveLength(0);
		expect(errorToasts).toEqual([
			'"feature-row" has uncommitted changes. Commit or stash them first, or delete the workspace instead.',
		]);
	});

	test("an unreachable host is reported as such", async () => {
		const context = setup({
			isActive: false,
			archive: async () => {
				throw { kind: "host-unavailable", reason: "not-found" };
			},
		});

		await context.run();

		expect(context.navigateAway).not.toHaveBeenCalled();
		expect(context.navigateBack).not.toHaveBeenCalled();
		expect(errorToasts).toEqual([
			'"feature-row" can\'t be archived while its host is unreachable.',
		]);
	});

	test("does not navigate away from a workspace the user is not viewing", async () => {
		const context = setup({ isActive: false });

		await context.run();

		expect(context.navigateAway).not.toHaveBeenCalled();
		expect(context.focusSidebarList).toHaveBeenCalledTimes(1);
	});

	test("Undo restores the workspace and returns to it", async () => {
		const context = setup();
		await context.run();

		await runUndo(toastCalls[0]?.action);

		expect(context.order).toEqual([
			"navigateAway",
			"archive",
			"focusSidebarList",
			"restore",
			"navigateBack",
			"focusSidebarList",
		]);
		expect(errorToasts).toEqual([]);
	});

	test("Undo does not navigate back when archiving never navigated away", async () => {
		const context = setup({ isActive: false });
		await context.run();

		await runUndo(toastCalls[0]?.action);

		expect(context.restore).toHaveBeenCalledTimes(1);
		expect(context.navigateBack).not.toHaveBeenCalled();
		expect(context.focusSidebarList).toHaveBeenCalledTimes(2);
	});

	test("a second Undo click before the first settles is ignored", async () => {
		const context = setup();
		await context.run();

		const action = toastCalls[0]?.action;
		expect(action).toBeDefined();
		action?.onClick();
		action?.onClick();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(context.restore).toHaveBeenCalledTimes(1);
	});

	test("overlapping callers cannot rearchive after Undo or while Undo is pending", async () => {
		let completeArchive!: () => void;
		let completeUndo!: () => void;
		let archived = false;
		const sidebar = setup({
			archive: async () => {
				await new Promise<void>((resolve) => {
					completeArchive = resolve;
				});
				archived = true;
			},
			restore: async () => {
				await new Promise<void>((resolve) => {
					completeUndo = resolve;
				});
				archived = false;
			},
		});
		const palette = setup({
			archive: async () => {
				archived = true;
			},
		});
		const pendingArchive = sidebar.run();
		await palette.run();
		expect(palette.archive).not.toHaveBeenCalled();
		completeArchive();
		await pendingArchive;
		expect(archived).toBe(true);
		expect(toastCalls).toHaveLength(1);

		toastCalls[0]?.action?.onClick();
		await palette.run();
		expect(palette.archive).not.toHaveBeenCalled();
		completeUndo();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(archived).toBe(false);
		expect(sidebar.restore).toHaveBeenCalledTimes(1);
		expect(palette.navigateAway).not.toHaveBeenCalled();

		await palette.run();
		expect(palette.archive).toHaveBeenCalledTimes(1);
		expect(archived).toBe(true);
	});

	test("an archive failure releases only its workspace guard", async () => {
		let rejectArchive!: (error: Error) => void;
		const first = setup({
			archive: () =>
				new Promise((_, reject) => {
					rejectArchive = reject;
				}),
		});
		const pendingArchive = first.run();
		const other = setup({ workspaceId: "workspace-2" });
		await other.run();
		expect(other.archive).toHaveBeenCalledTimes(1);
		rejectArchive(new Error("host unreachable"));
		await pendingArchive;

		const retry = setup();
		await retry.run();
		expect(retry.archive).toHaveBeenCalledTimes(1);
	});

	test("a failed Undo reports the error and leaves the route alone", async () => {
		const context = setup({
			restore: async () => {
				throw new Error("host unreachable");
			},
		});
		await context.run();

		await runUndo(toastCalls[0]?.action);

		expect(context.navigateBack).not.toHaveBeenCalled();
		expect(errorToasts).toEqual(["host unreachable"]);
	});
});

async function runUndo(action: ToastAction | undefined) {
	expect(action).toBeDefined();
	action?.onClick();
	// The handler fires off an async restore; let it settle.
	await new Promise((resolve) => setTimeout(resolve, 0));
}
