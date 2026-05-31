# @superset/mcp-v2 Frontend Package Guidelines

## Scope
Typed MCP v2 tool contracts surfaced to chat/agent UI and API integrations.

## Source Examples
- `packages/mcp-v2/src/index.ts` controls exported surface.
- `packages/mcp-v2/src/tools/register.ts` is the discoverable tool registry.

## Local Patterns
- Keep tool names, descriptions, and payload shapes stable because agent UI and automation flows rely on them.
- Expose only the types/helpers a consumer needs through `index.ts`.

## Avoid
- Do not make consumers import from deep private tool paths unless the package exports them.
- Do not return non-serializable values from tool calls.

## Validation
- `bun --cwd packages/mcp-v2 typecheck`
- Run consumers that render MCP tool results when payloads change.
