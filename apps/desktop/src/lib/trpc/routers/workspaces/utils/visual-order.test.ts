import { describe, expect, test } from "bun:test";
import {
	compareByActivity,
	computeActivityOrder,
	computeVisualOrder,
} from "./visual-order";

describe("computeVisualOrder", () => {
	test("empty inputs returns empty array", () => {
		expect(computeVisualOrder([], [], [])).toEqual([]);
	});

	test("single project, no sections — all workspaces are ungrouped", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
		];
		expect(computeVisualOrder(projects, workspaces, [])).toEqual(["w2", "w1"]);
	});

	test("single project with one section uses mixed top-level tabOrder", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 0,
				lastActivityAt: null,
			},
		];
		const sections = [{ id: "s1", projectId: "p1", tabOrder: 0 }];
		expect(computeVisualOrder(projects, workspaces, sections)).toEqual([
			"w2",
			"w1",
		]);
	});

	test("multiple sections ordered by shared top-level tabOrder", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: "s2",
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w3",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: null,
			},
		];
		const sections = [
			{ id: "s1", projectId: "p1", tabOrder: 2 },
			{ id: "s2", projectId: "p1", tabOrder: 0 },
		];
		expect(computeVisualOrder(projects, workspaces, sections)).toEqual([
			"w1",
			"w3",
			"w2",
		]);
	});

	test("multiple projects ordered by tabOrder", () => {
		const projects = [
			{ id: "p2", tabOrder: 1 },
			{ id: "p1", tabOrder: 0 },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
		];
		expect(computeVisualOrder(projects, workspaces, [])).toEqual(["w1", "w2"]);
	});

	test("workspaces sorted by tabOrder within each group", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w3",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 2,
				lastActivityAt: null,
			},
			{
				id: "w1",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 1,
				lastActivityAt: null,
			},
		];
		const sections = [{ id: "s1", projectId: "p1", tabOrder: 0 }];
		expect(computeVisualOrder(projects, workspaces, sections)).toEqual([
			"w1",
			"w2",
			"w3",
		]);
	});

	test("projects with null tabOrder are excluded", () => {
		const projects = [
			{ id: "p1", tabOrder: 0 },
			{ id: "p2", tabOrder: null },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
		];
		expect(computeVisualOrder(projects, workspaces, [])).toEqual(["w1"]);
	});
});

describe("compareByActivity", () => {
	const ws = (id: string, lastActivityAt: number | null, tabOrder = 0) => ({
		id,
		projectId: "p1",
		sectionId: null,
		tabOrder,
		lastActivityAt,
	});

	test("both have activity — most recent first", () => {
		expect(compareByActivity(ws("a", 100), ws("b", 200))).toBeGreaterThan(0);
		expect(compareByActivity(ws("a", 200), ws("b", 100))).toBeLessThan(0);
	});

	test("equal activity returns 0", () => {
		expect(compareByActivity(ws("a", 100), ws("b", 100))).toBe(0);
	});

	test("only first has activity — it sorts first", () => {
		expect(compareByActivity(ws("a", 100), ws("b", null))).toBeLessThan(0);
	});

	test("only second has activity — it sorts first", () => {
		expect(compareByActivity(ws("a", null), ws("b", 100))).toBeGreaterThan(0);
	});

	test("neither has activity — falls back to tabOrder", () => {
		expect(compareByActivity(ws("a", null, 2), ws("b", null, 5))).toBeLessThan(
			0,
		);
		expect(
			compareByActivity(ws("a", null, 5), ws("b", null, 2)),
		).toBeGreaterThan(0);
	});
});

describe("computeActivityOrder", () => {
	test("empty inputs returns empty array", () => {
		expect(computeActivityOrder([], [])).toEqual([]);
	});

	test("single project — workspaces sorted by most recent activity first", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 100,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: 300,
			},
			{
				id: "w3",
				projectId: "p1",
				sectionId: null,
				tabOrder: 2,
				lastActivityAt: 200,
			},
		];
		expect(computeActivityOrder(projects, workspaces)).toEqual([
			"w2",
			"w3",
			"w1",
		]);
	});

	test("workspaces with null activity sort after those with activity, by tabOrder", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w3",
				projectId: "p1",
				sectionId: null,
				tabOrder: 2,
				lastActivityAt: 100,
			},
		];
		expect(computeActivityOrder(projects, workspaces)).toEqual([
			"w3",
			"w2",
			"w1",
		]);
	});

	test("multiple projects — project with most recent activity comes first", () => {
		const projects = [
			{ id: "p1", tabOrder: 0 },
			{ id: "p2", tabOrder: 1 },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 100,
			},
			{
				id: "w2",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 500,
			},
		];
		// p2 has activity=500, p1 has activity=100 → p2 first
		expect(computeActivityOrder(projects, workspaces)).toEqual(["w2", "w1"]);
	});

	test("projects with no activity fall back to tabOrder", () => {
		const projects = [
			{ id: "p1", tabOrder: 1 },
			{ id: "p2", tabOrder: 0 },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
		];
		expect(computeActivityOrder(projects, workspaces)).toEqual(["w2", "w1"]);
	});

	test("project with activity sorts before project without activity", () => {
		const projects = [
			{ id: "p1", tabOrder: 0 },
			{ id: "p2", tabOrder: 1 },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: null,
			},
			{
				id: "w2",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 100,
			},
		];
		expect(computeActivityOrder(projects, workspaces)).toEqual(["w2", "w1"]);
	});

	test("projects with null tabOrder are excluded", () => {
		const projects = [
			{ id: "p1", tabOrder: 0 },
			{ id: "p2", tabOrder: null },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 100,
			},
			{
				id: "w2",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 500,
			},
		];
		expect(computeActivityOrder(projects, workspaces)).toEqual(["w1"]);
	});

	test("ignores sectionId — all workspaces in a project are sorted together", () => {
		const projects = [{ id: "p1", tabOrder: 0 }];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 0,
				lastActivityAt: 100,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: 300,
			},
			{
				id: "w3",
				projectId: "p1",
				sectionId: "s1",
				tabOrder: 2,
				lastActivityAt: 200,
			},
		];
		expect(computeActivityOrder(projects, workspaces)).toEqual([
			"w2",
			"w3",
			"w1",
		]);
	});

	test("project max activity uses the highest workspace activity", () => {
		const projects = [
			{ id: "p1", tabOrder: 0 },
			{ id: "p2", tabOrder: 1 },
		];
		const workspaces = [
			{
				id: "w1",
				projectId: "p1",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 50,
			},
			{
				id: "w2",
				projectId: "p1",
				sectionId: null,
				tabOrder: 1,
				lastActivityAt: 400,
			},
			{
				id: "w3",
				projectId: "p2",
				sectionId: null,
				tabOrder: 0,
				lastActivityAt: 300,
			},
		];
		// p1 max=400, p2 max=300 → p1 first
		expect(computeActivityOrder(projects, workspaces)).toEqual([
			"w2",
			"w1",
			"w3",
		]);
	});
});
