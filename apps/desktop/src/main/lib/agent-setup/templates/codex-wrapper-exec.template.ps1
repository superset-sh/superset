# Codex exposes completion notifications via notify.
# For per-prompt Start notifications and permission requests, watch the TUI
# session log for task_started/exec_command_begin and *_approval_request events.
if ($env:SUPERSET_TAB_ID -and (Test-Path "{{NOTIFY_PATH}}")) {
  $env:CODEX_TUI_RECORD_SESSION = "1"
  if (-not $env:CODEX_TUI_SESSION_LOG_PATH) {
    $_superset_codex_ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $env:CODEX_TUI_SESSION_LOG_PATH = "$env:TEMP\superset-codex-session-$$_${_superset_codex_ts}.jsonl"
  }

  $_superset_log = $env:CODEX_TUI_SESSION_LOG_PATH
  $_superset_notify = "{{NOTIFY_PATH}}"

  $SUPERSET_CODEX_START_WATCHER_JOB = Start-Job -ScriptBlock {
    param($_log, $_notify)

    $_last_turn_id = ""
    $_last_approval_id = ""
    $_last_exec_call_id = ""
    $_approval_fallback_seq = 0

    function Emit-Event {
      param([string]$_event)
      $_payload = "{`"hook_event_name`":`"$_event`"}"
      try {
        & powershell.exe -NonInteractive -NoProfile -File "$_notify" "$_payload" 2>$null | Out-Null
      } catch {}
    }

    # Wait briefly for codex to create the session log.
    $_i = 0
    while (-not (Test-Path $_log) -and $_i -lt 200) {
      $_i++
      Start-Sleep -Milliseconds 50
    }
    if (-not (Test-Path $_log)) { exit 0 }

    # Tail the log file and process new lines
    $_reader = [System.IO.StreamReader]::new($_log, [System.Text.Encoding]::UTF8, $true, 4096)
    $_reader.BaseStream.Seek(0, [System.IO.SeekOrigin]::End) | Out-Null
    while ($true) {
      $_line = $_reader.ReadLine()
      if ($_line -eq $null) {
        Start-Sleep -Milliseconds 50
        continue
      }
      if ($_line -match '"dir":"to_tui"' -and $_line -match '"kind":"codex_event"' -and $_line -match '"msg":\{"type":"task_started"') {
        $_turn_id = ""
        if ($_line -match '"turn_id":"([^"]*)"') { $_turn_id = $Matches[1] }
        if (-not $_turn_id) { $_turn_id = "task_started" }
        if ($_turn_id -ne $_last_turn_id) {
          $_last_turn_id = $_turn_id
          Emit-Event "Start"
        }
      } elseif ($_line -match '"dir":"to_tui"' -and $_line -match '"kind":"codex_event"' -and $_line -match '"msg":\{"type":"[^"]*_approval_request"') {
        $_approval_id = ""
        if ($_line -match '"id":"([^"]*)"') { $_approval_id = $Matches[1] }
        if (-not $_approval_id -and $_line -match '"approval_id":"([^"]*)"') { $_approval_id = $Matches[1] }
        if (-not $_approval_id -and $_line -match '"call_id":"([^"]*)"') { $_approval_id = $Matches[1] }
        if (-not $_approval_id) {
          $_approval_fallback_seq++
          $_approval_id = "approval_request_$_approval_fallback_seq"
        }
        if ($_approval_id -ne $_last_approval_id) {
          $_last_approval_id = $_approval_id
          Emit-Event "PermissionRequest"
        }
      } elseif ($_line -match '"dir":"to_tui"' -and $_line -match '"kind":"codex_event"' -and $_line -match '"msg":\{"type":"exec_command_begin"') {
        $_exec_call_id = ""
        if ($_line -match '"call_id":"([^"]*)"') { $_exec_call_id = $Matches[1] }
        if ($_exec_call_id) {
          if ($_exec_call_id -ne $_last_exec_call_id) {
            $_last_exec_call_id = $_exec_call_id
            Emit-Event "Start"
          }
        } else {
          Emit-Event "Start"
        }
      }
    }
  } -ArgumentList $_superset_log, $_superset_notify
}

& $env:REAL_BIN -c "notify=[`"powershell.exe`",`"-NonInteractive`",`"-NoProfile`",`"-File`",`"{{NOTIFY_PATH}}`"]" @args
$SUPERSET_CODEX_STATUS = $LASTEXITCODE

if ($SUPERSET_CODEX_START_WATCHER_JOB) {
  Stop-Job -Job $SUPERSET_CODEX_START_WATCHER_JOB -ErrorAction SilentlyContinue
  Remove-Job -Job $SUPERSET_CODEX_START_WATCHER_JOB -Force -ErrorAction SilentlyContinue
}

exit $SUPERSET_CODEX_STATUS
