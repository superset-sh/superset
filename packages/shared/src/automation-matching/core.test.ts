import { describe, expect, test } from "bun:test";
import type { TextFilter, TriggerScope } from "../automation-triggers";
import {
	configHasMeScope,
	resolveMeScopes,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

/**
 * Fixtures are typed as `TriggerScope` rather than left to inference on
 * purpose. `resolveMeScopes` returns the config type it was handed, which is
 * honest for its real caller — a trigger config whose `me` scope has been
 * resolved is still a trigger config — but a literal `{mode:"me"}` infers a
 * type too narrow to hold the `{mode:"list"}` it comes back as.
 */
type ActorConfig = { actor: TriggerScope };
type PeopleConfig = { actor: TriggerScope; subjectAuthor: TriggerScope };

/**
 * "Me" is stored as intent and resolved when the event arrives, so these two
 * functions decide who a trigger fires for. Getting them wrong is not a
 * rendering bug: resolving to the wrong id fires someone else's automation,
 * and resolving an unconnected account to "everyone" fires it for all of them.
 */
describe("resolveMeScopes", () => {
	test("replaces a me scope with the resolved identity", () => {
		const config: ActorConfig = { actor: { mode: "me" } };
		expect(resolveMeScopes(config, "gh-42")).toEqual({
			actor: { mode: "list", ids: ["gh-42"] },
		});
	});

	test("resolves to nobody when there is no identity", () => {
		// An empty list matches nothing. The dangerous failure would be
		// collapsing to {mode:"any"} and firing for the whole organization.
		const config: ActorConfig = { actor: { mode: "me" } };
		expect(resolveMeScopes(config, null)).toEqual({
			actor: { mode: "list", ids: [] },
		});
	});

	test("leaves other scopes and plain fields alone", () => {
		const config: {
			kind: string;
			actor: TriggerScope;
			repositories: TriggerScope;
			branches: TriggerScope;
			commentFilter: TextFilter | null;
		} = {
			kind: "github",
			actor: { mode: "me" },
			repositories: { mode: "list", ids: ["r1"] },
			branches: { mode: "any" },
			commentFilter: null,
		};
		expect(resolveMeScopes(config, "gh-42")).toEqual({
			kind: "github",
			actor: { mode: "list", ids: ["gh-42"] },
			repositories: { mode: "list", ids: ["r1"] },
			branches: { mode: "any" },
			commentFilter: null,
		});
	});

	test("resolves every me scope, not just the first", () => {
		const config: PeopleConfig = {
			actor: { mode: "me" },
			subjectAuthor: { mode: "me" },
		};
		expect(resolveMeScopes(config, "gh-42")).toEqual({
			actor: { mode: "list", ids: ["gh-42"] },
			subjectAuthor: { mode: "list", ids: ["gh-42"] },
		});
	});

	test("does not mutate the config it was given", () => {
		const config: ActorConfig = { actor: { mode: "me" } };
		resolveMeScopes(config, "gh-42");
		expect(config.actor).toEqual({ mode: "me" });
	});
});

describe("configHasMeScope", () => {
	test("is true only when a me scope is present", () => {
		expect(configHasMeScope({ actor: { mode: "me" } })).toBe(true);
		expect(configHasMeScope({ actor: { mode: "any" } })).toBe(false);
		expect(configHasMeScope({ actor: { mode: "list", ids: ["x"] } })).toBe(
			false,
		);
	});

	test("tolerates null and non-object fields", () => {
		expect(configHasMeScope({ commentFilter: null, kind: "github" })).toBe(
			false,
		);
	});
});

/**
 * An unresolved "me" reaching a matcher means a caller skipped the resolve
 * step. It has to fail closed — a pure matcher cannot look an identity up, so
 * the only safe reading is "matches nobody".
 */
describe("scope matching fails closed on an unresolved me", () => {
	test("scopeAllows rejects", () => {
		expect(scopeAllows({ mode: "me" }, "gh-42")).toBe(false);
	});

	test("scopeAllowsAny rejects", () => {
		expect(scopeAllowsAny({ mode: "me" }, ["gh-42"])).toBe(false);
	});
});
