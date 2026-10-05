import { describe, expect, test } from "bun:test";
import { buildCloudSidebar, isCloudWorkspaceRead } from "./buildCloudSidebar";

describe("buildCloudSidebar", () => {
	test("shows the boxes you created and hides everyone else's", () => {
		const layout = buildCloudSidebar({
			workspaces: [
				{
					id: "mine",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
				{
					id: "kiets",
					createdAt: new Date("2026-09-25T11:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
				},
			],
			state: { entries: {}, groups: [] },
			userId: "satya",
		});

		expect(layout.ungrouped.map((workspace) => workspace.id)).toEqual(["mine"]);
	});

	test("shows someone else's box you added and always keeps your own", () => {
		const layout = buildCloudSidebar({
			workspaces: [
				{
					id: "mine",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
				{
					id: "kiets",
					createdAt: new Date("2026-09-25T11:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
				},
			],
			state: {
				entries: { mine: { inSidebar: false }, kiets: { inSidebar: true } },
				groups: [],
			},
			userId: "satya",
		});

		expect(layout.ungrouped.map((workspace) => workspace.id)).toEqual([
			"kiets",
			"mine",
		]);
	});

	test("hides a box whose creator was deleted until someone adds it", () => {
		const layout = buildCloudSidebar({
			workspaces: [
				{
					id: "orphan",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: null,
					createdBy: null,
				},
			],
			state: { entries: {}, groups: [] },
			userId: "satya",
		});

		expect(layout.ungrouped).toEqual([]);
	});

	test("orders boxes by the agent's last message, newest first", () => {
		const layout = buildCloudSidebar({
			workspaces: [
				{
					id: "quiet",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: new Date("2026-09-25T10:05:00Z"),
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
				{
					id: "talked-last",
					createdAt: new Date("2026-09-24T10:00:00Z"),
					agentStatusAt: new Date("2026-09-25T11:50:00Z"),
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
				{
					id: "never-ran",
					createdAt: new Date("2026-09-25T11:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
			],
			state: { entries: {}, groups: [] },
			userId: "satya",
		});

		expect(layout.ungrouped.map((workspace) => workspace.id)).toEqual([
			"talked-last",
			"never-ran",
			"quiet",
		]);
	});

	test("puts boxes in their group, orders groups by creation, and keeps empty groups", () => {
		const layout = buildCloudSidebar({
			workspaces: [
				{
					id: "presence",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
				{
					id: "region",
					createdAt: new Date("2026-09-25T09:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
			],
			state: {
				entries: { presence: { groupId: "later" } },
				groups: [
					{ id: "later", name: "Later", createdAt: 2, isCollapsed: false },
					{ id: "first", name: "First", createdAt: 1, isCollapsed: false },
				],
			},
			userId: "satya",
		});

		expect(layout.ungrouped.map((workspace) => workspace.id)).toEqual([
			"region",
		]);
		expect(
			layout.groups.map(({ group, workspaces }) => [
				group.id,
				workspaces.map((workspace) => workspace.id),
			]),
		).toEqual([
			["first", []],
			["later", ["presence"]],
		]);
	});

	test("treats a box in a deleted group as ungrouped", () => {
		const layout = buildCloudSidebar({
			workspaces: [
				{
					id: "presence",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
				},
			],
			state: { entries: { presence: { groupId: "gone" } }, groups: [] },
			userId: "satya",
		});

		expect(layout.ungrouped.map((workspace) => workspace.id)).toEqual([
			"presence",
		]);
	});
});

describe("isCloudWorkspaceRead", () => {
	test("a box whose agent never notified is read", () => {
		expect(isCloudWorkspaceRead({ agentStatusAt: null }, undefined)).toBe(true);
	});

	test("a notification after the last read is unread", () => {
		expect(
			isCloudWorkspaceRead(
				{ agentStatusAt: new Date("2026-09-25T11:50:00Z") },
				new Date("2026-09-25T11:00:00Z").getTime(),
			),
		).toBe(false);
	});

	test("reading after the notification makes it read", () => {
		expect(
			isCloudWorkspaceRead(
				{ agentStatusAt: new Date("2026-09-25T11:50:00Z") },
				new Date("2026-09-25T11:55:00Z").getTime(),
			),
		).toBe(true);
	});
});
