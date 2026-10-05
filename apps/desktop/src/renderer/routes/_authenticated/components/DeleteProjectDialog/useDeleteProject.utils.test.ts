import { describe, expect, test } from "bun:test";
import {
	defaultProjectDeletionSelection,
	type ProjectDeletionTarget,
	summarizeOthersActivity,
} from "./useDeleteProject.utils";

const local: ProjectDeletionTarget = {
	hostId: "local",
	name: "Local",
	url: "local-url",
	isLocal: true,
	isOnline: true,
	canDelete: true,
};
const remote: ProjectDeletionTarget = {
	...local,
	hostId: "remote",
	name: "Remote",
	isLocal: false,
};

describe("default device selection", () => {
	test("this device when it can be deleted from", () => {
		expect(defaultProjectDeletionSelection([remote, local])).toEqual(["local"]);
	});
	test("the only eligible device otherwise", () => {
		expect(
			defaultProjectDeletionSelection([remote, { ...local, canDelete: false }]),
		).toEqual(["remote"]);
	});
	test("an offline local copy leaves the default to a sole online remote", () => {
		expect(
			defaultProjectDeletionSelection([remote, { ...local, isOnline: false }]),
		).toEqual(["remote"]);
	});
	test("nothing when several remote devices are eligible", () => {
		expect(
			defaultProjectDeletionSelection([remote, { ...remote, hostId: "b" }]),
		).toEqual([]);
	});
});

describe("other people's activity", () => {
	test("groups live work per person and ignores the viewer and idle workspaces", () => {
		expect(
			summarizeOthersActivity(
				[
					{
						createdByUserId: "me",
						runningTerminalCount: 3,
						runningAgentCount: 1,
						lastActiveAt: 9,
					},
					{
						createdByUserId: "bob",
						runningTerminalCount: 1,
						runningAgentCount: 1,
						lastActiveAt: 5,
					},
					{
						createdByUserId: "bob",
						runningTerminalCount: 2,
						runningAgentCount: 0,
						lastActiveAt: 7,
					},
					{
						createdByUserId: "carol",
						runningTerminalCount: 0,
						runningAgentCount: 0,
						lastActiveAt: 8,
					},
					{
						createdByUserId: null,
						runningTerminalCount: 1,
						runningAgentCount: 0,
						lastActiveAt: null,
					},
				],
				"me",
			),
		).toEqual([
			{
				userId: "bob",
				runningTerminalCount: 3,
				runningAgentCount: 1,
				lastActiveAt: 7,
			},
			{
				userId: null,
				runningTerminalCount: 1,
				runningAgentCount: 0,
				lastActiveAt: null,
			},
		]);
	});
});
