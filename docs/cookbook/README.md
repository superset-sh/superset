# WIP - Parallel Coding Agent cookbook 

How to run 100 agents in parallel without losing your mind, a practical guide.

## Table of Contents

1. [Why would I want to do this?](#why-would-i-want-to-do-this)
2. [Which agents should I use?](#which-agents-should-i-use)
   - [Coding environment](#coding-environment)
3. [Handling Conflicts](#handling-conflicts)
4. [Workflow](#workflow)
5. [Unorganized Tips](#unorganized-tips)

## Why would I want to do this?

Time === money. Instead of hiring 1-2 more engineers, you can increase your output at the same rate for $100-$200 / month. 

You can realistically ship 1-3 features in an hour that would take 1-3 days pre-LLM. Just develop them in parallel.

## Which agents should I use?

Some CLI agents and configs are good at certain things. Use them accordingly.
- Codex (high) is good at planning and reviewing - https://github.com/openai/codex 
- Sonnet 4.5 is good at coding - https://www.claude.com/product/claude-code 
- Composer-1 is good at refactoring and making quick changes - https://cursor.com/cli 
- CodeRabbit CLI is also good at reviewing

### Coding environment
It's untenable to develop more than 2-3 features on the same codebase. Git Worktrees can help keep each change in a separate branch that can avoid overwriting each other. It's still best to develop the same feature on 1 worktree.

Tips:
1. Use tooling for worktree creation and setup https://github.com/coderabbitai/git-worktree-runner
2. Instrument your codebase with environment variable-based port mapping so ports don't conflict

### Handling Conflicts
- Keep PRs per feature
- Prefer merging main into the PR instead of the PR into main, have an agent look at the current PR and the merge conflicts and plan before coding. Treat merging as its own feature work. 

### Workflow
1. Plan with a high reasoning agent/model. I prefer Codex (high) at the time of writing
2. Refine the plan until you're happy with it
3. Record the plan in and MD or copy and past to a coding agent directly
4. Pass over to Claude Code or other coding agent for implementation
5. Use a reasoning (Codex) or review agent (CodeRabbit) to review the work and spot bug
6. Pass the feedback (if you agree with them) to the coding agent
7. Repeat until monkey brain happy

Bonus:
1. Have CI/CD for review tool like CodeRabbit for PR review.
2. Have the coding model write unit tests for edge cases. 
3. Use fast agent like composer to clean up comments and refactor code.

### Unorganized Tips:
1. Use worktrees. But automate the setup. 
- https://git-scm.com/docs/git-worktree
- https://github.com/coderabbitai/git-worktree-runner
2. Use hooks to notify when agent is done
- https://code.claude.com/docs/en/hooks-guide
- https://github.com/openai/codex/discussions/2150
3. Color/name code your workspace 
- https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-peacock
4. Plan as a separate step
- Explore codebase and write/refine a plan as MD. 
- Commit it for a different/fresh agent to pick up. 
5. Linter, Unit Tests, and Type-safety can be huge help. This gives valuable feedback to agents. 