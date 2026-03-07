{{MARKER}}
# Called by GitHub Copilot CLI hooks to notify Superset of agent lifecycle events
# Events: sessionStart → Start, sessionEnd → Stop, userPromptSubmitted → Start,
#         postToolUse → Start, preToolUse → PermissionRequest
# Copilot CLI hooks receive JSON via stdin and MUST output valid JSON to stdout

# Drain stdin — Copilot pipes JSON context that we don't need, but we must
# consume it to prevent broken-pipe errors from blocking the agent
try { [Console]::In.ReadToEnd() | Out-Null } catch {}

# Event name is passed as $args[0] from our hooks.json command
$EVENT_TYPE = $args[0]

switch ($EVENT_TYPE) {
  "sessionStart"        { $EVENT_TYPE = "Start" }
  "sessionEnd"          { $EVENT_TYPE = "Stop" }
  "userPromptSubmitted" { $EVENT_TYPE = "Start" }
  "postToolUse"         { $EVENT_TYPE = "Start" }
  "preToolUse"          { $EVENT_TYPE = "PermissionRequest" }
  default {
    Write-Output '{}'
    exit 0
  }
}

# Must output valid JSON to avoid blocking the agent
Write-Output '{}'

if (-not $env:SUPERSET_TAB_ID) { exit 0 }

$port = if ($env:SUPERSET_PORT) { $env:SUPERSET_PORT } else { "{{DEFAULT_PORT}}" }
$baseUrl = "http://127.0.0.1:$port/hook/complete"

$queryParams = @(
  "paneId=$([Uri]::EscapeDataString($env:SUPERSET_PANE_ID))",
  "tabId=$([Uri]::EscapeDataString($env:SUPERSET_TAB_ID))",
  "workspaceId=$([Uri]::EscapeDataString($env:SUPERSET_WORKSPACE_ID))",
  "eventType=$([Uri]::EscapeDataString($EVENT_TYPE))",
  "env=$([Uri]::EscapeDataString($env:SUPERSET_ENV))",
  "version=$([Uri]::EscapeDataString($env:SUPERSET_HOOK_VERSION))"
)
$url = "$baseUrl`?" + ($queryParams -join "&")

try {
  Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
} catch {}

exit 0
