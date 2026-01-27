# Documentation Content Review

This document tracks the documentation content adapted from [Conductor docs](https://docs.conductor.build/) and what needs to be added or reviewed.

## Summary

- **Source**: Conductor documentation (https://docs.conductor.build/)
- **Adaptation date**: January 2025
- **Total new pages created**: 10

---

## New Documentation Pages Created

### Get Started Section
| Page | Status | Needs Review |
|------|--------|--------------|
| `first-workspace.mdx` | ✅ Created | Verify workflow matches Superset UX |

### Core Features Section
| Page | Status | Needs Review |
|------|--------|--------------|
| `workspaces-and-branches.mdx` | ✅ Created | Verify branch management UX |
| `parallel-workspaces.mdx` | ✅ Created | Verify parallel workspace feature |
| `diff-viewer.mdx` | ✅ Created | Verify diff viewer capabilities |
| `terminal-integration.mdx` | ✅ Created | Verify terminal features |
| `agent-integration.mdx` | ✅ Created | Verify agent support (Claude, Codex, OpenCode) |

### How-to Guides Section
| Page | Status | Needs Review |
|------|--------|--------------|
| `environment-variables.mdx` | ✅ Created | Verify variable names match implementation |
| `use-with-cursor.mdx` | ✅ Created | Verify editor integration |
| `using-monorepos.mdx` | ✅ Created | Verify monorepo support |

### Help Section
| Page | Status | Needs Review |
|------|--------|--------------|
| `faq.mdx` | ✅ Created | Review FAQs for accuracy |

---

## Images Needed

Each page has placeholder comments for images. Here's a complete list of screenshots/images needed:

### first-workspace.mdx
- [ ] Add repository dialog (local folder and Git URL options)
- [ ] Newly created workspace view
- [ ] New workspace dropdown menu (branch, PR, new branch options)
- [ ] Workspace toolbar with "Open in IDE" button

### diff-viewer.mdx
- [ ] Diff viewer interface showing file changes
- [ ] Staged vs unstaged changes view
- [ ] Stage individual files UI
- [ ] Commit message input dialog
- [ ] Push/pull/sync buttons
- [ ] Create PR dialog
- [ ] Split vs unified diff layouts comparison

### parallel-workspaces.mdx
- [ ] Sidebar with multiple active workspaces
- [ ] New workspace creation dialog
- [ ] Worktree architecture diagram
- [ ] Multiple AI sessions in parallel
- [ ] Port management panel

### use-with-cursor.mdx
- [ ] "Open In" button in workspace toolbar
- [ ] Editor selection dropdown in settings
- [ ] Editor settings panel
- [ ] Branch name in Cursor window title
- [ ] Split screen workflow (Superset + Cursor)
- [ ] Color-coded Cursor windows (Peacock extension)

### environment-variables.mdx
- (No images needed - code examples are sufficient)

### workspaces-and-branches.mdx
- [ ] Workspace-branch relationship diagram
- [ ] Branch creation options dialog
- [ ] Multiple workspaces with related branch names
- [ ] Branches tab in workspace creation
- [ ] PR selection in workspace creation

### using-monorepos.mdx
- [ ] Monorepo workspace with multiple packages visible
- [ ] Terminal with multiple services running

### terminal-integration.mdx
- [ ] Terminal interface overview
- [ ] Multiple terminal tabs
- [ ] Keyboard shortcuts panel
- [ ] Dev server running in terminal
- [ ] Ports panel
- [ ] Clickable links in terminal output

### agent-integration.mdx
- [ ] AI agent working in workspace
- [ ] Claude Code running in terminal
- [ ] Multiple workspaces with parallel agents
- [ ] Notification settings panel

### faq.mdx
- (No images needed)

---

## Conductor Features NOT Supported by Superset

The following Conductor features were NOT adapted because Superset does not currently support them:

| Conductor Feature | Description | Status in Superset |
|-------------------|-------------|-------------------|
| **MCP (Model Context Protocol)** | Connect Claude Code to external tools and data sources | ❌ Not implemented |
| **Slash Commands** | Custom prompts as Markdown files in `.claude/commands/` | ❌ Not implemented |
| **Checkpoints** | Automated snapshots to revert agent changes | ❌ Not implemented |
| **Todos** | Task tracking with merge protection | ❌ Not implemented |
| **Run Scripts** | Button to launch dev server (separate from setup scripts) | ❌ Not implemented (only setup/teardown) |
| **Spotlight Testing** | Sync workspace changes back to repo root for testing | ❌ Not implemented |
| **Archive Scripts** | Commands that run when archiving a workspace | ⚠️ Only teardown on delete |
| **conductor.json** | Team-shared configuration file | ⚠️ Superset uses `.superset/config.json` |
| **Alternative AI Providers** | OpenRouter, Bedrock, Vertex support | ❓ Needs verification |

---

## Content to Review and Verify

### Environment Variables
Verify these match Superset's actual implementation:
- `SUPERSET_ROOT_PATH` - Path to root repository
- `SUPERSET_WORKSPACE_NAME` - Workspace name

### Keyboard Shortcuts
Verify these shortcuts work in Superset:
- `⌘N` - New workspace
- `⌘⇧N` - New workspace menu
- `⌘O` - Open in IDE
- `⌘T` - New terminal tab
- `⌘W` - Close terminal tab
- `⌘K` - Clear terminal
- `⌘D` - Split terminal

### Agent Support
Verify which agents are actually supported:
- [ ] Claude Code
- [ ] Codex
- [ ] OpenCode

### Editor Integration
Verify supported editors:
- [ ] Cursor
- [ ] VS Code
- [ ] Other editors

---

## Recommended Future Documentation

Based on Conductor's docs, consider adding these pages in the future:

1. **Quickstart guides** for specific frameworks:
   - Next.js + Vercel
   - Rails
   - Django
   - Phoenix/Elixir

2. **Issue to PR workflow** - End-to-end guide from GitHub issue to merged PR

3. **Multiple repositories** - Working with multiple repos simultaneously

4. **Nesting issues** - Handling nested source directories

---

## Navigation Structure Updated

The `meta.json` navigation has been updated to:

```
Get Started
├── quick-start
├── overview
├── installation
└── first-workspace

Core Features
├── core-features
├── workspaces-and-branches
├── parallel-workspaces
├── diff-viewer
├── terminal-integration
└── agent-integration

How to Guides
├── setup-teardown-scripts
├── environment-variables
├── use-with-cursor
└── using-monorepos

Help
└── faq
```

---

## Next Steps

1. **Review all new pages** for accuracy against Superset's actual features
2. **Capture screenshots** for all image placeholders
3. **Update existing pages** (overview, core-features, quick-start) to link to new detailed pages
4. **Verify keyboard shortcuts** match actual implementation
5. **Test all documented workflows** to ensure accuracy
6. **Consider adding** features from "NOT Supported" list to product roadmap
