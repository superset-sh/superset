# Superset CLI agent-session E2E transcript

- result: PASSED
- commit: 80d8f8a17ce64e6fec3d9bc1d60c168853241187
- generatedAt: 2026-07-19T20:14:28.703Z
- worktree: cli-workspace-sidebar
- runtime: Bun 1.3.11; Electron-as-Node PTY daemon

## Assertions

- [x] large launch returned a terminal session — session 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4
- [x] large prompt arrived byte-for-byte — 87994 bytes; sha256 8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3
- [x] sessions list exposes identity, workspace, agent, and state — status idle; workspace 30000000-0000-4000-8000-000000000001; agent custom:e2e
- [x] headless read returns the agent acknowledgement — idle snapshot contains the 8b8bbfd59b5d… digest
- [x] workspaces create forwards attachment bytes into its inline agent — workspace, inline agent result, uploaded bytes, and resolved host path agree
- [x] wait observes working — observed working
- [x] wait observes permission — observed permission
- [x] wait observes failed — observed failed
- [x] multiline stdin remains one semantic prompt — 42 exact bytes; final state idle
- [x] --file sends exact file bytes — 47 exact bytes
- [x] --file - sends exact stdin bytes — 53 exact bytes
- [x] read and send adopt a daemon-owned session after host restart — same terminal id, exact follow-up, final state idle
- [x] wait timeout is a non-zero CLI result — exit 1; explicit timeout error
- [x] Ctrl+C aborts a pending wait — exit 1; explicit interruption error
- [x] immediate exec failure cannot report false success — exit 1; no session id emitted
- [x] unknown sessions fail without spawning replacements — exit 1; not-found guidance emitted
- [x] exited sessions are not silently recreated — send observed exited; subsequent read failed

## Commands

### launch an 88 KB agent prompt (exit 0, 913 ms)

```console
$ superset --json agents create --workspace 30000000-0000-4000-8000-000000000001 --agent e2e --prompt "<prompt bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3>"
{
  "kind": "terminal",
  "sessionId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "label": "E2E fake agent"
}
[stderr]
Warning: Cloud host discovery failed (Unable to connect. Is the computer able to access the url?); listing this machine's host only
```

### list live local agent sessions (exit 0, 501 ms)

```console
$ superset --json agents sessions list --local
[
  {
    "status": "idle",
    "agent": "custom:e2e",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "host": "300d922f3b90fd4955ae39163bda4431",
    "hostId": "300d922f3b90fd4955ae39163bda4431",
    "lastEventAt": "2026-07-19T20:14:16.021Z",
    "sessionId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4"
  }
]
```

### read a live session without attaching (exit 0, 232 ms)

```console
$ superset --json agents sessions read 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --lines 40
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "workspaceId": "30000000-0000-4000-8000-000000000001",
  "status": "idle",
  "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\n",
  "truncated": false
}
```

### create a workspace and launch an agent with an attachment (exit 0, 924 ms)

```console
$ superset --json workspaces create --local --project 20000000-0000-4000-8000-000000000001 --name e2e-attached-workspace --branch e2e-attached-workspace --agent e2e --prompt "Inspect the attached markdown file." --attachment "$E2E_ROOT/attachment.md"
{
  "workspace": {
    "organizationId": "10000000-0000-4000-8000-000000000001",
    "projectId": "20000000-0000-4000-8000-000000000001",
    "name": "e2e-attached-workspace",
    "branch": "e2e-attached-workspace",
    "hostId": "e2e-host",
    "type": "worktree",
    "taskId": null,
    "id": "8f6c8a44-d4cd-4b57-ba10-a8546e330aa9",
    "clientMachineId": "300d922f3b90fd4955ae39163bda4431",
    "updatedAt": "2026-07-19T20:14:17.621Z"
  },
  "terminals": [],
  "agents": [
    {
      "ok": true,
      "kind": "terminal",
      "sessionId": "70585d37-7a59-4d1a-a62e-97c213c1d78a",
      "label": "E2E fake agent"
    }
  ],
  "alreadyExists": false,
  "txid": null
}
```

### send a prompt that enters working state (exit 0, 235 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 WORKING --local
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": true,
  "sentAt": 1784492058143
}
```

### wait for working state (exit 0, 204 ms)

```console
$ superset --json agents sessions wait 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --for working --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "workspaceId": "30000000-0000-4000-8000-000000000001",
  "agentId": "codex",
  "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "definitionId": "custom:e2e",
  "startedAt": 1784492056021,
  "lastEventAt": 1784492058146,
  "lastEventType": "Start",
  "status": "working"
}
```

### send a prompt that requests permission (exit 0, 214 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 PERMISSION --local
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": true,
  "sentAt": 1784492058561
}
```

### wait for permission state (exit 0, 201 ms)

```console
$ superset --json agents sessions wait 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --for permission --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "workspaceId": "30000000-0000-4000-8000-000000000001",
  "agentId": "codex",
  "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "definitionId": "custom:e2e",
  "startedAt": 1784492056021,
  "lastEventAt": 1784492058566,
  "lastEventType": "PermissionRequest",
  "status": "permission"
}
```

