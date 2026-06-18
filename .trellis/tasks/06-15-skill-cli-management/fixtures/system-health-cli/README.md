# System Health CLI

System Health CLI collects a small local health snapshot for an Automation or
agent run.

It reads CPU load, memory usage, disk usage, and uptime from local operating
system APIs and common read-only system commands. It does not need network
access or secrets.

## Example

```bash
system-health
system-health --json
```
