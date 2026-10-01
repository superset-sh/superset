# tRPC API compatibility

`src/router/` is the cloud API. Every merge to main deploys it within minutes, but desktop,
mobile, CLI, and SDK builds already released keep calling it. On 2026-09-23, #7726 changed
`page.list` from an array to `{ items, nextCursor }` and updated every caller on main. CI passed,
and every workspace view in desktop 1.30.x crashed. **Updating every caller on main is not
enough.**

**Before you change or remove an existing procedure, follow `.agents/skills/trpc-compat/SKILL.md`.**

## Rules

1. **Never make a breaking change to a procedure that released clients call.** Only additive
   changes are safe: a new optional input field, a new output field. For anything else, add a new
   procedure. This is the fix in `router/page/page.ts` (#7756):
   ```ts
   list: protectedProcedure.input(legacyListPagesSchema).query(/* still Page[] */),
   listPaginated: protectedProcedure.input(listPagesSchema).query(/* { items, nextCursor } */),
   ```
2. **Add, do not change.** Do not rename, remove, or retype a procedure, input field, or output
   field. Keep a replaced procedure as a `@deprecated` alias (`task.all` → `task.list`).
3. **New input fields are optional**, with a default in the handler.
4. **Do not tighten existing inputs**: no new `.min()`/`.max()`/`.uuid()`/`.refine()`/
   `.strict()`, no narrower enum, no `nullish()` → `optional()`, no new required header or
   stricter auth (for example `publicProcedure` → `protectedProcedure`).
5. **Keep output shapes stable**: no removed, renamed, retyped, wrapped, or newly nullable field.
   A `db.query.*.findMany/findFirst` without `columns` passes table columns through to the output,
   so a column change in `packages/db` is an output change. Pick columns explicitly when you touch
   one.
6. **Keep behavior stable, not only types**: no new default `limit` on a list, no new sort order,
   no new meaning for `null` or an empty value.
7. **Error codes are contract.** Desktop branches on `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`,
   `SERVICE_UNAVAILABLE`, and `BAD_GATEWAY`. Keep the code an existing case throws.
8. **Procedure type and transport are contract.** Do not change a query to a mutation, the link
   options, or the `superjson` transformer. #6658 made desktop send host-service queries as POST,
   and desktop 1.24.0 got a 405 on every query to hosts on 1.23.x or older.
9. **The API ships before the client that needs it.** Client code may call a new procedure or read
   a new field only after the API that has it is live in production. API deploys can stall: #7317's
   was blocked for two days behind migration 0119.
10. **Put a schema migration in its own PR.** A migration inside #7726 blocked its revert.
11. **Remove a deprecated procedure only with evidence** that no live client calls it (the skill,
    step 4). Raising `MINIMUM_DESKTOP_VERSION` is a product decision.
