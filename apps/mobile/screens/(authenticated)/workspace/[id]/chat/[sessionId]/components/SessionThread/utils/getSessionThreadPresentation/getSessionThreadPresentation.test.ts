import { describe, expect, test } from "bun:test";
import { getSessionThreadPresentation } from "./getSessionThreadPresentation";

describe("getSessionThreadPresentation", () => {
	test("a failed offline resurrection explains the missing transcript and disables compose", () => {
		const presentation = getSessionThreadPresentation({
			runState: "offline",
			streamStatus: "idle",
			isLoading: false,
			errorText: "No stored session to load: native-session-id",
		});

		expect(presentation).toEqual({
			bannerError: "No stored session to load: native-session-id",
			canCompose: false,
			composerStatus: "ready",
			emptyDescription:
				"The host kept the session pointer, but its native transcript could not be loaded.",
			emptyTitle: "Session could not be resumed",
			isDead: false,
			reconnecting: false,
		});
	});

	test("loading, live, permission, reconnecting, and dead states stay distinct", () => {
		expect(
			getSessionThreadPresentation({
				runState: "offline",
				streamStatus: "subscribing",
				isLoading: true,
				errorText: null,
			}),
		).toMatchObject({
			canCompose: false,
			emptyTitle: "Connecting…",
			emptyDescription: undefined,
		});
		expect(
			getSessionThreadPresentation({
				runState: "idle",
				streamStatus: "reset",
				isLoading: false,
				errorText: null,
			}),
		).toMatchObject({
			canCompose: true,
			composerStatus: "ready",
			reconnecting: true,
			emptyTitle: "No messages yet",
		});
		expect(
			getSessionThreadPresentation({
				runState: "running",
				streamStatus: "live",
				isLoading: false,
				errorText: null,
			}),
		).toMatchObject({ canCompose: true, composerStatus: "streaming" });
		expect(
			getSessionThreadPresentation({
				runState: "closed",
				streamStatus: "reset",
				isLoading: false,
				errorText: null,
			}),
		).toMatchObject({
			canCompose: false,
			isDead: true,
			reconnecting: false,
		});
	});
});
