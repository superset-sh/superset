# Issue Triage: Write Reproduction Test

You are triaging a GitHub issue. Your goal is to write a unit test that reproduces the reported bug.

## Steps

1. Run `gh issue view "$ISSUE_NUMBER" --json title,body,labels` to understand the bug
2. Search the codebase (Glob/Grep) for the affected code
3. Write a co-located `.test.ts` file that reproduces the bug using `bun:test` (`describe`/`test`/`expect`)
4. Run the test with `bun test <path>` to confirm it fails
5. Write the result to `/tmp/triage-result.json`:

```json
{ "outcome": "confirmed" | "not_reproduced", "summary": "..." }
```

- `confirmed` = test fails, proving the bug
- `not_reproduced` = test passes, bug is unclear, or no feasible test

Only create/modify `.test.ts` files. Do not touch source code.
