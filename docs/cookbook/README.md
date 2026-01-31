# WIP - Parallel Coding Agent Cookbook

How to run 100 agents in parallel without losing your mind, a practical guide.

## Table of Contents

1. [Why would I want to do this?](#why-would-i-want-to-do-this)
2. [Which agents should I use?](#which-agents-should-i-use)
3. [Coding environment](#coding-environment)
4. [Handling Conflicts](#handling-conflicts)
5. [Workflow](#workflow)
6. [Tips](#tips)

## Why would I want to do this?

Time === money. Instead of hiring 1-2 more engineers, you can increase your output at the same rate for $100-$200 / month.

You can realistically ship 1-3 features in an hour that would take 1-3 days pre-LLM. Just develop them in parallel.

## Which agents should I use?

Some CLI agents and configs are good at certain things. Use them accordingly:

- **[Codex (high)](https://github.com/openai/codex)** - Good at planning and reviewing
- **[Sonnet 4.5](https://www.claude.com/product/claude-code)** - Good at coding
- **[Factory Droid](https://factory.ai/)** - Good at complex tasks, incident response, and migrations
- **[Composer-1](https://cursor.com/cli)** - Good at refactoring and making quick changes
- **[CodeRabbit CLI](https://www.coderabbit.ai/cli)** - Good at reviewing

## Coding environment

It's untenable to develop more than 2-3 features on the same codebase. Git Worktrees can help keep each change in a separate branch that can avoid overwriting each other. It's still best to develop the same feature on 1 worktree.

**Tips:**

1. Use tooling for worktree creation and setup: [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner)
2. Instrument your codebase with environment variable-based port mapping so ports don't conflict

## Workflow

1. Plan with a high reasoning agent/model. I prefer Codex (high) at the time of writing
2. Refine the plan until you're happy with it
3. Record the plan in an MD file or copy and paste to a coding agent directly
4. Pass over to Claude Code or other coding agent for implementation
5. Use a reasoning (Codex) or review agent (CodeRabbit) to review the work and spot bugs
6. Pass the feedback (if you agree with them) to the coding agent
7. Repeat until monkey brain happy

**Bonus:**

1. Have CI/CD for review tool like CodeRabbit for PR review
2. Have the coding model write unit tests for edge cases
3. Use fast agent like composer to clean up comments and refactor code

## Handling Conflicts

- Prefer merging main into the PR instead of the PR into main. Have an agent look at the current PR and the merge conflicts and plan before coding. Treat merging as its own feature work
- Keep separate PRs per feature

## Tips

### Worktrees

Use worktrees, but automate the setup:

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner)

### Hooks

Use hooks to notify when agent is done:

- [Claude Hooks Guide](https://code.claude.com/docs/en/hooks-guide)
- [Codex Hooks Discussion](https://github.com/openai/codex/discussions/2150)

### Workspace Organization

- **Color/name code your workspace**: [VS Code Peacock](https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-peacock)

### Planning

Plan as a separate step:

- Explore codebase and write/refine a plan as MD
- Commit it for a different/fresh agent to pick up

### Code Quality

Linter, unit tests, and type-safety can be huge help. This gives valuable feedback to agents. 


<!-- 
Drafts:

#### 1. Create clones of your codebase
[Git Worktree](https://example.com) is a good tool for this. Automate any worktree setup you might have. 

Treat each worktree/branch as a separate task assigned to a different engineer.

#### 2. Use different agents for different jobs 
Different CLI agents are better for certain tasks such as planning, implementing, reviewing, and refactoring.

At the point of writing (Nov 2025), we use Codex for planning and reviewing, Claude Code for implementing, and Cursor Composer for refacting and cleanup. 

#### 3. Organize your workspace
There's a high switching cost between

#### 4. Enforce type-safety, lint, and coding standards
 -->