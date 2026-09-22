import { describe, expect, it } from "bun:test";
import { selectProjectsToPlace } from "./selectProjectsToPlace";

const LOCAL = "machine-local";
const REMOTE = "machine-remote";

describe("selectProjectsToPlace", () => {
	it("places this device's row-less projects, workspaces or not", () => {
		expect(
			selectProjectsToPlace(
				[
					{ projectKey: "p-empty", hostIds: [LOCAL] },
					{ projectKey: "p-both", hostIds: [LOCAL, REMOTE] },
				],
				new Set(),
				LOCAL,
			),
		).toEqual(["p-empty", "p-both"]);
	});

	it("respects an existing row, hidden or not", () => {
		expect(
			selectProjectsToPlace(
				[{ projectKey: "p-hidden", hostIds: [LOCAL] }],
				new Set(["p-hidden"]),
				LOCAL,
			),
		).toEqual([]);
	});

	it("never places a project only a remote host serves", () => {
		expect(
			selectProjectsToPlace(
				[{ projectKey: "p-remote", hostIds: [REMOTE] }],
				new Set(),
				LOCAL,
			),
		).toEqual([]);
	});

	it("places nothing until this device's host is known", () => {
		expect(
			selectProjectsToPlace(
				[{ projectKey: "p", hostIds: [LOCAL] }],
				new Set(),
				null,
			),
		).toEqual([]);
	});
});
