import { describe, expect, it } from "bun:test";
import { resolveChatRefetchIntervalMs, toRefetchIntervalMs } from "./polling";

describe("toRefetchIntervalMs", () => {
	it("converts fps to a bounded millisecond interval", () => {
		expect(toRefetchIntervalMs(60)).toBe(16);
		expect(toRefetchIntervalMs(10)).toBe(100);
		expect(toRefetchIntervalMs(0)).toBe(16);
	});
});

describe("resolveChatRefetchIntervalMs", () => {
	it("keeps local chat on the existing fps-based cadence", () => {
		expect(
			resolveChatRefetchIntervalMs({
				fps: 60,
				transport: "local",
			}),
		).toBe(16);
	});

	it("uses a slower fixed cadence for SSH-backed chat", () => {
		expect(
			resolveChatRefetchIntervalMs({
				fps: 60,
				transport: "ssh",
			}),
		).toBe(250);
		expect(
			resolveChatRefetchIntervalMs({
				fps: 5,
				transport: "ssh",
			}),
		).toBe(250);
	});
});
