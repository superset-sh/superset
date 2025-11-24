# Parallel Coding Agent cookbook

How to run 100 agents in parallel without losing your mind, a practical guide.

## Table of Contents

1. [Why would I want to do this?](#whywould-i-want-to-do-this)
2. [Coding environment]()
3. [Handling conflicts](#handling-merge-conflicts)
4. [What agents should I use]()

## Why...would I want to do this?
- Coding has changed, old man. You need to level up and drive a team of junior engineers instead. 

- Time == money. Instead of hiring 1-2 more engineers, you can increase your output at the same rate for $100-$200 / month.

## Not all agents are created equal
- Some CLI agents and configs are good at certain things. Use them accordingly.
- Codex (high) is good at planning and reviewing
- Sonnet 4.5 is good at coding
- Composer-1 is good at refactoring and making quick changes

### Handling Conflicts
- Keep PRs per feature
- Prefer merging main into the PR instead of the PR into main, have an agent look at the current PR and the merge conflicts and plan before coding. Treat merging as its own feature work. 

### Unorganized Notes:
1. Use worktrees. But automate the setup. 
- https://git-scm.com/docs/git-worktree
- https://github.com/coderabbitai/git-worktree-runner
2. Use hooks to notify when agent is done
- https://code.claude.com/docs/en/hooks-guide
- https://github.com/openai/codex/discussions/2150
3. Color/name code your workspace 
- https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-peacock
4. Plan as a separate step
- Explore codebase and write/refine a plan as MD. Commit it for a different/fresh agent to pick up. 
