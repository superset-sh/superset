import { describe, expect, it } from "bun:test";
import {
	MissingTerminalObservations,
	TerminalLifecycleOperations,
	terminalLifecycleState,
} from "./lifecycle.ts";

describe("terminal lifecycle authority", () => {
	it("gives durable termination precedence over an active row", () => {
		expect(terminalLifecycleState(undefined)).toBe("missing");
		for (const status of ["active", "exited", "disposed"]) {
			expect(terminalLifecycleState({ status, disposeRequestedAt: 0 })).toBe(
				"disposed",
			);
		}
		expect(terminalLifecycleState({ status: "active" })).toBe("active");
		expect(terminalLifecycleState({ status: "exited" })).toBe("exited");
		expect(terminalLifecycleState({ status: "unknown" })).toBe("exited");
	});

	it("serializes one terminal while allowing unrelated terminals to progress", async () => {
		const operations = new TerminalLifecycleOperations();
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: string[] = [];
		const first = operations.run("a", async () => {
			seen.push("create");
			await barrier;
		});
		const second = operations.run("a", async () => {
			seen.push("dispose");
		});
		await operations.run("b", async () => {
			seen.push("other");
		});
		expect(seen).toEqual(["create", "other"]);
		release();
		await Promise.all([first, second]);
		expect(seen).toEqual(["create", "other", "dispose"]);
	});

	it("a rejected operation does not poison later work", async () => {
		const operations = new TerminalLifecycleOperations();
		await expect(
			operations.run("a", async () => {
				throw new Error("failed");
			}),
		).rejects.toThrow("failed");
		expect(await operations.run("a", async () => 42)).toBe(42);
	});

	it("reserves ownership before execution and retains it through queued work", async () => {
		const operations = new TerminalLifecycleOperations();
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = operations.run(
			"terminal",
			async () => {
				throw new Error("failed create");
			},
			"workspace",
		);
		expect(operations.getWorkspaceId("terminal")).toBe("workspace");
		const queued = operations.run("terminal", () => barrier, "workspace");
		await expect(first).rejects.toThrow("failed create");
		expect(operations.getWorkspaceId("terminal")).toBe("workspace");
		const disposing = operations.run("terminal", async () => {});
		release();
		await queued;
		await disposing;
		expect(operations.getWorkspaceId("terminal")).toBeUndefined();
	});

	it("releases ownership when the last create rejects", async () => {
		const operations = new TerminalLifecycleOperations();
		await expect(
			operations.run(
				"terminal",
				async () => {
					throw new Error("failed create");
				},
				"first",
			),
		).rejects.toThrow("failed create");
		expect(operations.getWorkspaceId("terminal")).toBeUndefined();
		const replacement = operations.run("terminal", async () => 42, "second");
		expect(operations.getWorkspaceId("terminal")).toBe("second");
		expect(await replacement).toBe(42);
		expect(operations.getWorkspaceId("terminal")).toBeUndefined();
	});
});

describe("missing terminal observations", () => {
	it("requires consecutive observations of the same generation", () => {
		const observations = new MissingTerminalObservations();
		const rows = new Map([["a", { createdAt: 1 }]]);
		expect([...observations.confirm(rows)]).toEqual([]);
		expect([...observations.confirm(rows)]).toEqual(["a"]);
		expect([
			...observations.confirm(new Map([["a", { createdAt: 2 }]])),
		]).toEqual([]);
	});
	it("reappearance and failed observation reset confirmation", () => {
		const observations = new MissingTerminalObservations();
		const rows = new Map([["a", { createdAt: 1 }]]);
		observations.confirm(rows);
		observations.confirm(new Map());
		expect([...observations.confirm(rows)]).toEqual([]);
		observations.reset();
		expect([...observations.confirm(rows)]).toEqual([]);
	});
});
