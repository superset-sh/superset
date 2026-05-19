import { describe, expect, mock, test } from "bun:test";
import { renameV2Workspace } from "./renameV2Workspace";

describe("renameV2Workspace", () => {
	test("uses collection.update when the workspace exists locally", () => {
		const tx = { isPersisted: { promise: Promise.resolve() } };
		const update = mock(() => tx);
		const apiMutate = mock(() => Promise.resolve({ txid: "tx-1" }));

		const result = renameV2Workspace({
			collection: { get: () => ({ id: "ws-1", name: "old" }), update },
			apiClient: { v2Workspace: { update: { mutate: apiMutate } } },
			workspaceId: "ws-1",
			name: "new",
		});

		expect(update).toHaveBeenCalledTimes(1);
		expect(apiMutate).not.toHaveBeenCalled();
		expect(result).toBe(tx);
	});

	test("falls back to direct API call when the workspace is missing from the local collection (issue #4626 / #4587)", () => {
		// Reproduces the bug: tanstack/db's collection.update throws
		// UpdateKeyNotFoundError synchronously when the key isn't in the
		// collection. The old code path called collection.update unconditionally,
		// so the synchronous throw bubbled into runMutation's catch and surfaced
		// as the "Failed to rename workspace" toast described in the issue.
		const update = mock(() => {
			throw new Error(
				'The key "ws-missing" was passed to update but an object for this key was not found in the collection',
			);
		});
		const apiPromise = Promise.resolve({ txid: "tx-2" });
		const apiMutate = mock(() => apiPromise);

		const result = renameV2Workspace({
			collection: { get: () => undefined, update },
			apiClient: { v2Workspace: { update: { mutate: apiMutate } } },
			workspaceId: "ws-missing",
			name: "new",
		});

		expect(update).not.toHaveBeenCalled();
		expect(apiMutate).toHaveBeenCalledTimes(1);
		expect(apiMutate).toHaveBeenCalledWith({ id: "ws-missing", name: "new" });
		expect(result.isPersisted.promise).toBe(apiPromise);
	});
});
