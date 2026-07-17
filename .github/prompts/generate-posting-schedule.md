# Weekly Posting Schedule Generation

Draft one week of social posts from what shipped. **Drafts only — nothing is ever posted by the automation.** A human reviews, edits, and posts.

## Instructions

1. **Gather material**
   - The current changelog entry and launch tweet. The weekly changelog automation (Sundays 9 AM PT) commits them to an unpushed `changelog/YYYY-MM-DD` branch, so check local branches too: `git branch --list 'changelog/*'`, then read `apps/marketing/content/changelog/YYYY-MM-DD-*.mdx` and the sibling `YYYY-MM-DD-tweet.md` from the newest one.
   - Merged PRs from the past week: `gh pr list --state merged --search "merged:>=$(date -v-7d +%Y-%m-%d)" --json number,title,body,url --limit 50`. Use these for spotlight details the changelog compressed away.
   - Media: reuse the changelog's screenshots/videos from `apps/marketing/public/changelog/` where they fit a post.

2. **Check for an existing schedule**
   - `ls apps/marketing/content/posting/` and `git branch --list 'posting/*'`. If a schedule for this week already exists, do not create anything — report that and stop.

3. **Build the week (Mon–Fri)**

   Default diet — shrink it on a slow week, never pad or invent:

   | Day | Post |
   |-----|------|
   | Mon | Launch tweet (already drafted by the changelog automation) on X, plus a LinkedIn adaptation and a Discord #announcements message linking the changelog |
   | Tue | Feature spotlight #1 on X: one feature, the pain it kills, what it does, how to turn it on |
   | Wed | Feature spotlight #2 on X, or a build-in-public note about a real decision/tradeoff from the week's PRs |
   | Thu | Feature spotlight #3 on X, plus a LinkedIn version of the strongest spotlight |
   | Fri | Lighter: a tip, a docs pointer, or a "did you know" about an existing feature |

   - Spotlights cover the top changelog features one at a time, with more room than the launch tweet gave them. Attach media when a shot or clip exists.
   - Big launch weeks (major feature, pricing change, milestone): add a Reddit or Hacker News item to Monday and flag it clearly as needing extra care. Never use Reddit/HN for routine weeks.

4. **Voice**
   - Source of truth is the Notion page **"Kiet's Email voice"** — fetch it via Notion MCP if available. The same rules the changelog launch tweet follows (see `.github/prompts/generate-changelog.md`, "Launch tweet" section) apply to every post: no em dashes, no performative or salesy lines, no AI tells, write like a person typing fast then cut half.
   - LinkedIn posts may run a bit longer but keep the same voice. No hashtag piles, no "excited to announce".
   - Discord messages are one short message: what shipped, changelog link. No @everyone.

5. **Write the schedule file**
   - Create `apps/marketing/content/posting/YYYY-MM-DD-week.md` (Monday's date). This directory is not rendered by the marketing site; it exists for review.
   - Frontmatter: `title`, `date`, `type: posting-schedule`.
   - One section per day. Each post gets: channel, ready-to-paste copy, and a media pointer if any. Mark the Monday launch tweet as "from changelog automation" rather than duplicating divergent copy — copy it verbatim.

6. **Output workflow**
   - Branch: `posting/YYYY-MM-DD` (Monday's date).
   - Run `bun run lint:fix` and verify `bun run lint` exits 0.
   - Commit the schedule file with message `docs: weekly posting schedule YYYY-MM-DD`.
   - **Review, don't ship:** leave the committed branch for a human. Do not push, do not open a PR, and never post to X/LinkedIn/Discord/Reddit/HN or any other platform.
