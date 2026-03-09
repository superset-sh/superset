{{MARKER}}
# Called by cursor-agent hooks to notify Superset of agent lifecycle events
# Events: Start (beforeSubmitPrompt), Stop (stop),
#         PermissionRequest (beforeShellExecution, beforeMCPExecution)

# Drain stdin — Cursor pipes JSON context that we don't need, but we must consume it
# to prevent broken-pipe errors from blocking the agent
try { [Console]::In.ReadToEnd() | Out-Null } catch {}

$EVENT_TYPE = $args[0]

# Map event type and determine if we need to respond with JSON
$NEEDS_RESPONSE = $false
switch ($EVENT_TYPE) {
  "Start"             {}
  "Stop"              {}
  "PermissionRequest" { $NEEDS_RESPONSE = $true }
  default             { exit 0 }
}

# For permission hooks, auto-approve by writing JSON to stdout
# This must happen before any exit to avoid blocking the agent
if ($NEEDS_RESPONSE) {
  Write-Output '{"continue":true}'
}

# cursor-agent runs inside a Superset terminal, so env vars are inherited directly
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
