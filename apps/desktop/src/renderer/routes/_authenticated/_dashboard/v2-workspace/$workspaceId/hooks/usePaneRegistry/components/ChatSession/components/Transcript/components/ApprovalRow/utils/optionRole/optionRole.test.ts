import { describe, expect, test } from "bun:test";
import { optionRole } from "./optionRole";

describe("optionRole", () => {
	test("trusts the kind the agent sent", () => {
		expect(
			optionRole({ optionId: "x", label: "Yes", kind: "reject_always" }),
		).toBe("reject");
		expect(
			optionRole({ optionId: "x", label: "No", kind: "allow_always" }),
		).toBe("allow_always");
		expect(
			optionRole({ optionId: "x", label: "Always", kind: "allow_once" }),
		).toBe("allow_once");
	});
	test("reads scope from the id and label when there is no kind", () => {
		expect(optionRole({ optionId: "deny", label: "Deny" })).toBe("reject");
		expect(optionRole({ optionId: "no", label: "No" })).toBe("reject");
		expect(optionRole({ optionId: "decline", label: "Decline" })).toBe(
			"reject",
		);
		expect(
			optionRole({ optionId: "allow_session", label: "Allow for session" }),
		).toBe("allow_always");
		expect(optionRole({ optionId: "yes_all", label: "Yes, allow all" })).toBe(
			"allow_always",
		);
		expect(optionRole({ optionId: "once", label: "Allow once" })).toBe(
			"allow_once",
		);
		expect(optionRole({ optionId: "yes", label: "Just this time" })).toBe(
			"allow_once",
		);
	});
	test("leaves a grant of unsaid scope out of the narrow slot", () => {
		expect(optionRole({ optionId: "allow", label: "Allow" })).toBe("allow");
		expect(optionRole({ optionId: "yes", label: "Yes" })).toBe("allow");
	});
});
