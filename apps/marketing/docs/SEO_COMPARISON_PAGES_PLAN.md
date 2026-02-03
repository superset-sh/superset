# SEO Comparison Pages: Research & Plan

## Executive Summary

This document outlines a plan to create SEO comparison pages targeting bottom-of-funnel search queries. These pages will capture developers actively searching for tools like Superset — people comparing coding agents, looking for alternatives to tools they already use, or researching the best tools in the category.

Superset occupies a unique position: it's not another AI coding agent or IDE — it's the **orchestration layer** for running multiple coding agents in parallel. This positioning creates opportunities to target comparison queries across multiple categories.

---

## Competitive Landscape

### Superset's Unique Position

Superset is **"The Terminal for Coding Agents"** — an agent-agnostic orchestration tool that:
- Runs 10+ parallel CLI coding agents (Claude Code, Codex, etc.) on your local machine
- Provides isolated Git worktree environments per agent
- Includes built-in diff viewer and code review
- Works with any CLI-based coding tool (no vendor lock-in)
- Is free and privacy-focused (all processing happens locally)

This means Superset isn't a direct competitor to most tools — it's complementary. The comparison angle is: "Why choose when you can orchestrate all of them?"

### Competitor Categories

#### Category A: Agent Orchestration (Direct Competitors)
Tools that, like Superset, let you run multiple coding agents in parallel.

| Tool | What it does | Superset angle |
|------|-------------|----------------|
| **Conductor** (conductor.build) | Mac app for running parallel Claude Code / Codex agents in isolated worktrees | Closest direct competitor. Conductor is Claude Code / Codex only; Superset is agent-agnostic (any CLI tool). Conductor is Mac-only; Superset targets cross-platform. Both use git worktrees for isolation. |
| **Warp** | Agentic terminal with built-in AI agents | Warp bundles its own agents; Superset is agent-agnostic. Warp is closed-source with mandatory login; Superset is free and privacy-first. |
| **tmux / screen** | Terminal multiplexers | Low-tech alternatives for running parallel sessions. No agent awareness, no worktree isolation, no diff review. |

#### Category B: AI Coding Agents (Tools People Run *Inside* Superset)
Terminal/CLI-based autonomous agents that write, test, and debug code. These are the tools Superset orchestrates.

| Tool | What it does | Superset angle |
|------|-------------|----------------|
| **Claude Code** | Anthropic's terminal-based coding agent. Deep reasoning, multi-file edits, sub-agents. | Primary agent people run inside Superset. "How to run multiple Claude Code agents" is a natural query. |
| **OpenAI Codex CLI** | OpenAI's terminal-based coding agent. Open-source, Rust-built, sandboxed execution. | Another terminal-based agent people orchestrate with Superset. Complementary angle: run Codex inside Superset. |
| **Devin** | Cloud-based autonomous AI software engineer by Cognition. | Superset offers a local, privacy-first alternative to the "autonomous agent" concept. |
| **Aider** | Open-source terminal-based coding assistant. Lightweight, model-agnostic. | Can be run inside Superset like any other CLI agent. |

#### Category C: AI-Powered IDEs (Different Paradigm)
Editor-first tools with built-in AI. These are IDEs, not agents — they embed AI into the editing experience rather than running autonomous tasks from the terminal.

| Tool | What it does | Superset angle |
|------|-------------|----------------|
| **Cursor** | VS Code fork with built-in AI chat, autocomplete, and multi-file editing. Recently adding multi-agent. | Different paradigm (IDE vs orchestrator). Complementary: use Cursor for single-file flow, Superset for parallel agent orchestration. |
| **Windsurf** | AI-native IDE by Codeium with Cascade multi-step agent system. | Similar to Cursor. IDE-first approach vs Superset's terminal-first orchestration. |
| **GitHub Copilot** | Industry-standard AI code completion and chat, integrated into VS Code / JetBrains. | Autocomplete tool, not an autonomous agent. Complementary: use Copilot for inline suggestions, Superset for big parallel tasks. |

#### Category D: Terminal Emulators (Adjacent)
Standard terminals that developers might compare when choosing their AI coding environment.

| Tool | Relevance |
|------|-----------|
| **Warp** | Both a terminal and competitor (covered in Category A). |
| **iTerm2** | Default Mac terminal for many developers. "iTerm2 alternative for AI coding" is a natural query. |
| **Ghostty** | Hot new terminal. Developers choosing terminals may want agent support. |
| **Kitty / Alacritty / WezTerm** | Performance-focused terminals without agent orchestration. |

