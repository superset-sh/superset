import { describe, expect, it } from "bun:test";
import { getOpenUrlRequestConsumeKey } from "./useConsumeOpenUrlRequest";

describe("getOpenUrlRequestConsumeKey", () => {
	it("dedupes repeated URL open requests without a request id", () => {
		expect(
			getOpenUrlRequestConsumeKey({
				url: "http://localhost:3000",
				target: "current-tab",
				requestId: undefined,
			}),
		).toBe("current-tab:http://localhost:3000");
	});

	it("treats each request id as a fresh URL open command", () => {
		expect(
			getOpenUrlRequestConsumeKey({
				url: "http://localhost:3000",
				target: "new-tab",
				requestId: "request-1",
			}),
		).toBe("new-tab:http://localhost:3000:request:request-1");
		expect(
			getOpenUrlRequestConsumeKey({
				url: "http://localhost:3000",
				target: "new-tab",
				requestId: "request-2",
			}),
		).toBe("new-tab:http://localhost:3000:request:request-2");
	});
});
