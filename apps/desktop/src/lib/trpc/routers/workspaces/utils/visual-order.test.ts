import { describe, expect, test } from "bun:test";
import { computeVisualOrder } from "./visual-order";

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
