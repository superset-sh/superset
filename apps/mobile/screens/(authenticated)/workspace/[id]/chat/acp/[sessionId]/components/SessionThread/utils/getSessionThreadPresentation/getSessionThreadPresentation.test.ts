import { describe, expect, test } from "bun:test";
import { getSessionThreadPresentation } from "./getSessionThreadPresentation";

describe("getSessionThreadPresentation", () => {
	test("a failed offline resurrection explains the missing transcript and disables compose", () => {
		const presentation = getSessionThreadPresentation({
			status: "offline",
			streamStatus: "stopped",
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
				status: "offline",
				streamStatus: "connecting",
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
				status: "idle",
				streamStatus: "reconnecting",
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
				status: "awaiting_permission",
				streamStatus: "open",
				isLoading: false,
				errorText: null,
			}),
		).toMatchObject({ canCompose: true, composerStatus: "streaming" });
		expect(
			getSessionThreadPresentation({
				status: "dead",
				streamStatus: "reconnecting",
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
