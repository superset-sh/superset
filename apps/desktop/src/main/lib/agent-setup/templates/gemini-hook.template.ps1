{{MARKER}}
# Called by Gemini CLI hooks to notify Superset of agent lifecycle events
# Events: BeforeAgent → Start, AfterAgent → Stop, AfterTool → Start
# Gemini hooks receive JSON via stdin and MUST output valid JSON to stdout

# Read JSON from stdin
$INPUT = [Console]::In.ReadToEnd()

# Extract hook_event_name from Gemini's JSON payload
$EVENT_TYPE = ""
if ($INPUT -match '"hook_event_name"\s*:\s*"([^"]*)"') { $EVENT_TYPE = $Matches[1] }

# Map Gemini event names to Superset event types
switch ($EVENT_TYPE) {
  "BeforeAgent" { $EVENT_TYPE = "Start" }
  "AfterAgent"  { $EVENT_TYPE = "Stop" }
  "AfterTool"   { $EVENT_TYPE = "Start" }
  default {
    # Unknown event — output required JSON and exit
    Write-Output '{}'
    exit 0
  }
}

# Output required JSON response immediately to avoid blocking the agent
Write-Output '{}'

# Skip notification if not inside a Superset terminal
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