#### Category E: Category Roundups
Broader searches like "best AI coding tools 2026", "parallel coding agents", "best terminal for developers 2026".

---

## Prioritized Page List (9 Pages)

### Priority 1: High-Intent, Direct Comparison (Create First)

#### Page 1: Superset vs Warp
- **Target keywords**: "superset vs warp", "warp alternative", "warp terminal alternative 2026"
- **Search intent**: Developers comparing agent-aware terminals
- **Title**: `Superset vs Warp: Comparing Agent-Aware Terminals`
- **Meta description**: `Superset and Warp both bring AI agents to the terminal. Compare their approaches to agent orchestration, privacy, pricing, and developer workflow.`
- **Type**: 1v1 comparison
- **Key comparison points**:
  - Agent approach: Agent-agnostic (Superset) vs built-in agents (Warp)
  - Privacy: Fully local/offline (Superset) vs cloud-connected (Warp)
  - Pricing: Free (Superset) vs freemium (Warp)
  - Worktree isolation: Native in Superset, not in Warp
  - Multi-agent orchestration: Core feature (Superset) vs single-agent focus (Warp)
  - Editor integration: Cross-IDE (Superset) vs terminal-only (Warp)
  - Open source: Superset is open-source, Warp is closed-source
- **Why this is #1**: Most direct competitor. High commercial intent from developers choosing their primary terminal for AI workflows.

#### Page 2: Superset vs Cursor
- **Target keywords**: "superset vs cursor", "cursor alternative for coding agents", "cursor vs terminal coding agents"
- **Search intent**: Developers weighing IDE-first vs terminal-first AI coding
- **Title**: `Superset vs Cursor: IDE-First vs Terminal-First AI Coding`
- **Meta description**: `Cursor embeds AI in your IDE. Superset orchestrates multiple AI agents from your terminal. Compare the two approaches to AI-assisted development.`
- **Type**: 1v1 comparison
- **Key comparison points**:
  - Paradigm: IDE-first (Cursor) vs terminal-first orchestrator (Superset)
  - Parallelism: Single agent (Cursor, recently adding multi-agent) vs 10+ parallel agents (Superset)
  - Agent choice: Cursor's built-in models vs bring-any-CLI-agent (Superset)
  - Pricing: $20/mo (Cursor) vs free (Superset)
  - Complementary use: "Use both — Cursor for single-file flow, Superset for parallel orchestration"
  - Worktree isolation: Unique to Superset
- **Why this is #2**: "Cursor alternative" is one of the highest-volume queries in the AI coding space. Even though they're different products, capturing this traffic and educating users on the orchestration paradigm is valuable.

#### Page 3: Best AI Coding Agent Tools (2026)
- **Target keywords**: "best ai coding agent tools 2026", "best coding agents", "ai coding tools comparison"
- **Search intent**: Developers researching the landscape
- **Title**: `Best AI Coding Agent Tools in 2026: A Developer's Guide`
- **Meta description**: `Compare the top AI coding agents and IDEs — Claude Code, Codex, Cursor, Windsurf, Copilot, and more. Plus, learn how to run them all in parallel with Superset.`
- **Type**: Category roundup
- **Content structure**:
  - Brief intro to the AI coding landscape
  - Agents section: Claude Code, OpenAI Codex, Devin, Aider (terminal-based autonomous tools)
  - IDEs section: Cursor, Windsurf, GitHub Copilot (editor-first tools with built-in AI)
  - Orchestration section: Superset, Conductor (tools for running multiple agents in parallel)
  - Comparison table with key dimensions (pricing, paradigm, agent vs IDE, best for)
  - Verdict: Why you don't have to choose — use them all
- **Why this is #3**: High search volume category query. Positions Superset in the conversation even for people who haven't heard of it.

### Priority 2: Strong Keyword Opportunities

#### Page 4: Superset vs Devin
- **Target keywords**: "superset vs devin", "devin alternative", "devin ai alternative local"
- **Search intent**: Developers who want autonomous AI coding but with local control
- **Title**: `Superset vs Devin: Local Agent Orchestration vs Cloud AI Engineer`
- **Meta description**: `Devin is a cloud-based AI software engineer. Superset runs multiple AI agents locally on your machine. Compare the two approaches to autonomous coding.`
- **Type**: 1v1 comparison
- **Key comparison points**:
  - Architecture: Local-first (Superset) vs cloud-based (Devin)
  - Privacy: Code stays on your machine (Superset) vs cloud processing (Devin)
  - Agent model: Orchestrate any agent (Superset) vs single proprietary agent (Devin)
  - Pricing: Free (Superset) vs $20+/mo (Devin)
  - Control: Full developer control (Superset) vs autonomous with review (Devin)
  - Use case: Parallel task orchestration (Superset) vs autonomous task completion (Devin)
