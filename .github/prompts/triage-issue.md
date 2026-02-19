# Issue Triage: Reproduce Bug and Open PR

You are triaging GitHub issue `$ISSUE_NUMBER`. Your goal is to reproduce the reported bug with a failing test and open a PR.

## Steps

1. **Understand the bug** — Run `gh issue view "$ISSUE_NUMBER" --json title,body,labels` and identify the expected vs actual behavior.

2. **Find affected code** — Search the codebase (Glob/Grep) for the relevant files, functions, or modules. Read the source code to understand how it works.

3. **Write a reproduction test** — Create a co-located `.test.ts` file (or add to an existing one) using `bun:test` (`describe`/`test`/`expect`). The test should fail, proving the bug exists. You may create minimal helper files or fixtures if needed to reproduce.

4. **Run the test** — `bun test <path>` to confirm it fails as expected.

5. **Open a PR** — Run `bun run lint:fix`, then commit, push, and create a PR:
   - Title: `test: reproduce #$ISSUE_NUMBER — <short bug description>`
   - Body should include:
     - What the bug is (in your own words, based on the issue)
     - What code is affected and why
     - What the test does and how it proves the bug
     - `Closes #$ISSUE_NUMBER`

6. **If you can't reproduce** — Comment on the issue explaining what you tried and why a test wasn't feasible. Do not create a PR.
