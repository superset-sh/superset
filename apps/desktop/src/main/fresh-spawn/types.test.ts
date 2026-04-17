import { describe, expect, it } from "bun:test";
import {
	type SpawnRequest,
	SpawnRequestSchema,
	type SpawnResponse,
	SpawnResponseSchema,
} from "./types";

describe("fresh-spawn protocol types", () => {
	describe("SpawnRequestSchema", () => {
		it("parses a valid spawn-pty-subprocess request", () => {
			const request: SpawnRequest = {
				type: "spawn-pty-subprocess",
				token: "super-secret-token",
				env: { HOME: "/Users/test", PATH: "/usr/bin" },
			};

			expect(() => SpawnRequestSchema.parse(request)).not.toThrow();
		});

		it("parses a valid fresh-exec request", () => {
			const request: SpawnRequest = {
				type: "fresh-exec",
				token: "super-secret-token",
				command: "gh",
				args: ["auth", "status"],
				cwd: "/Users/test/project",
				env: { HOME: "/Users/test", PATH: "/usr/bin" },
				ptyCols: 120,
				ptyRows: 40,
			};

			expect(() => SpawnRequestSchema.parse(request)).not.toThrow();
		});

		it("throws when the token field is missing", () => {
			const request = {
				type: "spawn-pty-subprocess",
				env: { HOME: "/Users/test" },
			};

			expect(() => SpawnRequestSchema.parse(request)).toThrow();
		});

		it("throws when fresh-exec request is missing ptyCols", () => {
			const request = {
				type: "fresh-exec",
				token: "super-secret-token",
				command: "gh",
				args: ["auth", "status"],
				cwd: "/Users/test/project",
				env: { HOME: "/Users/test" },
				ptyRows: 40,
			};

			expect(() => SpawnRequestSchema.parse(request)).toThrow();
		});
	});

	describe("SpawnResponseSchema", () => {
		it("parses a valid ok response", () => {
			const response: SpawnResponse = {
				type: "ok",
				pid: 12345,
			};

			expect(() => SpawnResponseSchema.parse(response)).not.toThrow();
		});

		it("parses a valid error response", () => {
			const response: SpawnResponse = {
				type: "error",
				message: "spawn failed: ENOENT",
				code: "E_SPAWN_FAILED",
			};

			expect(() => SpawnResponseSchema.parse(response)).not.toThrow();
		});

		it("throws when ok response has a non-positive pid", () => {
			const response = {
				type: "ok",
				pid: 0,
			};

			expect(() => SpawnResponseSchema.parse(response)).toThrow();
		});
	});
});
