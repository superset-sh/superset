# @superset/mcp Backend Package Guidelines

## Scope
Original MCP server package, auth helpers, in-memory state, and tool registration.

## Source Examples
- `packages/mcp/src/server.ts` builds the MCP server.
- `packages/mcp/src/auth.ts` owns MCP auth helpers.
- `packages/mcp/src/tools/index.ts` registers tools.
- `packages/mcp/src/in-memory.ts` contains in-memory support state.

## Local Patterns
- Keep MCP auth and server creation in package exports; app packages should call exports rather than duplicate setup.
- Use Zod schemas for tool inputs where the MCP SDK supports validation.
- Keep tool effects scoped and explicit because they may be invoked outside the web UI.

## Avoid
- Do not add v2 host-service tool logic here when `packages/mcp-v2` owns it.
- Do not skip auth checks for tools that touch organization data.

## Validation
- `bun --cwd packages/mcp test`
- `bun --cwd packages/mcp typecheck`
