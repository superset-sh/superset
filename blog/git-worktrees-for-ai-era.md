# Git Worktrees: The Underused Feature That Changes Everything With AI Agents

Most developers have never heard of `git worktree`. Those who have usually dismiss it as an edge-case feature for kernel developers. But in an era where AI agents can write code autonomously, worktrees solve a problem you didn't know you had: **how do you let an agent work without disrupting your flow?**

This isn't a tool promotion. This is about a git feature that's been around since 2015 and suddenly matters a lot more than it used to.

---

## What Are Git Worktrees?

A worktree is a separate working directory linked to your repository. Unlike cloning, all worktrees share the same `.git` directory—same history, same remotes, same objects. But each has its own checked-out branch and working files.

```bash
# Your repo lives here
/projects/my-app/           # main branch

# Create a worktree for a feature
git worktree add ../my-app-feature feature-branch

# Now you have two working directories
/projects/my-app/           # main branch
/projects/my-app-feature/   # feature-branch
```

Both directories are the same repo. Commits in one are instantly visible in the other. But the *files on disk* are completely independent.

**Why this matters**: You can have `main` open in one terminal, `feature-branch` in another, and switch between them instantly. No stashing. No lost context. No "wait, which branch am I on?"

---

## The Old World: Why Worktrees Were Niche

Before AI coding assistants, worktrees were useful but rarely essential. The typical workflow:

1. Work on feature A
2. Get interrupted for urgent bug
3. `git stash` your changes
4. Switch to `main`, fix bug, push
5. Switch back, `git stash pop`
6. Try to remember where you were

Annoying, but manageable. Most developers optimized around this with better commit hygiene or multiple terminal tabs. Worktrees felt like overkill.

---

## The New World: AI Agents Change the Equation

Now imagine this workflow:

1. You're working on feature A
2. You ask an AI agent to implement feature B
3. The agent starts writing code...
4. ...in your working directory
5. Your files start changing while you're editing them
6. You `git diff` and see a mix of your changes and the agent's
7. Chaos

This is the fundamental problem with AI coding in a single working directory: **you and the agent are fighting over the same files**.

Some tools work around this by:
- Making you stop working while the agent runs
- Operating on a "virtual" filesystem that syncs later
- Using very granular file locking

But the cleanest solution is the one git already provides: **give the agent its own worktree**.

---

## The Worktree Mental Model for AI

Think of worktrees as **parallel universes for your code**:

```
┌─────────────────────────────────────────────────────────┐
│                     YOUR REPOSITORY                      │
│                    (shared .git dir)                     │
└─────────────────────────────────────────────────────────┘
            │                           │
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────┐
│   WORKTREE: main      │   │  WORKTREE: agent-task │
│   /projects/my-app    │   │  ~/.worktrees/task-1  │
│                       │   │                       │
│   YOU WORK HERE       │   │   AGENT WORKS HERE    │
│   - Edit files        │   │   - Writes code       │
│   - Run tests         │   │   - Makes commits     │
│   - Debug             │   │   - Runs builds       │
│                       │   │                       │
│   Uninterrupted       │   │   Isolated            │
└───────────────────────┘   └───────────────────────┘
            │                           │
            └───────────┬───────────────┘
                        ▼
              MERGE WHEN READY
              (normal git workflow)
```

**The agent gets:**
- Its own filesystem to modify freely
- Its own branch to commit to
- Freedom to experiment, break things, iterate

**You keep:**
- Your working directory untouched
- Your flow uninterrupted
- The ability to review agent work before it touches your code

---

## Practical Benefits

### 1. Parallel Work Without Interference

```bash
# You're working on the API
cd /projects/my-app
vim src/api/endpoints.ts

# Meanwhile, agent is refactoring the UI (different worktree)
# ~/.worktrees/my-app/ui-refactor/src/components/...

# Neither affects the other until you explicitly merge
```

### 2. Easy Review and Rollback

Agent finished? Review it like any PR:

```bash
# See what the agent did
cd ~/.worktrees/my-app/agent-task
git log --oneline
git diff main

# Looks good? Merge it
git checkout main
git merge agent-task

# Looks bad? Delete the worktree, done
git worktree remove ~/.worktrees/my-app/agent-task
git branch -D agent-task
```

No merge conflicts with your uncommitted work. No untangling interleaved changes.

### 3. Multiple Agents, Multiple Tasks

Nothing stops you from having several worktrees:

```
~/.worktrees/my-app/
├── add-auth/           # Agent 1: Adding authentication
├── fix-perf/           # Agent 2: Performance optimization
├── write-tests/        # Agent 3: Test coverage
└── refactor-db/        # You: Manual database refactor
```