### send a prompt that fails (exit 0, 202 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 FAIL --local
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": true,
  "sentAt": 1784492058964
}
```

### wait for failed state (exit 0, 223 ms)

```console
$ superset --json agents sessions wait 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --for failed --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "workspaceId": "30000000-0000-4000-8000-000000000001",
  "agentId": "codex",
  "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "definitionId": "custom:e2e",
  "startedAt": 1784492056021,
  "lastEventAt": 1784492058968,
  "lastEventType": "Failed",
  "status": "failed"
}
```

### send multiline stdin and wait for idle (exit 0, 741 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --wait --timeout 5s "< multiline.txt"
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": {
    "accepted": true,
    "sentAt": 1784492059417
  },
  "final": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "agentId": "codex",
    "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "definitionId": "custom:e2e",
    "startedAt": 1784492056021,
    "lastEventAt": 1784492059452,
    "lastEventType": "Stop",
    "status": "idle"
  },
  "read": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "status": "idle",
    "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=10 base64=UEVSTUlTU0lPTg==\nFOLLOWUP bytes=4 base64=RkFJTA==\nFOLLOWUP bytes=42 base64=Zmlyc3QgbGluZQpzZWNvbmQgbGluZSB3aXRoIOmbqgp0aGlyZCBsaW5l\n",
    "truncated": false
  }
}
```

### send from a prompt file (exit 0, 778 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --file "$E2E_ROOT/follow-up.md" --wait --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": {
    "accepted": true,
    "sentAt": 1784492060234
  },
  "final": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "agentId": "codex",
    "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "definitionId": "custom:e2e",
    "startedAt": 1784492056021,
    "lastEventAt": 1784492060271,
    "lastEventType": "Stop",
    "status": "idle"
  },
  "read": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "status": "idle",
    "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=10 base64=UEVSTUlTU0lPTg==\nFOLLOWUP bytes=4 base64=RkFJTA==\nFOLLOWUP bytes=42 base64=Zmlyc3QgbGluZQpzZWNvbmQgbGluZSB3aXRoIOmbqgp0aGlyZCBsaW5l\nFOLLOWUP bytes=47 base64=Zm9sbG93LXVwIGxvYWRlZCBmcm9tIGEgZmlsZQp3aXRoIGEgc2Vjb25kIGxpbmU=\n",
    "truncated": false
  }
}
```

### send through conventional --file - stdin (exit 0, 774 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --file - --wait --timeout 5s "< stdin.txt"
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": {
    "accepted": true,
    "sentAt": 1784492061008
  },
  "final": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "agentId": "codex",
    "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "definitionId": "custom:e2e",
    "startedAt": 1784492056021,
    "lastEventAt": 1784492061043,
    "lastEventType": "Stop",
    "status": "idle"
  },
  "read": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "status": "idle",
    "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=10 base64=UEVSTUlTU0lPTg==\nFOLLOWUP bytes=4 base64=RkFJTA==\nFOLLOWUP bytes=42 base64=Zmlyc3QgbGluZQpzZWNvbmQgbGluZSB3aXRoIOmbqgp0aGlyZCBsaW5l\nFOLLOWUP bytes=47 base64=Zm9sbG93LXVwIGxvYWRlZCBmcm9tIGEgZmlsZQp3aXRoIGEgc2Vjb25kIGxpbmU=\nFOLLOWUP bytes=53 base64=c3RkaW4gc2VudGluZWwgLSBpcyBhY2NlcHRlZAp3aXRob3V0IHJlaW50ZXJwcmV0YXRpb24=\n",
    "truncated": false
  }
}
```

### read the same PTY after host-service restart (exit 0, 286 ms)

```console
$ superset --json agents sessions read 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --lines 40
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "workspaceId": "30000000-0000-4000-8000-000000000001",
  "status": "idle",
  "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=10 base64=UEVSTUlTU0lPTg==\nFOLLOWUP bytes=4 base64=RkFJTA==\nFOLLOWUP bytes=42 base64=Zmlyc3QgbGluZQpzZWNvbmQgbGluZSB3aXRoIOmbqgp0aGlyZCBsaW5l\nFOLLOWUP bytes=47 base64=Zm9sbG93LXVwIGxvYWRlZCBmcm9tIGEgZmlsZQp3aXRoIGEgc2Vjb25kIGxpbmU=\nFOLLOWUP bytes=53 base64=c3RkaW4gc2VudGluZWwgLSBpcyBhY2NlcHRlZAp3aXRob3V0IHJlaW50ZXJwcmV0YXRpb24=\n",
  "truncated": false
}
```

