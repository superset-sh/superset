import { describe, expect, it, mock } from "bun:test";
import { invalidateProjectQueries } from "./invalidateProjectQueries";

describe("invalidateProjectQueries", () => {
	it("invalidates the sidebar query so newly created projects appear immediately (regression for #4711)", async () => {
		const getRecentsInvalidate = mock(async () => undefined);
		const getAllGroupedInvalidate = mock(async () => undefined);

		const utils = {
			projects: { getRecents: { invalidate: getRecentsInvalidate } },
			workspaces: { getAllGrouped: { invalidate: getAllGroupedInvalidate } },
		};

		await invalidateProjectQueries(utils as never);

		expect(getRecentsInvalidate).toHaveBeenCalledTimes(1);
		expect(getAllGroupedInvalidate).toHaveBeenCalledTimes(1);
	});
});
