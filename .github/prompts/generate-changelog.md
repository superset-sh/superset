# Weekly Changelog Generation

Generate a new changelog entry for this week based on merged PRs.

## Instructions

1. **Find PRs merged since last Monday**
   - Use `gh pr list --state merged --search "merged:>=$(date -d 'last monday' +%Y-%m-%d)" --json number,title,body,url,mergedAt --limit 50` to get all PRs merged in the past week
   - Categorize PRs into: **Major features**, **Improvements**, **Bug fixes**
   - Skip PRs that are purely internal (CI/CD, dev tooling, refactors) unless they affect users
   - **Drop reverted work**: scan the same window for `revert:` PRs and exclude both the revert and the PR it undoes (e.g. #5639 merged and was reverted by #5641 eleven minutes later)
   - **Dedupe against the previous entry**: the date window overlaps the day the last changelog merged, so read the most recent existing entry and skip any PR it already announced

2. **Check for existing changelog**
   - Before creating a new file, check if a changelog already exists for this week's date
   - Use `ls apps/marketing/content/changelog/` to see existing files
   - If a file for today's date already exists, skip creation and report that a changelog already exists

3. **Prioritize content**
   - **Lead with 2-4 major features** - These get their own sections with full descriptions
   - **Group smaller improvements** - Can combine related small changes under one heading
   - **Bug fixes go in a footnote section** - Brief one-liner summaries at the bottom
   - **Pricing/entitlement changes always get a line** - free-plan unlocks and paywall removals matter to users regardless of diff size
   - **Experimental/internal features are footnotes, not heroes** - label them ("Experimental: ...") and give them one line near the bottom of Improvements; no section, no hero image
   - **Milestones don't need a PR** - announcements like SOC 2, open beta, or a pricing page get their own section with no PRBadge

4. **Create the changelog file**
   - Create a new file at: `apps/marketing/content/changelog/YYYY-MM-DD-slug.mdx`
   - Use today's date for the filename (e.g., `2026-01-27-descriptive-slug.mdx`)
   - The slug should summarize the main features (e.g., `terminal-improvements`, `sidebar-workspaces`)

5. **Follow this exact format**:

```mdx
---
title: Brief title highlighting 1-2 main features
date: YYYY-MM-DD
# image: optional — add a hero only if you have a strong one (see below); omit otherwise
---

## Major Feature Name <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

One or two sentences describing what users can now do. Keep it brief and scannable.

- Key capability one
- Key capability two

## Another Major Feature <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

Brief description of the feature and its benefit to users.

## Improvements

- **Improvement name** - Brief description <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />
- **Another improvement** - Brief description <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

---

**Bug fixes**

- Fixed issue with X <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />
- Resolved Y problem <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />
```

6. **Important formatting rules**
   - Frontmatter (`---`) must be at the very top of the file with no content before it
   - MDX comments (`{/* ... */}`) must come AFTER the frontmatter, not before
   - The frontmatter `image:` (card / OG cover) is **optional** — omit it if you have no strong hero (see "Screenshots & recordings" below). Only use `/changelog/IMAGE_PLACEHOLDER.png` as a placeholder when a reviewer will supply a real hero later; don't force a weak one.
   - Add TODO comments for features that would benefit from screenshots
   - Use a horizontal rule (`---`) before the bug fixes section
   - Bug fixes should use bullet points, one fix per line, same as Improvements
   - **Title Case for `##` headings** ("Redesigned Workspace Activity Strip", not "Redesigned workspace activity strip")
   - **Shortcuts as mac glyphs**: ⌘I, ⌘⇧L, not "Cmd+I" or "Cmd-Shift-L"
   - **UI paths in bold with arrows**: **Settings → Experimental**, **Integrations → Slack**
   - **No emoji in the changelog entry** - emoji belong in the launch thread only
   - **Bug fixes stay a flat list**; only if there are 15+ do you group them with bold area prefixes ("**Terminal** - ..."). Never pack small items into a running prose paragraph of PRBadges

7. **Writing style**
   - **No em dashes** - never use em dashes (—) in the changelog or the launch thread; use commas, colons, or separate sentences instead
   - **Be brief** - Users scan changelogs, they don't read every word
   - **Lead with value** - What can users do now that they couldn't before?
   - **One sentence per feature** - If you need more, use 2-3 bullet points max
   - **Skip implementation details** - Users don't care about internal changes
   - **No internal jargon** - name the user benefit, never the mechanism; "tRPC-first sessions", "Electric collections", and package names are banned in copy
   - **Combine related small fixes** - Don't give each tiny fix its own section
   - **End every feature with how to get it** - a hotkey (⌘I), a UI path (**Settings → Agents**), or an install command; a feature nobody can find isn't announced
   - **Show CLI/SDK features as code** - a short copy-pasteable snippet beats prose about flags
   - **Ground abstract features in use cases** - platform-y features (automations, SDKs) get 2-4 "typical uses" bullets
   - **Link the docs** when a docs.superset.sh page exists for the feature
   - **Credit external contributors by GitHub handle** - grab the author via `gh pr view <n> --json author` and link it: "contributed by [@ThomsenDrake](https://github.com/ThomsenDrake) from the Mistral team". Fall back to the company/team name only if the handle is unavailable. In the launch thread, don't @-mention GitHub handles (they ping the wrong account on X); use the team name there
   - **Cap the entry at ~80 lines** - cut harder rather than run long; only a multi-week entry may open with a 2-3 sentence overview paragraph before the first section

## Content hierarchy

| PR Type | Treatment |
|---------|-----------|
| New user-facing feature | Own section with heading, 1-2 sentences + bullets |
| Significant improvement | Own section or grouped under "Improvements" |
| Small enhancement | One line under "Improvements" |
| Bug fix | Bullet point in footnote section at bottom |
| Internal/refactor | Skip entirely unless user-visible |

## Screenshots & recordings (preferred over placeholders when the environment allows)

Real screenshots make a far better changelog than `IMAGE_PLACEHOLDER.png`. When you're
running on a machine that can launch the desktop app **and** has Google Chrome (i.e. a
local/dev environment, not a headless cloud run), capture and beautify shots for the
lead features. If that environment isn't available, fall back to the placeholder +
`{/* TODO */}` comments described above — don't block the changelog on images.

**1. Capture raw screenshots via CDP.** Launch the dev desktop from the worktree with
`RENDERER_REMOTE_DEBUG_PORT=9222 bun run dev:desktop`, wait for `localhost:9222/json`,
then drive the renderer over CDP: `Runtime.evaluate` to navigate/click (find a leaf
element by text, `dispatchEvent(new MouseEvent("click",{bubbles:true}))`; dropdowns need
the full `pointerdown/mousedown/pointerup/mouseup/click` sequence) and
`Page.captureScreenshot` to grab each surface (Settings → Agents, the create-dialog
model picker, the Automations/Workspaces tables, etc.). Quit the dev stack when done —
it shares a pty-daemon with other dev instances, so keep uptime short.

**Shoot small and sharp — the feature must read big in a blog post.** Full-desktop
captures make the feature a tiny sliver of the frame. Before capturing, shrink the
renderer to a compact viewport and bump the pixel density with
`Emulation.setDeviceMetricsOverride` (e.g. `{width: 1120, height: 720,
deviceScaleFactor: 2}`), so UI text renders large and crisp relative to the frame.
Collapse the sidebar and close side panels unless they're the subject — this also keeps
internal workspace/branch names out of frame. Two gotchas: the override only lives as
long as the CDP session that set it, so do size → interact → capture over one WebSocket
connection; and applying/clearing the override fires a resize that dismisses open
dropdowns/popovers and reflows terminal TUIs (set the size first, then open the menu /
render the TUI content). Note the beautify script's crop is cover-fit — very tall,
narrow crops get over-zoomed, so prefer landscape-ish crops.

**2. Beautify** with `.github/prompts/beautify-screenshot.ts` (local headless-Chrome
render — no upload, unlike Shots.so/Screely/Pika, which matters because these shots can
contain teammate names and internal branch names). Use **`tilt`** for the header/hero
image and **`flat`** for inline shots. Pass an optional `x,y,w,h` crop (in source
pixels) to **zoom into the feature** rather than framing the whole app window — this
reads much better; the shot doesn't need to be full-screen:

```bash
# tilt hero, zoomed into the agent editor region
bun .github/prompts/beautify-screenshot.ts raw-agents.png hero.png          tilt 480,110,2440,1250
# flat inline, same crop
bun .github/prompts/beautify-screenshot.ts raw-agents.png custom-agents.png flat 480,110,2440,1250
# a dialog/dropdown — crop tight to just the dialog
bun .github/prompts/beautify-screenshot.ts raw-dialog.png model-picker.png  flat 990,810,1480,800
```

**3. Screen recordings for dynamic features.** Some features only make sense in motion —
the workspace **activity strip** (agent chips + port badges appearing), a **dropdown
flow** (Add agent → Custom agent), etc. A short screen recording beats a static frame
there. Grab a ~3-4s clip (a beautified `.mp4`/`.mov` handed to you, or a manual capture),
strip audio, downscale, drop to 30fps, and web-optimize with ffmpeg:

```bash
ffmpeg -y -i in.mov -an -vf "scale=1280:-2,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 30 -preset slow \
  -movflags +faststart apps/marketing/public/changelog/2026-07-06-activity-strip.mp4
```

This takes a 1-2MB clip down to ~100-200KB. Embed with the `<Video>` MDX component
(registered for changelog MDX), not a raw `<video>` tag:

```mdx
<Video src="/changelog/2026-07-06-activity-strip.mp4" title="Short caption of what's happening" />
```

Note: `<Video>` renders with `controls` (no autoplay/loop) and takes only `src`/`title`.

**4. Compress and place static images.** Downscale to ~2200px wide and run pngquant, then
drop the files in `apps/marketing/public/changelog/` named `YYYY-MM-DD-<slug>.png`:

```bash
sips --resampleWidth 2200 shot.png --out shot.png
pngquant --quality=58-84 --strip --force --output apps/marketing/public/changelog/2026-07-06-model-picker.png shot.png
```

If a source PNG has transparency (e.g. a cropped macOS dock badge), flatten it onto a
dark background first so it renders predictably inside the changelog's framed image box:

```bash
ffmpeg -y -f lavfi -i color=c=0x050505:s=WxH -i dock.png \
  -filter_complex "[0][1]overlay=format=auto" -frames:v 1 dock-flat.png
```

**5. Wire them in.** Add inline `![alt](/changelog/<file>.png)` images / `<Video>` clips
under the relevant feature sections. Redact or crop any shot that exposes sensitive
internal data (teammate names, private branch names) before it ships to the public site.

The frontmatter `image:` (card / OG cover) is **optional** — every consumer guards on it.
Only set it when you have a genuinely strong hero; a mediocre or awkwardly-tilted hero is
worse than none, so leave it out and the card renders text-only rather than force a bad
image. Inline media still carries the visuals.

## Launch tweet

Alongside the changelog `.mdx`, always draft the "what we shipped" launch tweet and write
it to a **sibling file** `apps/marketing/content/changelog/YYYY-MM-DD-tweet.md` (a `.md`, not
`.mdx` — the changelog loader only reads `.mdx`, so this companion file is ignored by the
site and won't render as an entry). Give it light frontmatter (`title`, `date`,
`type: tweet`) and the body.

It is **one single tweet** (one long X post), not a thread. It goes out together with the
changelog link, so the tweet carries the highlights and the changelog carries the detail.

Shape:

- Open with `What we shipped this week @superset_sh 🛳️` (or `the last N weeks`).
- Number the top features, up to 4; trailing emoji on each title. One numbered feature
  is fine on a slow week. Never pad or invent to hit a count.
- Flagship feature (#1): 1-2 short paragraphs. Lead with the pain or the bet behind it,
  then what it does. Remaining features: one tight paragraph each on what it does + how
  to turn it on (e.g. "Enable it in Settings → …").
- Fold everything smaller into one `Also this week: …` sentence.
- If an automation drafted the changelog, say so ("This changelog draft was created by an
  automation").
- Close with: `Plus a bunch of bug fixes. Thanks to everyone in the v2 open beta for the
  reports, please keep them coming!`
- End with the changelog link: `Full changelog: https://superset.sh/changelog/<slug>`.

Voice — the source of truth is the Notion page **"Kiet's Email voice"**. Before writing
the tweet, fetch it with the Notion MCP (`notion-search` for "Kiet's Email voice", then
`notion-fetch` the result) and follow it; the same rules apply to tweets. If the Notion
MCP isn't available in the environment (e.g. the headless CI run), fall back to this
summary:

- First-person plural, casual, opinionated. Write like a person typing fast, then cut half.
- **No em dashes.** Periods or commas.
- No performative or salesy lines ("genuinely excited", "we really appreciate you",
  vision taglines bolted onto feature blurbs).
- No AI tells in the prose: no noun-pile compression (use normal verbs and articles), no
  "not just X, but Y", no stacking parallel clauses for rhythm, no signposting ("Here's
  the thing"), and none of: delve, leverage, robust, seamless, crucial, comprehensive,
  streamline. A plain comma list of shipped capabilities (as in the example below) is
  fine; the ban is on rhetorical stacking, not lists of real things.

Reference example (the voice + shape to emulate):

```text
What we shipped this week @superset_sh 🛳️

1. Rich input for the terminal ⌨️
Writing a real prompt in a raw TTY line is painful. No multiline editing, no mentions,
and pasting can execute line by line. So we brought the workspace chat composer into the
terminal. Press ⌘I over any terminal pane and you get a real editor: Shift+Enter
newlines, @-file mentions, drafts that survive tab switches. Your prompt lands in the
TUI as one clean block.

2. Terminal scrolling at Ghostty speed 🖱️
Claude Code transcripts used to scroll at a third of native speed in Superset. Agent
TUIs tune themselves to the terminal they think they're in, so we fixed the identity we
advertise. Scrolling now matches Ghostty.

3. Mistral Vibe 🤝
Mistral's Vibe CLI is now a first-class Superset agent, contributed by the Mistral team
themselves. Its own icon in the pickers, a model selector, a completion chime. We also
added GPT-5.6 Sol, Terra, and Luna to the Codex picker.

Also this week: wake offline hosts with a configurable wake command, remote hosts on
every plan (relay no longer needs a paid subscription), a Sydney relay region, and
Linear project/cycle filters for Tasks.

Plus a bunch of bug fixes. Thanks to everyone in the v2 open beta for the reports,
please keep them coming!

Full changelog: https://superset.sh/changelog/2026-07-12-terminal-rich-input
```

## Reference Examples

Read these files to understand the expected format:
- `apps/marketing/content/changelog/2026-01-27-terminal-tab.mdx`
- `apps/marketing/content/changelog/2026-01-20-changes-org-settings.mdx`
- `apps/marketing/content/changelog/2026-01-06-sidebar-workspaces-status.mdx`

## Output & commit workflow

If there are no significant user-facing PRs this week, or a changelog already exists for
this week's date, do **not** create anything — just report why.

Otherwise, produce and commit the full set:

1. **Files to produce:**
   - the changelog entry `apps/marketing/content/changelog/YYYY-MM-DD-<slug>.mdx`
   - its media assets in `apps/marketing/public/changelog/` (screenshots/recordings, when
     the environment allows — see above; otherwise placeholders + TODOs)
   - the companion launch tweet `apps/marketing/content/changelog/YYYY-MM-DD-tweet.md`
2. **Format:** run `bun run lint:fix`, then verify `bun run lint` exits 0 before committing.
3. **Branch:** create `changelog/YYYY-MM-DD`.
4. **Commit** the `.mdx`, its media assets, and the `-tweet.md` file together with message
   `docs: generate weekly changelog YYYY-MM-DD`. (It's fine to keep the reusable tooling —
   `.github/prompts/*` — in a separate `chore:` commit if you touched it.)
5. **Review, don't ship:** leave the committed branch for a human to review. Do **not**
   push or open a pull request unless a human explicitly asks — this is the default so the
   automation never opens PRs on its own. (A human can then run `create PR` on the branch.)
