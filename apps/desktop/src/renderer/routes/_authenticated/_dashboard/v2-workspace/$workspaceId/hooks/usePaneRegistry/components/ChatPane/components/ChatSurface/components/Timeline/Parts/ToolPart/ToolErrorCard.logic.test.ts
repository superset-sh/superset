import { describe, expect, it } from "bun:test";
import {
	cleanErrorText,
	firstLineOfError,
} from "./ToolErrorCard.logic";

describe("cleanErrorText", () => {
	it("strips a leading Error: prefix and trims", () => {
		expect(cleanErrorText("Error: something failed  ")).toBe("something failed");
	});
	it("handles lower-case error prefix", () => {
		expect(cleanErrorText("error: boom")).toBe("boom");
	});
	it("pass-through when no prefix", () => {
		expect(cleanErrorText("   raw   ")).toBe("raw");
	});
});

describe("firstLineOfError", () => {
	it("returns the first non-empty line", () => {
		expect(firstLineOfError("  \n\nmeaningful\n\ndetails")).toBe("meaningful");
	});

	it("extracts the tail after a colon when the first line is 'kind: details'", () => {
		expect(firstLineOfError("ToolError: exit status 1\nstack...")).toBe(
			"exit status 1",
		);
	});

	it("keeps the line intact when there is no colon", () => {
		expect(firstLineOfError("ProviderUnreachable")).toBe("ProviderUnreachable");
	});
});
