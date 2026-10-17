// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${VAR} is shell syntax, not a template literal
import { describe, expect, it } from "bun:test";
import { rewriteToolVariables } from "./rewrite-env";

describe("rewriteToolVariables", () => {
	it("renames bare and braced variables to the Superset equivalent", () => {
		const { script } = rewriteToolVariables(
			'cp "$CONDUCTOR_ROOT_PATH/.env" .env && cd "${ORCA_WORKTREE_PATH}" && echo $T3CODE_PROJECT_ROOT ${ORCA_WORKSPACE_NAME:-x}',
		);
		expect(script).toBe(
			'cp "$SUPERSET_ROOT_PATH/.env" .env && cd "${SUPERSET_WORKSPACE_PATH}" && echo $SUPERSET_ROOT_PATH ${SUPERSET_WORKSPACE_NAME:-x}',
		);
	});

	it("does not touch a longer name that shares the prefix", () => {
		expect(rewriteToolVariables("echo $ORCA_ROOT_PATH_EXTRA").script).toBe(
			"echo $ORCA_ROOT_PATH_EXTRA",
		);
	});

	it("reports tool variables that have no equivalent", () => {
		const result = rewriteToolVariables(
			"PORT=$CONDUCTOR_PORT bun dev; echo $CONDUCTOR_PORT $HOME",
		);
		expect(result.unsupported).toEqual(["CONDUCTOR_PORT"]);
		expect(result.script).toContain("$CONDUCTOR_PORT");
	});
});
