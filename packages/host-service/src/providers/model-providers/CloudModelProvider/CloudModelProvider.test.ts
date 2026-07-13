import { afterEach, describe, expect, it } from "bun:test";
import { CloudModelProvider } from "./CloudModelProvider";

const originalMiniMaxApiKey = process.env.MINIMAX_API_KEY;

afterEach(() => {
	if (originalMiniMaxApiKey === undefined) {
		delete process.env.MINIMAX_API_KEY;
		return;
	}
	process.env.MINIMAX_API_KEY = originalMiniMaxApiKey;
});

describe("CloudModelProvider", () => {
	it("forwards MiniMax API keys as usable cloud credentials", async () => {
		const provider = new CloudModelProvider({
			envResolver: async () => ({ MINIMAX_API_KEY: "test-minimax-key" }),
		});

		expect(await provider.hasUsableRuntimeEnv()).toBe(true);
		await provider.prepareRuntimeEnv();
		expect(process.env.MINIMAX_API_KEY).toBe("test-minimax-key");
	});
});
