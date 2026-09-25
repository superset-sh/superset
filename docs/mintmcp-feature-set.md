# MintMCP — Feature Set Research

> Research notes compiled 2026-07-24 from [mintmcp.com](https://www.mintmcp.com/), their [docs](https://www.mintmcp.com/docs/intro), and third-party coverage ([Integrate.io MCP gateway roundup](https://www.integrate.io/blog/best-mcp-gateways-and-ai-agent-security-tools/)).

## What it is

MintMCP is an **enterprise gateway for the Model Context Protocol (MCP)**. It sits between AI clients (Claude, ChatGPT, Cursor, coding agents) and MCP servers, handling authentication, logging every tool call, and enforcing access policies. The pitch: replace developers running local MCP servers with personal API keys and zero telemetry with one centrally governed gateway.

**Target customer:** enterprises rolling out AI coding assistants / agents that need security, governance, and compliance (SOC 2, HIPAA, internal audit) over AI-to-data connections.

## Products

### 1. MCP Gateway (flagship)

| Capability | Detail |
| --- | --- |
| Server catalog | Centralized org-wide catalog; claims 10,000+ MCP servers available, 100+ first-party hosted connectors |
| Hosted connectors | MCP servers run in MintMCP's infrastructure — no local installs; pre-configured credentials so servers work immediately after SSO |
| Virtual MCPs / Bundles | Role-based endpoints bundling a curated tool set per team/role — "sales sees CRM tools, engineers see code tools"; abstracts MCP complexity and centralizes auth |
| Auth | OAuth brokering, SSO, SCIM-driven membership/provisioning, role-based access control |
| Agent identities | Dedicated identities for autonomous agents with machine-to-machine auth ("Agent Bundles"), individual credentials, and per-agent audit trails |
| Audit | Every tool call logged; audit logs, access policies, and credential management in one console |
| Custom servers | Turns local MCP servers into managed enterprise services (one-click deploy, OAuth protection, audit trails) |

### 2. Agent Monitor

Real-time observability for coding agents:

- Watches file access, command execution, and tool calls
- Rule-based detection **and blocking** of risky behavior
- PII detection and secret scanning

## Integrations (advertised)

- **Data warehouses:** Snowflake, BigQuery, Databricks, Elasticsearch
- **Communication:** Slack, Teams, Gmail, Outlook, Google Calendar
- **Documents:** Google Drive, SharePoint, Confluence, Notion
- **Business:** Salesforce, Linear
- **Custom APIs** plus ~100 more hosted services

## Security & compliance posture

- SOC 2 Type II audited infrastructure
- Positioned for SOC 2 / HIPAA / internal compliance programs
- Addresses: no telemetry, scattered credentials, missing access controls, audit-trail gaps

## Deployment & pricing

- Managed cloud service by default; on-prem/self-hosted "on request"
- No published pricing — free trial + contact-sales custom pricing

## Docs structure (for deeper digging)

Intro · Quickstart · Get access · Using docs in AI clients · Gateway architecture · Agent identities · Agent Monitor overview · Agent Monitor security — at [mintmcp.com/docs/intro](https://www.mintmcp.com/docs/intro)

## Open questions

- Actual pricing model (per-seat? per-tool-call?)
- Depth of self-hosted offering (docs only say "contact us")
- Whether the stdio→remote conversion for custom servers is self-serve or white-glove
- Latency/throughput characteristics of proxying every tool call
