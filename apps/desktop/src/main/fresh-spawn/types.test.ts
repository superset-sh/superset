import { describe, expect, it } from "bun:test";
import {
	ClientToServerStreamFrameSchema,
	ServerToClientStreamFrameSchema,
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

	describe("streaming frames", () => {
		describe("server→client", () => {
			it("validates stdout frame with base64 data", () => {
				expect(() =>
					ServerToClientStreamFrameSchema.parse({
						type: "stdout",
						data: "aGVsbG8=",
					}),
				).not.toThrow();
			});

			it("validates stderr frame", () => {
				expect(() =>
					ServerToClientStreamFrameSchema.parse({
						type: "stderr",
						data: "",
					}),
				).not.toThrow();
			});

			it("validates exit frame with code and signal", () => {
				expect(() =>
					ServerToClientStreamFrameSchema.parse({
						type: "exit",
						code: 0,
						signal: null,
					}),
				).not.toThrow();
			});

			it("validates exit frame with signal and null code", () => {
				expect(() =>
					ServerToClientStreamFrameSchema.parse({
						type: "exit",
						code: null,
						signal: "SIGTERM",
					}),
				).not.toThrow();
			});

			it("rejects unknown type", () => {
				expect(() =>
					ServerToClientStreamFrameSchema.parse({
						type: "unknown",
					}),
				).toThrow();
			});
		});

		describe("client→server", () => {
			it("validates stdin frame", () => {
				expect(() =>
					ClientToServerStreamFrameSchema.parse({
						type: "stdin",
						data: "cHdkCg==",
					}),
				).not.toThrow();
			});

			it("validates resize frame", () => {
				expect(() =>
					ClientToServerStreamFrameSchema.parse({
						type: "resize",
						cols: 120,
						rows: 40,
					}),
				).not.toThrow();
			});

			it("rejects resize with zero dims", () => {
				expect(() =>
					ClientToServerStreamFrameSchema.parse({
						type: "resize",
						cols: 0,
						rows: 40,
					}),
				).toThrow();
			});

			it("validates signal frame", () => {
				expect(() =>
					ClientToServerStreamFrameSchema.parse({
						type: "signal",
						name: "SIGINT",
					}),
				).not.toThrow();
			});

			it("rejects signal with empty name", () => {
				expect(() =>
					ClientToServerStreamFrameSchema.parse({
						type: "signal",
						name: "",
					}),
				).toThrow();
			});
		});
	});
});
