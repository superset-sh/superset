import { describe, expect, it } from "bun:test";
import { getSshChatUnavailableMessage } from "./chatAvailability";

describe("getSshChatUnavailableMessage", () => {
	it("returns null for local workspaces", () => {
		expect(
			getSshChatUnavailableMessage({
				sshHostId: null,
				sshHostName: null,
				hasModelProviderCredentials: false,
			}),
		).toBeNull();
	});

	it("returns a clear unavailable message when SSH credentials are missing", () => {
		expect(
			getSshChatUnavailableMessage({
				sshHostId: "ssh-host-1",
				sshHostName: "Build Box",
				hasModelProviderCredentials: false,
			}),
		).toBe(
			"Chat is disabled for Build Box because the remote machine does not have model provider credentials configured.",
		);
	});

	it("keeps chat available when the SSH host has credentials or health is unknown", () => {
		expect(
			getSshChatUnavailableMessage({
				sshHostId: "ssh-host-1",
				sshHostName: "Build Box",
				hasModelProviderCredentials: true,
			}),
		).toBeNull();
		expect(
			getSshChatUnavailableMessage({
				sshHostId: "ssh-host-1",
				sshHostName: "Build Box",
				hasModelProviderCredentials: null,
			}),
		).toBeNull();
	});
});
