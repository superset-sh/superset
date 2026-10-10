// Superset Prime Agent extension v2
import { execFile } from "node:child_process";
import { existsSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Parameters: pi is the extension API; env is the launching terminal's captured context.
 * What it does: Registers terminal-scoped hooks and input. Daemons load extensions at session creation, so existing sessions need a fresh start after installation or updates.
 * Output: Lifecycle handlers and an input tool; removing this file makes loaded handlers inert.
 */
export default function (pi, env) {
  if (!env?.SUPERSET_TERMINAL_ID || !env.SUPERSET_HOME_DIR) return;

  const extensionFile = new URL(import.meta.url);
  if (!existsSync(extensionFile)) return;

  if (env.SUPERSET_PRIME_BRIDGE_PATH) {
    writeFileSync(`${env.SUPERSET_PRIME_BRIDGE_PATH}.loaded`, "", { mode: 0o600 });
  }

  const notify = `${env.SUPERSET_HOME_DIR}/hooks/notify.sh`;
  let pending = Promise.resolve();
  /**
   * Parameters: eventType is the hook event; ctx supplies the resumable session ID.
   * What it does: Serializes hook calls and checks revocation at dispatch, including queued events.
   * Output: A promise settled after dispatch or a disabled-integration no-op.
   */
  function report(eventType, ctx) {
    const sessionId = ctx.sessionManager.getSessionId();
    pending = pending.then(() => new Promise((resolve) => {
      if (!existsSync(extensionFile)) { resolve(); return; }
      execFile(notify, [JSON.stringify({ hook_event_name: eventType, session_id: sessionId })],
        { timeout: 8000, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...env, SUPERSET_AGENT_ID: "prime-agent", SUPERSET_HOOK_HARNESS: "prime-agent" } }, () => resolve());
    }));
    return pending;
  }

  pi.registerTool({
    name: "superset_ask_user",
    label: "Ask user",
    description: "Ask the user a question when their answer is required before continuing. Do not use for routine status updates or a final answer.",
    parameters: {
      type: "object",
      required: ["question"],
      properties: { question: { type: "string", description: "The question to show the user" } },
    },
    /**
     * Parameters: params holds the question; ctx supplies UI and timers; other arguments follow Prime's tool API.
     * What it does: Opens input only while enabled and reports attention only while the dialog is pending.
     * Output: Answer or cancellation text; after teardown, returns without opening UI.
     */
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!existsSync(extensionFile) || !ctx.hasUI) {
        return { content: [{ type: "text", text: "Interactive input is unavailable. Ask the user in your final response." }], details: {} };
      }
      let attentionReported = false;
      const timer = ctx.setTimeout(async () => {
        attentionReported = true;
        await report("PermissionRequest", ctx);
      }, 50);
      try {
        const answer = await ctx.ui.input(params.question);
        return { content: [{ type: "text", text: answer ?? "User cancelled the question." }], details: {} };
      } finally {
        ctx.clearTimeout(timer);
        if (attentionReported) await report("Start", ctx);
      }
    },
  });

  pi.on("session_start", (_event, ctx) => report("SessionStart", ctx));
  pi.on("agent_start", (_event, ctx) => report("Start", ctx));
  pi.on("agent_end", (event, ctx) => {
    const lastAssistant = [...event.messages].reverse().find((message) => message.role === "assistant");
    return report(lastAssistant?.stopReason === "error" ? "Failed" : "Stop", ctx);
  });
  pi.on("session_shutdown", async (event, ctx) => {
    await report("SessionEnd", ctx);
    if (event.reason === "quit" && env.SUPERSET_PRIME_BRIDGE_PATH) {
      try {
        rmSync(env.SUPERSET_PRIME_BRIDGE_PATH, { force: true });
        rmSync(`${env.SUPERSET_PRIME_BRIDGE_PATH}.loaded`, { force: true });
        rmdirSync(dirname(env.SUPERSET_PRIME_BRIDGE_PATH));
      } catch {}
    }
  });
}