### continue the same PTY after host-service restart (exit 0, 753 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 "continue after host restart" --local --wait --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": {
    "accepted": true,
    "sentAt": 1784492063532
  },
  "final": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "agentId": "codex",
    "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "definitionId": "custom:e2e",
    "startedAt": 1784492056021,
    "lastEventAt": 1784492063569,
    "lastEventType": "Stop",
    "status": "idle"
  },
  "read": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "status": "idle",
    "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=10 base64=UEVSTUlTU0lPTg==\nFOLLOWUP bytes=4 base64=RkFJTA==\nFOLLOWUP bytes=42 base64=Zmlyc3QgbGluZQpzZWNvbmQgbGluZSB3aXRoIOmbqgp0aGlyZCBsaW5l\nFOLLOWUP bytes=47 base64=Zm9sbG93LXVwIGxvYWRlZCBmcm9tIGEgZmlsZQp3aXRoIGEgc2Vjb25kIGxpbmU=\nFOLLOWUP bytes=53 base64=c3RkaW4gc2VudGluZWwgLSBpcyBhY2NlcHRlZAp3aXRob3V0IHJlaW50ZXJwcmV0YXRpb24=\nFOLLOWUP bytes=27 base64=Y29udGludWUgYWZ0ZXIgaG9zdCByZXN0YXJ0\n",
    "truncated": false
  }
}
```

### leave the agent working for timeout checks (exit 0, 265 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 WORKING --local
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": true,
  "sentAt": 1784492064309
}
```

### timeout while waiting for idle (exit 1, 774 ms)

```console
$ superset --json agents sessions wait 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --for idle --timeout 150ms
[stderr]
Error: Timed out waiting for agent session 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4
Hint: Last observed status: working
```

### interrupt a pending wait with SIGINT (exit 1, 506 ms)

```console
$ superset --json agents sessions wait 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local --for idle --timeout 5s
[stderr]
Error: Interrupted while waiting
```

### settle the session after timeout checks (exit 0, 757 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 RESET --local --wait --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": {
    "accepted": true,
    "sentAt": 1784492065836
  },
  "final": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "agentId": "codex",
    "agentSessionId": "fake-59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "definitionId": "custom:e2e",
    "startedAt": 1784492056021,
    "lastEventAt": 1784492065873,
    "lastEventType": "Stop",
    "status": "idle"
  },
  "read": {
    "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
    "workspaceId": "30000000-0000-4000-8000-000000000001",
    "status": "idle",
    "output": "'/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-agent-launch-GY3fGB/launch.sh'\n/var/f/6/h/T/superset-cli-e2e-nlvOpm/workspace main ❯ '/bin/sh' '/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/supers\net-agent-launch-GY3fGB/launch.sh'\nREADY bytes=87994 sha256=8b8bbfd59b5dd961264707f7287dd29177d298381355f3a6af466df85c2a00c3\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=10 base64=UEVSTUlTU0lPTg==\nFOLLOWUP bytes=4 base64=RkFJTA==\nFOLLOWUP bytes=42 base64=Zmlyc3QgbGluZQpzZWNvbmQgbGluZSB3aXRoIOmbqgp0aGlyZCBsaW5l\nFOLLOWUP bytes=47 base64=Zm9sbG93LXVwIGxvYWRlZCBmcm9tIGEgZmlsZQp3aXRoIGEgc2Vjb25kIGxpbmU=\nFOLLOWUP bytes=53 base64=c3RkaW4gc2VudGluZWwgLSBpcyBhY2NlcHRlZAp3aXRob3V0IHJlaW50ZXJwcmV0YXRpb24=\nFOLLOWUP bytes=27 base64=Y29udGludWUgYWZ0ZXIgaG9zdCByZXN0YXJ0\nFOLLOWUP bytes=7 base64=V09SS0lORw==\nFOLLOWUP bytes=5 base64=UkVTRVQ=\n",
    "truncated": false
  }
}
```

### reject an executable that cannot launch (exit 1, 927 ms)

```console
$ superset --json agents create --workspace 30000000-0000-4000-8000-000000000001 --agent e2e-missing --prompt "this must not report a session id"
[stderr]
Warning: Cloud host discovery failed (Unable to connect. Is the computer able to access the url?); listing this machine's host only
Error: Agent process exited before launch acknowledgement (status 127).
```

### reject an unknown session id (exit 1, 278 ms)

```console
$ superset --json agents sessions read 90000000-0000-4000-8000-000000000009 --local
[stderr]
Error: Agent session not found: 90000000-0000-4000-8000-000000000009
Hint: Run: superset agents sessions list
```

### exit a live fake-agent process (exit 0, 739 ms)

```console
$ superset --json agents sessions send 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 EXIT --local --wait --timeout 5s
{
  "terminalId": "59dce876-4e2c-4fa7-bcc8-f41635f9b2d4",
  "accepted": {
    "accepted": true,
    "sentAt": 1784492067782
  },
  "final": {
    "status": "exited"
  },
  "read": null
}
```

### reject a read after the agent process exited (exit 1, 236 ms)

```console
$ superset --json agents sessions read 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4 --local
[stderr]
Error: Agent session not found: 59dce876-4e2c-4fa7-bcc8-f41635f9b2d4
Hint: Run: superset agents sessions list
```
