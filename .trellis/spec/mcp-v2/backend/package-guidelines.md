# @superset/mcp-v2 Backend Package Guidelines

## Scope
Current MCP v2 server, tool definitions, host-service bridge, caller context, and automation/workspace/project/host/agent tools.

## Source Examples
- `packages/mcp-v2/src/define-tool.ts` defines the local tool definition pattern.
- `packages/mcp-v2/src/server.ts` and `caller.ts` wire server and caller behavior.
- `packages/mcp-v2/src/host-service-client.ts` bridges local host-service access.
- `packages/mcp-v2/src/tools/automations/*.ts`, `workspaces/*.ts`, `hosts/list.ts`, and `agents/*.ts` show domain tool layout.

## Local Patterns
- Add tools under `src/tools/<domain>/<action>.ts` and register them through `src/tools/register.ts`.
- Keep input schemas and returned payloads typed and serializable.
- Use context helpers from `context-utils.ts` instead of ad hoc access to caller state.
- Use the host-service client when a tool needs local machine operations; keep cloud API calls separate.

## Avoid
- Do not put UI-specific copy or renderer assumptions into tools.
- Do not bypass tool registration when adding a new action.
- Do not make automation tools mutate state without clear tool input validation.

## Validation
- `bun --cwd packages/mcp-v2 typecheck`
- Run tool-specific tests when added.
