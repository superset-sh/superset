---
name: ci-triage
description: Diagnose a failing GitHub Actions run — find the first real error in the logs, tell a flake apart from a genuine failure, and identify the commit that broke it. Use when checks are red on a PR, a workflow failed, the build is broken, CI is flaky, or the user asks why a run failed or whether a failure is real.
argument-hint: PR number, run URL, or branch with failing checks
allowed-tools: mcp__github__*
---

# Diagnose a failing CI run

The goal is one sentence a human can act on: **which job failed, on what, and whether it is
this PR's fault.** A screenshot of red checks is not a diagnosis.

## 1. Find the first failure, not the loudest one

List the run's jobs and take the earliest failing one. Later jobs usually fail *because* an
earlier one did, and their logs are longer and more alarming — which is why people diagnose
the wrong job.

Within that job, find the **first** error, not the last. Build tooling prints a summary at
the end that names the last thing to fail; the first error is what actually broke.

Skip past the noise that always appears in failing logs: deprecation warnings, peer
dependency notices, cache misses. None of them fail a build on their own.

## 2. Classify before investigating

Read the first error and put it in one of four buckets. They have different fixes and
mixing them up wastes the most time.

| Bucket | Signal | What to do |
| --- | --- | --- |
| **Real failure** | Assertion, type error, or compile error naming code this PR touched | Report the file and line |
| **Environment** | Network timeout, registry 5xx, disk full, runner image change | Re-run; if it persists, it is infrastructure |
| **Flake** | Timing, ordering, or concurrency; passes on re-run | See step 4 — do not stop at "re-run passed" |
| **Pre-existing** | Fails identically on the base branch | Not this PR's problem; say so explicitly |

Check pre-existing early. Fetch the most recent run on the base branch and compare the
failing job. A PR blamed for a failure it inherited burns an afternoon.

## 3. Attribute it to a change

For a real failure, connect the error to a diff. Get the PR's changed files and check
whether the failing test or module is among them, or imports something that is.

If the failing area is untouched by the PR, the likely causes in order are: a dependency
that moved, a merge with a base that already broke, or a genuine action-at-a-distance bug —
which is the most interesting outcome and worth saying out loud.

## 4. Do not launder a flake into a pass

A re-run that goes green proves the failure is intermittent. It does not prove the code is
correct, and intermittent failures in CI are usually real race conditions that will also
happen in production.

When you re-run and it passes, say that plainly, name the test, and check whether it has
failed before on other PRs. A test that flakes on many PRs is a bug report about that test.
Re-running until green and reporting success is how a real concurrency bug survives review.

## 5. Report

Give the requester, in this order: the job, the first error with its file and line, the
bucket from step 2, and what you recommend. Link the specific failing step, not the run —
the run page makes them hunt for what you already found.

If the fix is small and obvious, say what it is. If the failure is pre-existing or
infrastructural, say who needs to know, since the PR author usually cannot fix it.

## Anti-patterns

- Pasting the whole log. If you could not find the relevant twenty lines, the diagnosis is
  not finished.
- Reporting the last error in the file.
- "CI is flaky" without naming the test.
- Re-running more than twice without reading the log in between.
