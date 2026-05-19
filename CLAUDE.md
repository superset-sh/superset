@AGENTS.md

## "Pre-existing" claims require proof

Before dismissing a failure as "pre-existing" or "unrelated":
1. `git stash` your changes
2. Re-run the failing check
3. If it ALSO fails → note in commit body, proceed
4. If it PASSES → you caused the regression, fix before committing
5. Document the proof in your response (show both outputs)

"I didn't change that file" is not proof. `git stash && rerun` is proof.
Never use `git commit --no-verify` — it's blocked by `.claude/settings.json`.
