import { describe, expect, it } from "bun:test";
import type {
	ProjectFindByPathResult,
	ProjectImportDecision,
} from "renderer/lib/v1-migration";
import {
	type ProjectImportStatus,
	planProjectRowAction,
	selectPendingProjects,
} from "./import-plan";

const p = (id: string) => ({ id });

describe("selectPendingProjects", () => {
	const importDecision: ProjectImportDecision = { kind: "import" };
	const alreadyImported: ProjectImportDecision = {
		kind: "already-imported",
		v2ProjectId: "v2-1",
	};
	const skip: ProjectImportDecision = {
		kind: "skip",
		reason: "multiple-candidates",
	};

	it("keeps importable, undecided, and errored projects; drops imported/running/skip", () => {
		const projects = [p("a"), p("b"), p("c"), p("d"), p("e"), p("f")];
		const decisions = new Map<string, ProjectImportDecision | undefined>([
			["a", importDecision], // pending
			["b", alreadyImported], // dropped: server says imported
			["c", skip], // dropped: needs a human (pick / cloud-unreachable)
			["d", importDecision], // dropped: running
			["e", importDecision], // dropped: imported this session
			// "f" has no decision yet (query loading) — stays pending
		]);
		const states = new Map<string, ProjectImportStatus>([
			["d", { kind: "running" }],
			["e", { kind: "imported", v2ProjectId: "v2-e" }],
		]);

		expect(
			selectPendingProjects(projects, decisions, states).map((x) => x.id),
		).toEqual(["a", "f"]);
	});

	it("keeps errored projects pending so Import All retries them", () => {
		const projects = [p("a")];
		const decisions = new Map([["a", importDecision]]);
		const states = new Map([
			["a", { kind: "error" as const, message: "boom" }],
		]);
		expect(selectPendingProjects(projects, decisions, states)).toHaveLength(1);
	});

	it("excludes needs-relocate projects — they require the row's confirm flow", () => {
		const projects = [p("a")];
		const decisions = new Map([["a", importDecision]]);
		const states = new Map([
			[
				"a",
				{
					kind: "needs-relocate" as const,
					v2ProjectId: "v2-1",
					message: "already set up elsewhere",
				},
			],
		]);
		expect(selectPendingProjects(projects, decisions, states)).toHaveLength(0);
	});
});

describe("planProjectRowAction", () => {
	const base = {
		status: { kind: "idle" } as ProjectImportStatus,
		isImportingAll: false,
		findByPathPending: false,
		findByPathErrorMessage: null as string | null,
		findByPathData: { candidates: [], cloudErrors: [] } as Pick<
			ProjectFindByPathResult,
			"candidates" | "cloudErrors"
		>,
		serverImported: false,
	};

	it("running status wins over everything", () => {
		expect(
			planProjectRowAction({
				...base,
				status: { kind: "running" },
				serverImported: true,
			}),
		).toEqual({ kind: "running" });
	});

	it("imported (server or session) renders the Linked state", () => {
		expect(planProjectRowAction({ ...base, serverImported: true })).toEqual({
			kind: "imported",
			label: "Linked",
		});
		expect(
			planProjectRowAction({
				...base,
				status: { kind: "imported", v2ProjectId: "v2-1" },
			}),
		).toEqual({ kind: "imported", label: "Linked" });
	});

	it("needs-relocate renders the confirm flow, disabled during Import All", () => {
		const status: ProjectImportStatus = {
			kind: "needs-relocate",
			v2ProjectId: "v2-1",
			message: "already set up on this device at /old/path.  Remove",
		};
		expect(planProjectRowAction({ ...base, status })).toMatchObject({
			kind: "confirm-relocate",
			disabled: false,
		});
		expect(
			planProjectRowAction({ ...base, status, isImportingAll: true }),
		).toMatchObject({ kind: "confirm-relocate", disabled: true });
	});

	it("import errors show Queued during a batch, retryable error otherwise", () => {
		const status: ProjectImportStatus = { kind: "error", message: "boom" };
		expect(planProjectRowAction({ ...base, status })).toEqual({
			kind: "error",
			message: "boom",
			retry: "import",
		});
		expect(
			planProjectRowAction({ ...base, status, isImportingAll: true }),
		).toEqual({ kind: "running", label: "Queued" });
	});

	it("query errors are retryable via refetch", () => {
		expect(
			planProjectRowAction({
				...base,
				findByPathErrorMessage: "host unreachable",
			}),
		).toEqual({ kind: "error", message: "host unreachable", retry: "query" });
	});

	it("pending discovery renders the running state", () => {
		expect(planProjectRowAction({ ...base, findByPathPending: true })).toEqual({
			kind: "running",
		});
	});

	it("cloud unreachable with no candidates surfaces a query-retryable error", () => {
		const cloudDown = {
			candidates: [],
			cloudErrors: [{ url: "https://github.com/acme/demo", message: "503" }],
		} as unknown as Pick<ProjectFindByPathResult, "candidates" | "cloudErrors">;
		expect(
			planProjectRowAction({ ...base, findByPathData: cloudDown }),
		).toEqual({
			kind: "error",
			message: "Couldn't reach cloud for https://github.com/acme/demo: 503",
			retry: "query",
		});
	});

	it("ready and pick rows are disabled while Import All runs", () => {
		expect(planProjectRowAction({ ...base, isImportingAll: true })).toEqual({
			kind: "ready",
			label: "Import",
			disabled: true,
		});
		const twoCandidates = {
			candidates: [
				{ id: "c1", name: "one" },
				{ id: "c2", name: "two" },
			],
			cloudErrors: [],
		} as unknown as Pick<ProjectFindByPathResult, "candidates" | "cloudErrors">;
		expect(
			planProjectRowAction({
				...base,
				findByPathData: twoCandidates,
				isImportingAll: true,
			}),
		).toMatchObject({ kind: "pick", disabled: true });
	});

	it("single candidate labels the ready action Link", () => {
		const oneCandidate = {
			candidates: [{ id: "c1", name: "one" }],
			cloudErrors: [],
		} as unknown as Pick<ProjectFindByPathResult, "candidates" | "cloudErrors">;
		expect(
			planProjectRowAction({ ...base, findByPathData: oneCandidate }),
		).toEqual({ kind: "ready", label: "Link", disabled: false });
	});
});
