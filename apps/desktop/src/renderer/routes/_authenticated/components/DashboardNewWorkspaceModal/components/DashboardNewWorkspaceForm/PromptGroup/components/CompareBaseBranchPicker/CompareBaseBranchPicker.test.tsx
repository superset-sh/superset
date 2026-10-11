import { afterEach, describe, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { CompareBaseBranchPicker } = await import("./CompareBaseBranchPicker");
afterEach(cleanup);

function renderPicker(
	overrides: Partial<React.ComponentProps<typeof CompareBaseBranchPicker>>,
) {
	render(
		<CompareBaseBranchPicker
			effectiveCompareBaseBranch={null}
			defaultBranch={null}
			isBranchesLoading={false}
			isBranchesError={false}
			branchesError={null}
			onRetryBranches={() => {}}
			isHostOffline={false}
			branches={[]}
			branchSearch=""
			onBranchSearchChange={() => {}}
			branchFilter="all"
			onBranchFilterChange={() => {}}
			isFetchingNextPage={false}
			hasNextPage={false}
			onLoadMore={() => {}}
			onSelectCompareBaseBranch={() => {}}
			onOpenWorkspace={() => {}}
			{...overrides}
		/>,
	);
	return within(document.body);
}

describe("CompareBaseBranchPicker load failures", () => {
	test("says the host is offline instead of reporting a failed load", () => {
		const page = renderPicker({ isHostOffline: true, isBranchesError: true });
		expect(page.getByText("Host is offline")).toBeTruthy();
		expect(page.queryByText("Failed to load branches")).toBeNull();
	});

	test("shows the host's reason and retries on demand", () => {
		const onRetryBranches = mock(() => {});
		const page = renderPicker({
			isBranchesError: true,
			branchesError: new Error(
				"Project directory is no longer a directory on disk",
			),
			onRetryBranches,
		});
		expect(
			page.getByText("Failed to load branches").getAttribute("title"),
		).toBe("Project directory is no longer a directory on disk");
		fireEvent.click(page.getByRole("button", { name: "Retry" }));
		expect(onRetryBranches).toHaveBeenCalledTimes(1);
	});
});
