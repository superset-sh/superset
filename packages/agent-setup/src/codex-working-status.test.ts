import { describe, expect, it } from "bun:test";
import { getCodexGlobalHooksJsonContent } from "./agent-wrappers-claude-codex-opencode";

const command =
	'[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_HOOK_HARNESS=codex "$SUPERSET_HOME_DIR/hooks/notify.sh" || true';

describe("Codex working status hooks", () => {
	it("reasserts working after every tool while keeping pre-tool waiting scoped", () => {
		const content = getCodexGlobalHooksJsonContent("/tmp/notify.sh");
		if (!content) throw new Error("expected hooks content");
		const hooks = JSON.parse(content).hooks;

		expect(hooks.PreToolUse).toContainEqual({
			matcher: "^request_user_input$",
			hooks: [{ type: "command", command }],
		});
		expect(hooks.PostToolUse).toContainEqual({
			matcher: "*",
			hooks: [{ type: "command", command }],
		});
	});
});
