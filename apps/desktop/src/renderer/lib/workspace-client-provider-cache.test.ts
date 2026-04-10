import { afterEach, describe, expect, it } from "bun:test";
import { __workspaceClientProviderTestUtils } from "../../../../../packages/workspace-client/src/providers/WorkspaceClientProvider/WorkspaceClientProvider";

const TEST_HOST_URL = "http://127.0.0.1:43123";

describe("Workspace client cache lifecycle", () => {
	afterEach(() => {
		__workspaceClientProviderTestUtils.resetCache();
	});

	it("reuses the same cache entry for the same workspace key", () => {
		const first = __workspaceClientProviderTestUtils.getWorkspaceClients(
			"workspace-a",
			TEST_HOST_URL,
		);
		const second = __workspaceClientProviderTestUtils.getWorkspaceClients(
			"workspace-a",
			TEST_HOST_URL,
		);

		expect(second).toBe(first);
		expect(__workspaceClientProviderTestUtils.getCacheSize()).toBe(1);
	});

	it("releases cached clients once the refcount reaches zero", () => {
		const clients = __workspaceClientProviderTestUtils.getWorkspaceClients(
			"workspace-a",
			TEST_HOST_URL,
		);
		const other = __workspaceClientProviderTestUtils.getWorkspaceClients(
			"workspace-b",
			TEST_HOST_URL,
		);

		clients.refCount = 2;
		other.refCount = 1;
		expect(__workspaceClientProviderTestUtils.getCacheSize()).toBe(2);

		__workspaceClientProviderTestUtils.releaseWorkspaceClients(
			clients.clientKey,
		);
		expect(__workspaceClientProviderTestUtils.getCacheSize()).toBe(2);

		__workspaceClientProviderTestUtils.releaseWorkspaceClients(
			clients.clientKey,
		);
		expect(__workspaceClientProviderTestUtils.getCacheSize()).toBe(1);

		__workspaceClientProviderTestUtils.releaseWorkspaceClients(other.clientKey);
		expect(__workspaceClientProviderTestUtils.getCacheSize()).toBe(0);
	});
});
