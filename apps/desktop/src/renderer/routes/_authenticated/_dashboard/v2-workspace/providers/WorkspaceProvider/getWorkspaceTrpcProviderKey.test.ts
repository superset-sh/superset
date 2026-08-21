import { describe, expect, test } from "bun:test";
import { getWorkspaceTrpcProviderKey } from "./getWorkspaceTrpcProviderKey";

describe("getWorkspaceTrpcProviderKey", () => {
	test("remounts a remote workspace client when its relay URL changes", () => {
		const workspaceId = "workspace-1";
		const legacyRelayKey = getWorkspaceTrpcProviderKey({
			workspaceId,
			hostUrl: "https://relay.superset.sh/hosts/org:host",
			isLocalWorkspace: false,
		});
		const selectedRelayKey = getWorkspaceTrpcProviderKey({
			workspaceId,
			hostUrl: "https://relay2.superset.sh/hosts/org:host",
			isLocalWorkspace: false,
		});

		expect(selectedRelayKey).not.toBe(legacyRelayKey);
	});

	test("keeps a local workspace mounted across host-service port changes", () => {
		const workspaceId = "workspace-1";
		const firstPortKey = getWorkspaceTrpcProviderKey({
			workspaceId,
			hostUrl: "http://127.0.0.1:41001",
			isLocalWorkspace: true,
		});
		const nextPortKey = getWorkspaceTrpcProviderKey({
			workspaceId,
			hostUrl: "http://127.0.0.1:41002",
			isLocalWorkspace: true,
		});

		expect(nextPortKey).toBe(firstPortKey);
		expect(nextPortKey).toBe(workspaceId);
	});
});
