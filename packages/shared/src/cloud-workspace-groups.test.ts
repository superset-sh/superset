import { describe, expect, test } from "bun:test";
import {
	groupCloudWorkspaces,
	groupCloudWorkspacesByTime,
} from "./cloud-workspace-groups";

describe("groupCloudWorkspaces", () => {
	test("groups each box under whoever is in it now, else its creator", () => {
		const groups = groupCloudWorkspaces({
			workspaces: [
				{
					id: "kiets-box-satya-is-in",
					createdAt: new Date("2026-09-25T09:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
					presence: [
						{
							userId: "satya",
							name: "Satya Patel",
							image: null,
							lastSeenAt: new Date("2026-09-25T11:58:00Z"),
						},
					],
				},
				{
					id: "kiets-quiet-box",
					createdAt: new Date("2026-09-25T08:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
					presence: [
						{
							userId: "satya",
							name: "Satya Patel",
							image: null,
							lastSeenAt: new Date("2026-09-24T12:00:00Z"),
						},
					],
				},
			],
			userId: "satya",
			now: new Date("2026-09-25T12:00:00Z"),
			activeWithinMs: 15 * 60 * 1000,
		});

		expect(
			groups.map(({ person, workspaces }) => [
				person?.name,
				workspaces.map((workspace) => workspace.id),
			]),
		).toEqual([
			["Satya Patel", ["kiets-box-satya-is-in"]],
			["Kiet Ho", ["kiets-quiet-box"]],
		]);
	});

	test("puts your group first, others by name, and no-one last", () => {
		const groups = groupCloudWorkspaces({
			workspaces: [
				{
					id: "orphan",
					createdAt: new Date("2026-09-25T11:00:00Z"),
					agentStatusAt: null,
					createdBy: null,
					presence: [],
				},
				{
					id: "kiets",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
					presence: [],
				},
				{
					id: "avis",
					createdAt: new Date("2026-09-25T09:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "avi", name: "Avi Peltz", image: null },
					presence: [],
				},
				{
					id: "mine",
					createdAt: new Date("2026-09-25T08:00:00Z"),
					agentStatusAt: null,
					createdBy: { userId: "satya", name: "Satya Patel", image: null },
					presence: [],
				},
			],
			userId: "satya",
			now: new Date("2026-09-25T12:00:00Z"),
			activeWithinMs: 15 * 60 * 1000,
		});

		expect(groups.map(({ person }) => person?.name ?? null)).toEqual([
			"Satya Patel",
			"Avi Peltz",
			"Kiet Ho",
			null,
		]);
	});

	test("orders boxes by the agent's last message, or by creation when asked", () => {
		const avi = { userId: "avi", name: "Avi Peltz", image: null };
		const workspaces = [
			{
				id: "old-but-busy",
				createdAt: new Date("2026-09-20T09:00:00Z"),
				agentStatusAt: new Date("2026-09-25T11:00:00Z"),
				createdBy: avi,
				presence: [],
			},
			{
				id: "new-and-quiet",
				createdAt: new Date("2026-09-25T09:00:00Z"),
				agentStatusAt: null,
				createdBy: avi,
				presence: [],
			},
		];
		const ids = (sort?: "activity" | "created") =>
			groupCloudWorkspaces({
				workspaces,
				userId: null,
				now: new Date("2026-09-25T12:00:00Z"),
				activeWithinMs: 15 * 60 * 1000,
				sort,
			})[0]?.workspaces.map((workspace) => workspace.id);
		expect(ids()).toEqual(["old-but-busy", "new-and-quiet"]);
		expect(ids("created")).toEqual(["new-and-quiet", "old-but-busy"]);
	});
});

describe("groupCloudWorkspacesByTime", () => {
	const now = new Date(2026, 8, 28, 15, 0);
	const at = (date: Date) => ({ agentStatusAt: date, createdAt: date });

	test("buckets by local calendar day, then weeks, months and years", () => {
		const groups = groupCloudWorkspacesByTime({
			workspaces: [
				at(new Date(2026, 8, 28, 0, 5)),
				at(new Date(2026, 8, 27, 16, 0)),
				at(new Date(2026, 8, 26, 20, 0)),
				at(new Date(2026, 8, 24, 16, 0)),
				at(new Date(2026, 8, 24, 12, 0)),
				at(new Date(2026, 8, 13, 12, 0)),
				at(new Date(2026, 6, 1, 12, 0)),
				at(new Date(2024, 8, 1, 12, 0)),
			],
			now,
			sort: "activity",
		});
		expect(
			groups.map(({ period, workspaces }) => [
				period.unit,
				period.count,
				workspaces.length,
			]),
		).toEqual([
			["day", 0, 1],
			["day", 1, 1],
			["day", 2, 1],
			["day", 4, 2],
			["week", 2, 1],
			["month", 2, 1],
			["year", 2, 1],
		]);
	});

	test("late last night is yesterday the next morning", () => {
		const [group] = groupCloudWorkspacesByTime({
			workspaces: [at(new Date(2026, 8, 27, 23, 0))],
			now: new Date(2026, 8, 28, 9, 0),
			sort: "activity",
		});
		expect(group?.period).toEqual({ unit: "day", count: 1 });
	});

	test("created sort buckets by creation, not agent activity", () => {
		const [group] = groupCloudWorkspacesByTime({
			workspaces: [
				{
					agentStatusAt: new Date(2026, 8, 28, 14, 0),
					createdAt: new Date(2026, 8, 20, 9, 0),
				},
			],
			now,
			sort: "created",
		});
		expect(group?.period).toEqual({ unit: "week", count: 1 });
	});
});

describe("groupCloudWorkspacesByTime with at", () => {
	test("groups and orders by the given time instead of the sort's", () => {
		const now = new Date("2026-09-30T12:00:00");
		const groups = groupCloudWorkspacesByTime({
			workspaces: [
				{
					id: "archived-yesterday",
					createdAt: new Date("2026-09-30T09:00:00"),
					agentStatusAt: null,
					archivedAt: new Date("2026-09-29T10:00:00"),
				},
				{
					id: "archived-today",
					createdAt: new Date("2026-09-01T09:00:00"),
					agentStatusAt: null,
					archivedAt: new Date("2026-09-30T11:00:00"),
				},
			],
			now,
			sort: "activity",
			at: (workspace) => workspace.archivedAt,
		});
		expect(
			groups.map(({ period, workspaces }) => [
				period.count,
				workspaces.map((workspace) => workspace.id),
			]),
		).toEqual([
			[0, ["archived-today"]],
			[1, ["archived-yesterday"]],
		]);
	});
});
