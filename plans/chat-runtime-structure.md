# chat-runtime — ideal structure per repo guidelines

The current flat tree (db/, journal/, replay/, projection/, harness/, sessions/, stream/, commands/ all top-level) is a symptom, not a layout choice: **consumers reach across layers** — `commands` imports `db`, `replay`, and `projection` directly; `stream` imports `db` — so under the AGENTS.md promotion rule ("used by 2+ → highest shared parent") everything floats to the top. The fix is narrowing the module APIs first; the nesting then follows mechanically.

## The two structural rules being applied

1. **Co-location:** one folder per unit (`Unit/unit.ts + index.ts + unit.test.ts`); a unit consumed by exactly one module nests inside it; multi-consumer units promote to the highest *shared* parent — top level is last resort.
2. **Modules talk to sibling barrels, never into a sibling's internals.** `stream` needing journal reads means `journal/index.ts` exports reads — not `stream` importing `replay` and `db` from the side.

## Ideal tree

```
packages/chat-runtime/
  README.md                      # pipeline + reading order
  drizzle.config.ts              # points at src/journal/db/
  src/
    index.ts                     # createChatRuntime — the ONLY cross-module wiring
    testing/                     # ownerless cross-cutting test helpers ONLY: fixtures/ (protocol item
                                 #   factories), testUtils/ (sinks, schedules, waits), testRuntime/.
                                 #   Internal: relative imports, no package export. Helpers WITH an
                                 #   owner co-locate instead (fake/ lives in harness/)
    journal/                     # owns chat.db and everything about the event log
      index.ts                   # PUBLIC: ChatJournal (append), readSince, readPage,
      journal/                   #         session reads (list/get) — the read model IS the journal's
      epoch/                     # single consumer: journal
      replay/                    # single consumer after API fix: journal's barrel re-exports reads
      projection/                # single consumer after API fix: internal to journal
      db/                        # createChatDb/, schema/, drizzle/ — only journal touches storage
    harness/                     # top-level is EARNED: consumed by sessions + root today,
      index.ts                   #   and claude/ + codex/ land here as peers at M3/M4
      types.ts
      fake/                      # co-located test double implementing the contract beside it
    sessions/
      index.ts                   # PUBLIC: LiveSessionRegistry
      liveSession/
      registry/
    stream/
      index.ts                   # PUBLIC: SubscriptionHub
      subscriptions/             # imports journal (barrel) only — not db, not replay
    commands/
      index.ts                   # PUBLIC: createCommands
      commands/                  # imports journal + sessions barrels only
      commandDedupe/             # single consumer: commands
```

## What changes beyond file moves (the load-bearing part)

- `journal/index.ts` becomes the storage facade: append, reads (replay), and session-row reads (projection) are its exports. `replay/`, `projection/`, `db/` become journal-internal.
- `stream` and `commands` drop their `db`/`replay`/`projection` imports and consume the `journal` barrel. `commands` additionally consumes the `sessions` barrel. Resulting graph: `index → {journal, harness, sessions, stream, commands}`; `sessions → {harness, journal}`; `stream → journal`; `commands → {journal, sessions}`. Four top-level modules + wiring — nothing else is visible package-wide.
- Test helpers split on **ownership**, not on being test code. A helper with an owner co-locates with it — `fake/` sits inside `harness/`, beside the contract it implements. A helper no single module owns goes in `src/testing/`: `fixtures/`, `testUtils/` and `testRuntime/` are used by every module's tests, so co-location has nowhere to put them. `testing/` stays internal — relative imports only, no `./testing` package export — so it never becomes a public surface.
- `drizzle.config.ts` stays at package root (drizzle-kit convention) pointing into `src/journal/db/`.

## Why this is better than the flat version, in one sentence each

- A reader opens `src/` and sees five names that ARE the pipeline: journal, harness, sessions, stream, commands.
- The storage engine (drizzle, tables, epochs, replay mechanics) is invisible until you enter `journal/` — exactly the progressive disclosure the flat tree lacked.
- Cross-layer imports become lint-visible violations instead of promotions: if `commands` ever imports `journal/db` again, the tree says so.
