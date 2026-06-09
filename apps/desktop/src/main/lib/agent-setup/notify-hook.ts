import fs from "node:fs";
import path from "node:path";
import { env } from "shared/env.shared";
import { HOOKS_DIR } from "./paths";

export const NOTIFY_SCRIPT_NAME = "notify.sh";
export const WINDOWS_NOTIFY_SCRIPT_NAME = "notify.cmd";
export const WINDOWS_NOTIFY_NODE_SCRIPT_NAME = "notify.mjs";
export const NOTIFY_SCRIPT_MARKER = "# Superset agent notification hook v5";
export const WINDOWS_NOTIFY_SCRIPT_MARKER =
	"rem Superset agent notification hook v5";

const NOTIFY_SCRIPT_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"notify-hook.template.sh",
);

function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(filePath, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	fs.writeFileSync(filePath, content, { mode });
	return true;
}

export function getNotifyScriptPath(
	platform: NodeJS.Platform = process.platform,
): string {
	return path.join(
		HOOKS_DIR,
		platform === "win32" ? WINDOWS_NOTIFY_SCRIPT_NAME : NOTIFY_SCRIPT_NAME,
	);
}

export function getNotifyNodeScriptPath(): string {
	return path.join(HOOKS_DIR, WINDOWS_NOTIFY_NODE_SCRIPT_NAME);
}

