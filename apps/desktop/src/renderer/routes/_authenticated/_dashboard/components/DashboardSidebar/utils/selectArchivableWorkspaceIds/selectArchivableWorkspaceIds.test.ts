import { describe, expect, it } from "bun:test";
import { selectArchivableWorkspaceIds } from "./selectArchivableWorkspaceIds";

describe("selectArchivableWorkspaceIds", () => {
	it("keeps worktree and session workspaces on local and remote devices", () => {
		expect(
			selectArchivableWorkspaceIds([
				{ id: "a", type: "worktree", hostType: "local-device" },
				{ id: "b", type: "session", hostType: "remote-device" },
			]),
		).toEqual(["a", "b"]);
	});

	it("drops main workspaces and cloud sandboxes", () => {
		expect(
			selectArchivableWorkspaceIds([
				{ id: "main", type: "main", hostType: "local-device" },
				{ id: "cloud", type: "worktree", hostType: "cloud" },
				{ id: "ok", type: "worktree", hostType: "local-device" },
			]),
		).toEqual(["ok"]);
	});
});
