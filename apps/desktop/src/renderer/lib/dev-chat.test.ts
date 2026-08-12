import { describe, expect, it } from "bun:test";
import {
	DEV_CHAT_MODELS,
	getDesktopChatModelOptions,
	resolveDesktopChatOrganizationId,
} from "./dev-chat";

describe("dev chat helpers", () => {
	it("uses the mock organization in dev mode", () => {
		expect(resolveDesktopChatOrganizationId(null, true)).toBe("mock-org-id");
		expect(resolveDesktopChatOrganizationId("org-123", true)).toBe(
			"mock-org-id",
		);
	});

	it("keeps the real organization outside dev mode", () => {
		expect(resolveDesktopChatOrganizationId("org-123", false)).toBe("org-123");
		expect(resolveDesktopChatOrganizationId(null, false)).toBeNull();
	});

	it("returns the fallback model list only in dev mode", () => {
		expect(getDesktopChatModelOptions(true)).toEqual(DEV_CHAT_MODELS);
		expect(getDesktopChatModelOptions(false)).toEqual([]);
	});
});
