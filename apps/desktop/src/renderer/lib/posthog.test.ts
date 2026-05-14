import { describe, expect, it } from "bun:test";
import {
	buildPostHogInitConfig,
	POSTHOG_SESSION_REPLAY_BLOCK_SELECTOR,
} from "./posthog";

describe("buildPostHogInitConfig", () => {
	it("blocks terminal replay surfaces and disables canvas recording", () => {
		const config = buildPostHogInitConfig();

		expect(config.disable_session_recording).toBe(true);
		expect(config.autocapture).toBe(false);
		expect(config.disable_scroll_properties).toBe(true);
		expect(POSTHOG_SESSION_REPLAY_BLOCK_SELECTOR).toContain(".xterm");
		expect(POSTHOG_SESSION_REPLAY_BLOCK_SELECTOR).toContain(
			"[data-terminal-webgl-canvas]",
		);
		expect(config.session_recording?.blockSelector).toBe(
			POSTHOG_SESSION_REPLAY_BLOCK_SELECTOR,
		);
		expect(config.session_recording?.captureCanvas).toEqual({
			recordCanvas: false,
			canvasFps: 0,
			canvasQuality: "0",
		});
	});
});