export function getNotifyScriptContent(): string {
	const template = fs.readFileSync(NOTIFY_SCRIPT_TEMPLATE_PATH, "utf-8");
	return template
		.replaceAll("{{MARKER}}", NOTIFY_SCRIPT_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", String(env.DESKTOP_NOTIFICATIONS_PORT));
}

function batchSetValue(value: string): string {
	return value.replaceAll("%", "%%").replaceAll("\r", "").replaceAll("\n", "");
}

export function getWindowsNotifyCommandScriptContent(
	bundledNodeRuntimePath: string = process.execPath,
): string {
	return `@echo off\r\n${WINDOWS_NOTIFY_SCRIPT_MARKER}\r\nsetlocal\r\nset "HOOK_DIR=%~dp0"\r\nset "NODE_EXE=${batchSetValue(bundledNodeRuntimePath)}"\r\nif defined SUPERSET_NOTIFY_NODE set "NODE_EXE=%SUPERSET_NOTIFY_NODE%"\r\nif not exist "%NODE_EXE%" if exist "%HOOK_DIR%..\\bin\\node.exe" set "NODE_EXE=%HOOK_DIR%..\\bin\\node.exe"\r\nif not exist "%NODE_EXE%" if exist "%HOOK_DIR%..\\lib\\node.exe" set "NODE_EXE=%HOOK_DIR%..\\lib\\node.exe"\r\nif not exist "%NODE_EXE%" for %%I in (node.exe) do set "NODE_EXE=%%~$PATH:I"\r\nif not exist "%NODE_EXE%" exit /b 0\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"%NODE_EXE%" "%HOOK_DIR%${WINDOWS_NOTIFY_NODE_SCRIPT_NAME}" %*\r\nexit /b 0\r\n`;
}

export function getNotifyNodeScriptContent(): string {
	return `#!/usr/bin/env node
// ${NOTIFY_SCRIPT_MARKER}

const DEFAULT_PORT = ${JSON.stringify(String(env.DESKTOP_NOTIFICATIONS_PORT))};

function env(name) {
  return process.env[name] || "";
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(value || "");
}

function debugHooksEnabled() {
  return truthy(env("SUPERSET_DEBUG_HOOKS")) || env("SUPERSET_ENV") === "development" || env("NODE_ENV") === "development";
}

async function readInput() {
  if (process.argv.length > 2) {
    return process.argv.slice(2).join(" ");
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function parsePayload(input) {
  try {
    return JSON.parse(input || "{}");
  } catch {
    return null;
  }
}

function field(payload, names) {
  if (!payload || typeof payload !== "object") return "";
  for (const name of names) {
    const value = payload[name];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function v1EventTypeFor(eventType) {
  if (["Attached", "attached", "SessionStart", "sessionStart", "session_start"].includes(eventType)) return "Start";
  if (["Detached", "detached", "SessionEnd", "sessionEnd", "session_end"].includes(eventType)) return "Stop";
  return eventType;
}

function debug(message) {
  if (debugHooksEnabled()) {
    console.error(message);
  }
}

async function main() {
  const payload = parsePayload(await readInput());
  const hookSessionId = field(payload, ["session_id"]);
  const resourceId = field(payload, ["resourceId", "resource_id"]);
  const sessionId = resourceId || hookSessionId;
  let eventType = field(payload, ["hook_event_name"]);

  if (!eventType) {
    const codexType = field(payload, ["type"]);
    if (["agent-turn-complete", "task_complete"].includes(codexType)) eventType = "Stop";
    else if (codexType === "task_started") eventType = "Start";
    else if (["exec_approval_request", "apply_patch_approval_request", "request_user_input"].includes(codexType)) eventType = "PermissionRequest";
  }

  if (eventType === "UserPromptSubmit") eventType = "Start";
  if (!eventType) return;

  debug(\`[notify-hook] event=\${eventType} terminalId=\${env("SUPERSET_TERMINAL_ID")} agentId=\${env("SUPERSET_AGENT_ID")} hookSessionId=\${hookSessionId} resourceId=\${resourceId} paneId=\${env("SUPERSET_PANE_ID")} tabId=\${env("SUPERSET_TAB_ID")} workspaceId=\${env("SUPERSET_WORKSPACE_ID")}\`);

  if (env("SUPERSET_HOST_AGENT_HOOK_URL") && env("SUPERSET_TERMINAL_ID")) {
    try {
      const response = await fetchWithTimeout(
        env("SUPERSET_HOST_AGENT_HOOK_URL"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            json: {
              terminalId: env("SUPERSET_TERMINAL_ID"),
              eventType,
              agent: {
                agentId: env("SUPERSET_AGENT_ID"),
                sessionId,
              },
            },
          }),
        },
        5000,
      );
      debug(\`[notify-hook] host-service dispatched status=\${response.status}\`);
      if (response.ok) return;
    } catch {}
  }

  if (!env("SUPERSET_TAB_ID") && !sessionId && !env("SUPERSET_TERMINAL_ID")) {
    return;
  }

  const port = env("SUPERSET_PORT") || DEFAULT_PORT;
  const params = new URLSearchParams({
    paneId: env("SUPERSET_PANE_ID"),
    tabId: env("SUPERSET_TAB_ID"),
    workspaceId: env("SUPERSET_WORKSPACE_ID"),
    terminalId: env("SUPERSET_TERMINAL_ID"),
    sessionId,
    hookSessionId,
    resourceId,
    eventType: v1EventTypeFor(eventType),
    env: env("SUPERSET_ENV"),
    version: env("SUPERSET_HOOK_VERSION"),
  });

  try {
    const response = await fetchWithTimeout(\`http://127.0.0.1:\${port}/hook/complete?\${params.toString()}\`, { method: "GET" }, 2000);
    debug(\`[notify-hook] v1 dispatched status=\${response.status}\`);
  } catch {}
}

main().catch(() => {});
`;
}

export function createNotifyScript(): void {
	const notifyPath = path.join(HOOKS_DIR, NOTIFY_SCRIPT_NAME);
	const script = getNotifyScriptContent();
	const changed = writeFileIfChanged(notifyPath, script, 0o755);
	const changedCmd =
		process.platform === "win32"
			? writeFileIfChanged(
					path.join(HOOKS_DIR, WINDOWS_NOTIFY_SCRIPT_NAME),
					getWindowsNotifyCommandScriptContent(),
					0o644,
				)
			: false;
	const changedNode =
		process.platform === "win32"
			? writeFileIfChanged(
					getNotifyNodeScriptPath(),
					getNotifyNodeScriptContent(),
					0o644,
				)
			: false;
	console.log(
		`[agent-setup] ${changed || changedCmd || changedNode ? "Updated" : "Verified"} notify hook`,
	);
}
