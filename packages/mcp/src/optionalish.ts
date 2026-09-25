import type { z } from "zod";

/**
 * Accept `null` as a synonym for "not provided" and normalize it away.
 *
 * Models routinely send `null` for arguments they mean to omit. tRPC's input
 * schemas use `.optional()`, which rejects `null` during the type check —
 * before any `.refine()` runs — so the null has to be stripped at the MCP edge
 * or the call fails on an argument the caller thought it had left out.
 *
 * `defineTool` takes a `ZodRawShape`, so there is no object to hang a
 * transform on; this wraps the individual field instead. The MCP SDK emits the
 * tool listing with `pipeStrategy: "input"`, so the advertised JSON Schema is
 * the pre-transform side and keeps the field's constraints and `.describe()`.
 */
export const optionalish = <T extends z.ZodType>(schema: T) =>
	schema.nullish().transform((value) => value ?? undefined);