- **Why**: "Devin alternative" has strong search volume. Privacy and local-first are compelling differentiators.

#### Page 5: How to Run Multiple Claude Code Agents in Parallel
- **Target keywords**: "run multiple claude code agents", "claude code parallel", "parallel claude code sessions"
- **Search intent**: Claude Code users who want to scale up
- **Title**: `How to Run Multiple Claude Code Agents in Parallel`
- **Meta description**: `Stop running Claude Code one task at a time. Learn how to orchestrate 10+ parallel Claude Code agents with isolated Git worktrees using Superset.`
- **Type**: Tutorial-style comparison (positions Superset as the solution)
- **Content structure**:
  - The problem: Claude Code is powerful but sequential
  - DIY approaches (tmux, manual worktrees) and their limitations
  - How Superset solves this (walkthrough)
  - Comparison: tmux + manual worktrees vs Superset
  - Getting started guide
- **Why**: This targets Claude Code's active user base directly. High purchase intent — these users already use coding agents and want to do more.

#### Page 6: Superset vs GitHub Copilot
- **Target keywords**: "superset vs copilot", "github copilot alternative", "copilot alternative for coding agents"
- **Search intent**: Developers looking beyond Copilot's autocomplete
- **Title**: `Superset vs GitHub Copilot: From Autocomplete to Agent Orchestration`
- **Meta description**: `GitHub Copilot suggests code. Superset orchestrates multiple autonomous coding agents. Compare the two approaches to AI-powered development.`
- **Type**: 1v1 comparison
- **Key comparison points**:
  - AI model: Copilot's suggestion engine vs full autonomous agents (via Superset)
  - Scope: Inline completions (Copilot) vs multi-file, multi-task parallel work (Superset)
  - Pricing: $10-39/mo (Copilot) vs free (Superset)
  - Integration: GitHub-centric (Copilot) vs agent-agnostic (Superset)
  - Paradigm shift: Completions vs orchestration
  - Complementary: Use Copilot for quick completions AND Superset for big tasks
- **Why**: "GitHub Copilot alternative" is an extremely high-volume query. Good for brand awareness even though the products differ.

### Priority 3: Long-Tail / Niche Pages

#### Page 7: Best Terminal for AI Coding Agents (2026)
- **Target keywords**: "best terminal for ai coding", "best terminal for developers 2026", "terminal for coding agents"
- **Search intent**: Developers choosing a terminal that supports AI workflows
- **Title**: `Best Terminal for AI Coding Agents in 2026`
- **Meta description**: `Compare terminals for AI-powered development: Superset, Warp, iTerm2, Ghostty, Kitty, and more. Find the best terminal for running coding agents.`
- **Type**: Category roundup
- **Content structure**:
  - Why your terminal choice matters for AI coding
  - Terminal-by-terminal breakdown (Superset, Warp, iTerm2, Ghostty, Kitty, Alacritty, WezTerm)
  - Comparison table (agent support, performance, privacy, features, pricing)
  - Verdict: Best for different use cases
- **Why**: Captures developers at the "choosing tools" stage. Lower competition than broader "AI coding tools" queries.

#### Page 8: Superset vs Conductor
- **Target keywords**: "superset vs conductor", "conductor alternative", "conductor.build alternative", "conductor coding agents"
- **Search intent**: Developers comparing parallel agent orchestration tools
- **Title**: `Superset vs Conductor: Comparing Parallel Agent Orchestrators`
- **Meta description**: `Superset and Conductor both let you run multiple coding agents in parallel with git worktrees. Compare agent support, platform availability, and features.`
- **Type**: 1v1 comparison
- **Key comparison points**:
  - Agent support: Any CLI tool (Superset) vs Claude Code + Codex only (Conductor)
  - Platform: Cross-platform (Superset) vs Mac-only (Conductor)
  - Worktree management: Both use git worktrees for isolation
  - Code review: Both have built-in diff viewers
  - Open source: Both are open-source
  - Maturity: Compare feature depth (notifications, editor integration, etc.)
  - Pricing: Both free
