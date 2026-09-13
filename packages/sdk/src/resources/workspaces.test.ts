import { expect, test } from "bun:test";
import type { Superset } from "../client";
import { Workspaces } from "./workspaces";

test.each([
	"local",
	"worktree",
	undefined,
] as const)("routes checkout %s to the matching host procedure", async (checkout) => {
	let procedure: string | undefined;
	const client = {
		hostMutation: (_hostId: string, route: { procedure: string }) => {
			procedure = route.procedure;
			return Promise.resolve({});
		},
	} as unknown as Superset;
	const workspaces = new Workspaces(client);
	await workspaces.create({
		hostId: "host",
		projectId: "project",
		name: "test",
		checkout,
	});
	expect(procedure).toBe(
		checkout === "local" ? "workspaces.createLocal" : "workspaces.create",
	);
});
