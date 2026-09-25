import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const { CompareBaseBranchPickerInline } = await import(
	"./CompareBaseBranchPickerInline"
);
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("legacy branch picker", () => {
	test.each([
		"row",
		"keyboard",
		"open",
		"create",
		"escape",
	] as const)("clears search and worktree filter after %s", async (action) => {
		const onOpenActiveWorkspace = mock(() => {});
		const onSelectCompareBaseBranch = mock(() => {});
		render(
			<CompareBaseBranchPickerInline
				effectiveCompareBaseBranch="main"
				defaultBranch="main"
				isBranchesLoading={false}
				isBranchesError={false}
				branches={[
					{ name: "main", lastCommitDate: 0, isLocal: true },
					{ name: "feature", lastCommitDate: 0, isLocal: true },
				]}
				worktreeBranches={new Set(["feature"])}
				openableWorktrees={new Map()}
				activeWorkspacesByBranch={new Map([["feature", "workspace-id"]])}
				externalWorktreeBranches={new Set()}
				modKey="⌘"
				onSelectCompareBaseBranch={onSelectCompareBaseBranch}
				onOpenWorktree={() => {}}
				onOpenActiveWorkspace={onOpenActiveWorkspace}
			/>,
		);
		const page = within(document.body);
		const trigger = page.getByRole("button", { name: "main" });
		await act(async () => {
			fireEvent.click(trigger);
		});
		const search = page.getByRole("combobox");
		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: /Worktrees/ }));
			fireEvent.change(search, { target: { value: "feat" } });
		});
		expect(page.getAllByRole("option")).toHaveLength(1);
		await act(async () => {
			if (action === "row") fireEvent.click(page.getByRole("option"));
			else if (action === "keyboard")
				fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
			else if (action === "escape")
				fireEvent.keyDown(search, { key: "Escape", code: "Escape" });
			else
				fireEvent.click(
					page.getByRole("button", {
						name: action === "open" ? /Open/ : /Create/,
					}),
				);
		});
		await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
		if (action === "create")
			expect(onSelectCompareBaseBranch).toHaveBeenCalledWith("feature");
		else if (action !== "escape")
			expect(onOpenActiveWorkspace).toHaveBeenCalledWith("workspace-id");
		await act(async () => {
			fireEvent.click(trigger);
		});
		expect((page.getByRole("combobox") as HTMLInputElement).value).toBe("");
		expect(page.getAllByRole("option")).toHaveLength(2);
	});
});