- **Why**: Conductor (by Melty Labs, YC-backed) is the closest direct competitor — same core concept of parallel agent orchestration with git worktrees. Developers choosing between the two will search this directly.

#### Page 9: Superset vs OpenAI Codex
- **Target keywords**: "superset vs codex", "openai codex alternative", "codex cli vs superset"
- **Search intent**: Developers comparing Codex CLI (a single agent) vs Superset (agent orchestrator)
- **Title**: `Superset vs OpenAI Codex: Agent Orchestration vs Single Coding Agent`
- **Meta description**: `OpenAI Codex is a terminal-based coding agent. Superset orchestrates multiple agents — including Codex — in parallel. Compare the two approaches.`
- **Type**: 1v1 comparison
- **Key comparison points**:
  - Category difference: Single agent (Codex) vs agent orchestrator (Superset)
  - Complementary use: Run Codex *inside* Superset for parallel Codex sessions
  - Agent model: OpenAI models only (Codex) vs any CLI agent (Superset)
  - Features: Codex has sandboxing, skills, MCP, web search; Superset has worktree isolation, diff viewer, notifications
  - Pricing: Codex requires OpenAI API/subscription; Superset is free
  - Open source: Both are open-source
  - Best together: "Use Codex as the agent, Superset as the orchestrator"
- **Why**: "OpenAI Codex alternative" and "Codex CLI" are high-volume queries. The complementary angle (run Codex inside Superset) is a strong conversion story.

---

## Content Structure Template

Each comparison page should follow this general structure:

### 1v1 Comparison Template
```
1. Hero: "[Tool A] vs [Tool B]" + one-sentence summary
2. TL;DR comparison table (5-7 key dimensions)
3. What is [Tool A]? (1-2 paragraphs)
4. What is [Tool B]? (1-2 paragraphs)
5. Detailed comparison sections (3-5 sections):
   - Agent approach / AI capabilities
   - Developer experience & workflow
   - Pricing & plans
   - Privacy & security
   - Best for (use cases)
6. When to use [Tool A] vs [Tool B] (decision framework)
7. Can you use both? (complementary angle)
8. Verdict / Recommendation
9. FAQ section (3-5 questions — good for featured snippets)
10. CTA: Try Superset
```

### Category Roundup Template
```
1. Hero: "Best [Category] in 2026" + one-sentence summary
2. Quick comparison table (all tools, 5-7 dimensions)
3. Tool-by-tool breakdown (each with pros/cons/pricing/best for)
4. How to choose: decision framework
5. The orchestration approach (positions Superset)
6. FAQ section
7. CTA: Try Superset
```

---

## Implementation Plan

### Route Structure

Pages live under `/compare/[slug]` in the marketing app:

```
apps/marketing/
├── content/
│   └── compare/                          # NEW: MDX content files
│       ├── superset-vs-warp.mdx
│       ├── superset-vs-cursor.mdx
│       ├── best-ai-coding-agent-tools.mdx
│       ├── superset-vs-devin.mdx
│       ├── multiple-claude-code-agents-parallel.mdx
│       ├── superset-vs-github-copilot.mdx
│       ├── best-terminal-for-ai-coding.mdx
│       ├── superset-vs-conductor.mdx
│       └── superset-vs-openai-codex.mdx
├── src/
│   ├── app/
│   │   └── compare/                      # NEW: Route pages
│   │       ├── page.tsx                   # Optional: listing page (or skip)
│   │       └── [slug]/
│   │           └── page.tsx              # Individual comparison page
│   └── lib/
│       ├── compare.ts                    # NEW: Content reading utilities
│       └── compare-utils.ts             # NEW: Types and helpers
```

### Files to Create

#### 1. `apps/marketing/src/lib/compare-utils.ts`
Type definitions for comparison pages:
```typescript
interface ComparisonPost {
  slug: string;
  url: string;
  title: string;
  description: string;
  date: string;
  lastUpdated?: string;
  type: "1v1" | "roundup";
  competitors: string[];  // e.g., ["cursor"], ["warp"]
  keywords: string[];
  content: string;
}
```

#### 2. `apps/marketing/src/lib/compare.ts`
Content reading functions following the same pattern as `blog.ts`:
- `getComparisonPosts()` — Read all MDX files from `content/compare/`
- `getComparisonPost(slug)` — Read a single comparison
- `getAllComparisonSlugs()` — List all slugs for `generateStaticParams`

