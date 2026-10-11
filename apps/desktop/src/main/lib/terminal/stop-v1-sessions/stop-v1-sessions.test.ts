import { describe, expect, test } from "bun:test";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import { stopV1Sessions, type V1DaemonClient } from "./stop-v1-sessions";

const session = (
	paneId: string,
	workspaceId: string,
	isAlive = true,
): ListSessionsResponse["sessions"][number] => ({
	sessionId: `s-${paneId}`,
	paneId,
	workspaceId,
	isAlive,
	attachedClients: 0,
	pid: 1,
});

function fakeClient(sessions: ListSessionsResponse["sessions"] | null) {
	const killed: string[] = [];
	let shutdowns = 0;
	const client: V1DaemonClient = {
		listSessionsIfRunning: async () => (sessions ? { sessions } : null),
		killIfRunning: async ({ sessionId }) => {
			killed.push(sessionId);
			return true;
		},
		shutdownIfRunning: async () => {
			shutdowns++;
			return { wasRunning: true };
		},
	};
	return { client, killed, shutdowns: () => shutdowns };
}

describe("stopV1Sessions", () => {
	test("stops only the picked sessions and keeps the daemon for the rest", async () => {
		const fake = fakeClient([
			session("migrated", "w-done"),
			session("failed", "w-blocked"),
		]);
		const result = await stopV1Sessions(
			fake.client,
			(s) => s.workspaceId === "w-done",
		);
		expect(result.stoppedPaneIds).toEqual(["migrated"]);
		expect(fake.killed).toEqual(["s-migrated"]);
		expect(fake.shutdowns()).toBe(0);
	});

	test("at boot, shuts the daemon down once nothing is left running", async () => {
		const fake = fakeClient([
			session("migrated", "w-done"),
			session("exited", "w-blocked", false),
		]);
		await stopV1Sessions(fake.client, (s) => s.workspaceId === "w-done", {
			shutdownWhenEmpty: true,
		});
		expect(fake.shutdowns()).toBe(1);
	});

	test("mid-session, never shuts the daemon down: a v1 session may be starting", async () => {
		const fake = fakeClient([session("migrated", "w-done")]);
		await stopV1Sessions(fake.client, (s) => s.workspaceId === "w-done");
		expect(fake.killed).toEqual(["s-migrated"]);
		expect(fake.shutdowns()).toBe(0);
	});

	test("does nothing when no daemon runs", async () => {
		const fake = fakeClient(null);
		expect(await stopV1Sessions(fake.client, () => true)).toEqual({
			stoppedPaneIds: [],
		});
		expect(fake.shutdowns()).toBe(0);
	});
});
