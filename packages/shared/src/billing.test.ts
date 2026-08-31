import { describe, expect, test } from "bun:test";
import { planAllowsTriggerKind, requiredPlanForTriggerKind } from "./billing";
import { LAUNCHED_TRIGGER_KINDS } from "./constants";

/** The one kind every plan gets. Everything else is a paid provider. */
const FREE_KINDS = new Set<string>(["schedule"]);

describe("planAllowsTriggerKind", () => {
	test("free plans get schedules and nothing else", () => {
		expect(planAllowsTriggerKind("free", "schedule")).toBe(true);
		expect(planAllowsTriggerKind("free", "slack")).toBe(false);
		expect(planAllowsTriggerKind("free", "microsoft_teams")).toBe(false);
	});

	test("pro gets the pro providers but not the enterprise ones", () => {
		expect(planAllowsTriggerKind("pro", "slack")).toBe(true);
		expect(planAllowsTriggerKind("pro", "linear")).toBe(true);
		expect(planAllowsTriggerKind("pro", "microsoft_teams")).toBe(false);
	});

	test("enterprise gets everything", () => {
		for (const kind of LAUNCHED_TRIGGER_KINDS) {
			expect(planAllowsTriggerKind("enterprise", kind)).toBe(true);
		}
	});

	test("an unknown kind is unrestricted rather than blocked", () => {
		// The map gates known providers; it is not an allowlist, so a kind it
		// has never heard of must not become accidentally ungateable-but-blocked.
		expect(requiredPlanForTriggerKind("not_a_provider")).toBeUndefined();
		expect(planAllowsTriggerKind("free", "not_a_provider")).toBe(true);
	});
});

/**
 * The drift guard, and the reason this file exists.
 *
 * Adding a provider is a code-only change everywhere else, so nothing forces
 * whoever adds one to think about billing — and a kind missing from the map is
 * silently free for everybody. This fails the moment that happens.
 */
describe("every launched provider is priced", () => {
	for (const kind of LAUNCHED_TRIGGER_KINDS) {
		test(`${kind}`, () => {
			if (FREE_KINDS.has(kind)) {
				expect(requiredPlanForTriggerKind(kind)).toBeUndefined();
				return;
			}
			expect(requiredPlanForTriggerKind(kind)).toBeDefined();
			expect(planAllowsTriggerKind("free", kind)).toBe(false);
		});
	}
});