#### 3. `apps/marketing/src/app/compare/[slug]/page.tsx`
Dynamic page following blog post pattern:
- `generateStaticParams` for static generation
- `generateMetadata` with comparison-specific SEO metadata
- JSON-LD structured data (Article schema + FAQPage schema if applicable)
- MDX rendering with custom components

#### 4. `apps/marketing/src/app/compare/[slug]/components/`
Comparison-specific components:
- `ComparisonTable/` — Side-by-side feature comparison table
- `ComparisonLayout/` — Page layout for comparison content
- `VerdictSection/` — Styled verdict/recommendation block
- `ComparisonHero/` — Hero section with tool logos and title

#### 5. `apps/marketing/src/components/JsonLd/JsonLd.tsx`
Add new JSON-LD component:
- `ComparisonJsonLd` — Article-type schema tailored for comparison content
- Optional `FAQPageJsonLd` — For FAQ sections (rich snippets in Google)

#### 6. `apps/marketing/src/app/sitemap.ts`
Update to include comparison pages:
```typescript
const comparisonPosts = getComparisonPosts();
const comparisonPages = comparisonPosts.map((post) => ({
  url: `${baseUrl}/compare/${post.slug}`,
  lastModified: new Date(post.lastUpdated || post.date),
  changeFrequency: "monthly" as const,
  priority: 0.7,
}));
```

#### 7. `content/compare/*.mdx`
MDX content files with frontmatter:
```yaml
---
title: "Superset vs Warp: Comparing Agent-Aware Terminals"
description: "Compare Superset and Warp for AI agent orchestration..."
date: 2026-02-01
lastUpdated: 2026-02-01
type: "1v1"
competitors: ["warp"]
keywords: ["superset vs warp", "warp alternative", "warp terminal alternative"]
---
```

### What NOT to Do
- Do NOT add comparison pages to the main navigation (Header component)
- Do NOT create a visible "Comparisons" section on the homepage
- These are SEO-only landing pages discovered through search, sitemaps, and internal links from blog posts

### Internal Linking Strategy
- Link from relevant blog posts to comparison pages (e.g., git worktrees post → Superset vs Warp)
- Cross-link between comparison pages (e.g., "vs Cursor" page links to "Best AI Coding Agent Tools")
- Each comparison page links back to the homepage CTA

### Validation Steps
1. Run `bun typecheck` to verify type safety
2. Run `bun run lint:fix` for formatting
3. Verify sitemap includes new pages (check `sitemap.ts` output)
4. Test each comparison page renders correctly in dev (`bun dev` in apps/marketing)
5. Verify JSON-LD is valid using Google's Rich Results Test
6. Check meta tags render correctly (title, description, OG tags)
7. Confirm pages are NOT linked from header/footer navigation

---

## Frontmatter Schema for Comparison Pages

```yaml
---
title: string          # Page title (appears in <title> and <h1>)
description: string    # Meta description (150-160 chars)
date: string           # YYYY-MM-DD publication date
lastUpdated: string    # YYYY-MM-DD last update (for freshness signals)
type: "1v1" | "roundup"
competitors: string[]  # Slug-friendly competitor names
keywords: string[]     # Target search queries
image: string          # Optional OG image path
---
```

---

## Summary: Recommended Build Order

| Order | Page | Slug | Type |
|-------|------|------|------|
| 1 | Superset vs Warp | `superset-vs-warp` | 1v1 |
| 2 | Superset vs Cursor | `superset-vs-cursor` | 1v1 |
| 3 | Best AI Coding Agent Tools 2026 | `best-ai-coding-agent-tools` | Roundup |
| 4 | Superset vs Devin | `superset-vs-devin` | 1v1 |
| 5 | Multiple Claude Code Agents in Parallel | `multiple-claude-code-agents-parallel` | Tutorial |
| 6 | Superset vs GitHub Copilot | `superset-vs-github-copilot` | 1v1 |
| 7 | Best Terminal for AI Coding 2026 | `best-terminal-for-ai-coding` | Roundup |
| 8 | Superset vs Conductor | `superset-vs-conductor` | 1v1 |
| 9 | Superset vs OpenAI Codex | `superset-vs-openai-codex` | 1v1 |

**Phase 1** (Pages 1-3): Build the route infrastructure + highest-priority pages
**Phase 2** (Pages 4-6): Strong keyword opportunities
**Phase 3** (Pages 7-9): Long-tail/niche pages
