import { describe, expect, test } from "bun:test";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { patchCloudWorkspaceRows } from "./patchCloudWorkspaceRows";

const person = (userId: string, lastSeenAt: Date | string) => ({
	userId,
	name: userId,
	image: null,
	lastSeenAt,
});

const row = (id: string, presence: ReturnType<typeof person>[] = []) =>
	({
		id,
		agentStatus: null,
		agentStatusAt: null,
		presence,
	}) as unknown as CloudWorkspaceRow;

describe("patchCloudWorkspaceRows", () => {
	test("applies agent status to the named row only", () => {
		const [a, b] = patchCloudWorkspaceRows(
			[row("a"), row("b")],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					agentStatus: "working",
					agentStatusAt: 1_000,
				},
			],
		);
		expect(a?.agentStatus).toBe("working");
		expect(a?.agentStatusAt).toEqual(new Date(1_000));
		expect(b?.agentStatus).toBeNull();
	});

	test("clears agent status when the patch says null", () => {
		const [a] = patchCloudWorkspaceRows(
			[{ ...row("a"), agentStatus: "working" } as CloudWorkspaceRow],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					agentStatus: null,
					agentStatusAt: 2_000,
				},
			],
		);
		expect(a?.agentStatus).toBeNull();
	});

	test("ignores a status older than the cached one", () => {
		const [a] = patchCloudWorkspaceRows(
			[
				{
					...row("a"),
					agentStatus: "review",
					agentStatusAt: new Date(5_000).toISOString(),
				} as unknown as CloudWorkspaceRow,
			],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					agentStatus: "working",
					agentStatusAt: 4_000,
				},
			],
		);
		expect(a?.agentStatus).toBe("review");
	});

	test("merges presence with a persisted row whose dates are strings", () => {
		const [a] = patchCloudWorkspaceRows(
			[
				row("a", [
					person("old", new Date(5_000).toISOString()),
					person("same", new Date(1_000).toISOString()),
				]),
			],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					presence: [person("same", 9_000) as never],
				},
			],
		);
		expect(a?.presence.map((p) => p.userId)).toEqual(["same", "old"]);
		expect(new Date(a?.presence[0]?.lastSeenAt ?? 0).getTime()).toBe(9_000);
	});
});
