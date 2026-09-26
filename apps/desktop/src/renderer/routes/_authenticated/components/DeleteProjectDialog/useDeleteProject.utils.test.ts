import { describe, expect, test } from "bun:test";
import {
	defaultProjectDeletionSelection,
	type ProjectDeletionTarget,
	selectedProjectDeletionTargets,
} from "./useDeleteProject.utils";

const local = {
	hostId: "local",
	name: "Local",
	url: "local-url",
	isLocal: true,
	isOnline: true,
	canDelete: true,
} satisfies ProjectDeletionTarget;
const remote: ProjectDeletionTarget = {
	...local,
	hostId: "remote",
	name: "Remote",
	isLocal: false,
};
describe("project deletion selection", () => {
	test("local copy is the only default even when more devices are owned", () => {
		expect(defaultProjectDeletionSelection([remote, local])).toEqual(["local"]);
	});
	test("a sole eligible remote copy is selected", () => {
		expect(
			defaultProjectDeletionSelection([remote, { ...local, canDelete: false }]),
		).toEqual(["remote"]);
	});
	test("multiple remote copies require an explicit choice", () => {
		expect(
			defaultProjectDeletionSelection([
				remote,
				{ ...remote, hostId: "remote-two" },
			]),
		).toEqual([]);
	});
	test("a relay URL alone does not make an offline device deletable", () => {
		expect(
			selectedProjectDeletionTargets(
				[{ ...remote, isOnline: false }],
				["remote"],
			),
		).toEqual([]);
	});
	test("stale selection cannot include an unavailable, unowned, or unrelated device", () => {
		expect(
			selectedProjectDeletionTargets(
				[
					local,
					{ ...remote, canDelete: false },
					{ ...remote, hostId: "offline", isOnline: false },
				],
				["local", "remote", "offline", "unrelated"],
			),
		).toEqual([local]);
	});
});