Each agent works in isolation. You merge results when ready.

### 4. Instant Context Switching

Traditional branch switching:
```bash
git stash
git checkout other-branch
# work
git checkout original-branch
git stash pop
# hope nothing conflicts
```

With worktrees:
```bash
cd ../other-worktree
# work
cd ../original-worktree
# instant, no state to manage
```

### 5. Safe Experimentation

Agent wants to try a risky refactor? Let it. The worktree is disposable:

```bash
# Agent goes wild in its worktree
# Breaks everything
# No problem—your main worktree is untouched

# Delete and start fresh
git worktree remove ~/.worktrees/my-app/experiment
git worktree add ~/.worktrees/my-app/experiment -b new-experiment
```

---

## The Commands You Need

**Create a worktree for a new branch:**
```bash
git worktree add <path> -b <new-branch-name>
# Example: git worktree add ~/.worktrees/my-app/feature -b feature
```

**Create a worktree for an existing branch:**
```bash
git worktree add <path> <existing-branch>
# Example: git worktree add ~/.worktrees/my-app/hotfix hotfix-123
```

**List all worktrees:**
```bash
git worktree list
# /projects/my-app         abc1234 [main]
# ~/.worktrees/my-app/feat def5678 [feature]
```

**Remove a worktree:**
```bash
git worktree remove <path>
# Or just delete the directory and run: git worktree prune
```

**Move a worktree:**
```bash
git worktree move <old-path> <new-path>
```

---

## Patterns That Work Well

### Pattern 1: Dedicated Worktree Directory

Keep all worktrees in one place:

```bash
~/.worktrees/
├── project-a/
│   ├── feature-1/
│   └── feature-2/
└── project-b/
    └── bugfix/
```

This keeps your main project directories clean and makes worktrees easy to find/delete.

### Pattern 2: Branch Name = Worktree Name

Use consistent naming:

```bash
git worktree add ~/.worktrees/my-app/add-dark-mode -b add-dark-mode
```

Now the directory name matches the branch name. No confusion.

### Pattern 3: One Task, One Worktree

Don't reuse worktrees for different tasks. Create fresh:

```bash
# Task done, merged
git worktree remove ~/.worktrees/my-app/task-123

# New task
git worktree add ~/.worktrees/my-app/task-456 -b task-456
```

Clean slate each time. No residual state.

### Pattern 4: Setup Scripts

If your project needs setup (install deps, build, etc.), script it:

```bash
#!/bin/bash
# setup-worktree.sh
cd "$1"
npm install
npm run build
cp ../.env.local .env.local
```

Run after creating a worktree. Some tools automate this.

---

## Gotchas and Limitations

### 1. Can't Check Out the Same Branch Twice

Git prevents this to avoid confusion:

```bash
git worktree add ../other main
# fatal: 'main' is already checked out at '/projects/my-app'
```

Workaround: Create a new branch from `main`:

```bash
git worktree add ../other -b main-copy main
```

### 2. Submodules Need Extra Work

If your repo uses submodules, each worktree needs its own submodule checkout:

```bash
cd <new-worktree>
git submodule update --init --recursive
```

### 3. IDE Configuration

Your IDE might not understand that two directories are the same repo. You may need to:
- Open each worktree as a separate project
- Configure git settings per-worktree

### 4. Disk Space

Each worktree has its own working files. A 1GB repo with 5 worktrees uses ~5GB. The `.git` directory is shared, but checked-out files are duplicated.

### 5. Stale Worktrees

If you delete a worktree directory manually (rm -rf), git doesn't know. Clean up with:

```bash
git worktree prune
```

---

## Why This Matters Now

The shift to AI-assisted development isn't just about writing code faster. It's about **parallelism**.

In the old world, you were the bottleneck. Code got written as fast as you could type.

In the new world, AI agents can work on multiple things simultaneously—if you let them. But they need somewhere to work that doesn't collide with you or each other.

Git worktrees are that "somewhere." They're not new technology. They're a 9-year-old feature that suddenly has a killer use case.

You don't need special tooling to use them. You don't need to change your git workflow. You just need to know they exist.

Now you do.

---

## Quick Reference

```bash
# Create worktree with new branch
git worktree add <path> -b <branch>

# Create worktree with existing branch
git worktree add <path> <branch>

# List worktrees
git worktree list

# Remove worktree
git worktree remove <path>

# Clean up stale worktrees
git worktree prune

# See worktree info
git worktree list --porcelain
```

---

## Further Reading

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Pro Git Book - Worktrees](https://git-scm.com/book/en/v2/Git-Tools-Worktrees) (if it exists in your version)
- `man git-worktree`

The feature has been stable since Git 2.5 (2015). If you have git, you have worktrees.
