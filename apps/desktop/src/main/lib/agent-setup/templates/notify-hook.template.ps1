{{MARKER}}
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if ($args.Count -gt 0) {
  $INPUT = $args[0]
} else {
  $INPUT = [Console]::In.ReadToEnd()
}

# Extract Mastra identifiers when available (mastracode hooks)
# `resourceId` / `resource_id` is the Superset chat session id we assign via
# harness.setResourceId(...). `session_id` is Mastra's internal runtime id.
$HOOK_SESSION_ID = ""
if ($INPUT -match '"session_id"\s*:\s*"([^"]*)"') { $HOOK_SESSION_ID = $Matches[1] }

$RESOURCE_ID = ""
if ($INPUT -match '"resourceId"\s*:\s*"([^"]*)"') { $RESOURCE_ID = $Matches[1] }
if (-not $RESOURCE_ID) {
  if ($INPUT -match '"resource_id"\s*:\s*"([^"]*)"') { $RESOURCE_ID = $Matches[1] }
}

$SESSION_ID = if ($RESOURCE_ID) { $RESOURCE_ID } else { $HOOK_SESSION_ID }

# Skip if this isn't a Superset terminal hook and no Mastra session context exists
if (-not $env:SUPERSET_TAB_ID -and -not $SESSION_ID) { exit 0 }

# Extract event type - Claude uses "hook_event_name", Codex uses "type"
$EVENT_TYPE = ""
if ($INPUT -match '"hook_event_name"\s*:\s*"([^"]*)"') { $EVENT_TYPE = $Matches[1] }
if (-not $EVENT_TYPE) {
  # Check for Codex "type" field (e.g., "agent-turn-complete")
  $CODEX_TYPE = ""
  if ($INPUT -match '"type"\s*:\s*"([^"]*)"') { $CODEX_TYPE = $Matches[1] }
  if ($CODEX_TYPE -eq "agent-turn-complete") {
    $EVENT_TYPE = "Stop"
  }
}

# NOTE: We intentionally do NOT default to "Stop" if EVENT_TYPE is empty.
# Parse failures should not trigger completion notifications.
# The server will ignore requests with missing eventType (forward compatibility).

# Only UserPromptSubmit is mapped here; other events are normalized
# server-side by mapEventType() to keep a single source of truth.
if ($EVENT_TYPE -eq "UserPromptSubmit") { $EVENT_TYPE = "Start" }

# If no event type was found, skip the notification
# This prevents parse failures from causing false completion notifications
if (-not $EVENT_TYPE) { exit 0 }

$DEBUG_HOOKS_ENABLED = "0"
if ($env:SUPERSET_DEBUG_HOOKS) {
  switch ($env:SUPERSET_DEBUG_HOOKS) {
    { $_ -in @("1", "true", "TRUE", "True", "yes", "YES", "on", "ON") } { $DEBUG_HOOKS_ENABLED = "1" }
    default { $DEBUG_HOOKS_ENABLED = "0" }
  }
} elseif ($env:SUPERSET_ENV -eq "development" -or $env:NODE_ENV -eq "development") {
  $DEBUG_HOOKS_ENABLED = "1"
}

if ($DEBUG_HOOKS_ENABLED -eq "1") {
  Write-Error "[notify-hook] event=$EVENT_TYPE sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$env:SUPERSET_PANE_ID tabId=$env:SUPERSET_TAB_ID workspaceId=$env:SUPERSET_WORKSPACE_ID"
}

$port = if ($env:SUPERSET_PORT) { $env:SUPERSET_PORT } else { "{{DEFAULT_PORT}}" }
$baseUrl = "http://127.0.0.1:$port/hook/complete"

$queryParams = @(
  "paneId=$([Uri]::EscapeDataString($env:SUPERSET_PANE_ID))",
  "tabId=$([Uri]::EscapeDataString($env:SUPERSET_TAB_ID))",
  "workspaceId=$([Uri]::EscapeDataString($env:SUPERSET_WORKSPACE_ID))",
  "sessionId=$([Uri]::EscapeDataString($SESSION_ID))",
  "hookSessionId=$([Uri]::EscapeDataString($HOOK_SESSION_ID))",
  "resourceId=$([Uri]::EscapeDataString($RESOURCE_ID))",
  "eventType=$([Uri]::EscapeDataString($EVENT_TYPE))",
  "env=$([Uri]::EscapeDataString($env:SUPERSET_ENV))",
  "version=$([Uri]::EscapeDataString($env:SUPERSET_HOOK_VERSION))"
)
$url = "$baseUrl`?" + ($queryParams -join "&")

# Timeouts prevent blocking agent completion if notification server is unresponsive
try {
  if ($DEBUG_HOOKS_ENABLED -eq "1") {
    $response = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 2 -ErrorAction SilentlyContinue
    Write-Error "[notify-hook] dispatched status=200"
  } else {
    Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
  }
} catch {
  if ($DEBUG_HOOKS_ENABLED -eq "1") {
    Write-Error "[notify-hook] dispatched status=error"
  }
}

exit 0
