import { afterEach, expect, mock, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { BranchLoadFailure } = await import("./BranchLoadFailure");
afterEach(cleanup);

test("names a missing project folder and offers to change its location instead of retrying", async () => {
	const onChangeProjectLocation = mock(() => {});
	render(
		<BranchLoadFailure
			error={TRPCClientError.from({
				error: {
					message: "Project directory is no longer a directory on disk",
					code: -32004,
					data: {
						code: "NOT_FOUND",
						projectDirMissing: {
							kind: "PROJECT_DIR_MISSING",
							repoPath: "/code/acme-web",
						},
					},
				},
			})}
			isRetrying={false}
			onRetry={() => {}}
			onChangeProjectLocation={onChangeProjectLocation}
		/>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.focus(page.getByText("Folder is missing"));
	});
	expect(page.getByRole("tooltip").textContent).toBe("/code/acme-web");
	fireEvent.click(page.getByRole("button", { name: "Change location" }));
	expect(onChangeProjectLocation).toHaveBeenCalledTimes(1);
	expect(page.queryByRole("button", { name: "Retry" })).toBeNull();
});
