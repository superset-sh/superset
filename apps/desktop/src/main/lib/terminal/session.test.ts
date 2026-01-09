import { describe, expect, it } from "bun:test";
import { flushSession, recoverScrollback } from "./session";
import type { TerminalSession } from "./types";

describe("session", () => {
	describe("recoverScrollback", () => {
		it("should return existing scrollback if provided", () => {
			const result = recoverScrollback("existing content");

			expect(result.scrollback).toBe("existing content");
			expect(result.wasRecovered).toBe(true);
		});

		it("should return empty scrollback when no existing scrollback", () => {
			const result = recoverScrollback(null);

			expect(result.scrollback).toBe("");
			expect(result.wasRecovered).toBe(false);
		});
	});

	describe("flushSession", () => {
		it("should dispose data batcher", () => {
			let disposed = false;
			const mockDataBatcher = {
				dispose: () => {
					disposed = true;
				},
			};

			const mockSession = {
				dataBatcher: mockDataBatcher,
				scrollback: "initial",
			} as unknown as TerminalSession;

			flushSession(mockSession);

			expect(disposed).toBe(true);
		});
	});
});
