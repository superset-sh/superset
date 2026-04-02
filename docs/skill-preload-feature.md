# Skill Preload Feature — Implementation State

Branch: `chat-ux-enhancements` (super-canopy)
Mastra PR: superset-sh/mastra#9 (branch `mk/skill-preload-and-command-paths`)

## What this does

When a user embeds a `/command` chip in a message — e.g. "please help me /redesign this component" — the system:

1. Extracts the custom command name(s) from the chip nodes
2. Strips the leading `/` from each chip in the message text sent to the LLM
3. Passes the command names as `metadata.skills` to the backend
4. The backend forwards them as `preloadSkills` to `harness.sendMessage()`
5. The harness prepends an instruction so the agent calls `skill(name)` for each one before responding
6. Visible `SkillToolCall` blocks appear in the chat UI before the LLM reply

Built-in slash commands (`/new`, `/stop`, `/model`, `/mcp`) are unaffected — only `kind === "custom"` commands are extracted as skills.

---

## Files changed in super-canopy

### New files
- `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ToolCallBlock/components/SkillToolCall/SkillToolCall.tsx`
- `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ToolCallBlock/components/SkillToolCall/index.ts`

### Modified files

**`packages/chat/src/server/trpc/zod.ts`**
- Added `skills?: z.array(z.string())` to `sendMessageInput` metadata schema

**`packages/chat/src/server/trpc/service.ts`**
- Passes `preloadSkills: input.metadata?.skills` to `harness.sendMessage()`

**`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/components/WorkspaceChatInterface/utils/sendMessage/sendMessage.ts`**
- Added `skills?: string[]` to `ChatSendMessageInput.metadata` type

**`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/components/WorkspaceChatInterface/ChatPaneInterface.tsx`**
- Added import: `findSlashCommandByNameOrAlias` from `@superset/chat/shared`
- In `handleSend`: extracts custom skill chip names from content via regex, strips `/` prefix, passes as `metadata.skills`
- Added `slashCommands` to `useCallback` dependency array

**`apps/desktop/src/renderer/components/Chat/ChatInterface/components/ToolCallBlock/ToolCallBlock.tsx`**
- Added import + registration for `SkillToolCall`
- Handles `toolName === "skill" || toolName === "load_skill"`

---

## Files changed in mastra fork (superset-sh/mastra#9)

**`mastracode/src/agents/workspace.ts`**
- Added `.claude/commands/` and `.agents/commands/` (local + global) to `skillPaths`
- These directories are where Superset slash command files live (`.md` files)

**`packages/core/src/harness/harness.ts`**
- Added `preloadSkills?: string[]` to `sendMessage()` signature
- When provided: prepends `<system>` block instructing agent to call `skill(name)` for each entry before responding

---

## Local testing setup

The `package.json` resolutions in this branch are **temporarily pointing to local tarballs** at `/tmp/mastra-local/`. These files only exist on the machine where they were built.

To rebuild from the mastra fork on a new machine:

```bash
# 1. Clone or pull the mastra fork
git clone https://github.com/superset-sh/mastra.git ~/Sites/mastra
cd ~/Sites/mastra
git checkout mk/skill-preload-and-command-paths

# 2. Install dependencies
corepack enable
pnpm install

# 3. Build mastracode and @mastra/core
pnpm turbo build --filter="@mastra/core" --filter="mastracode"

# 4. Pack the tarballs
mkdir -p /tmp/mastra-local
cd mastracode && pnpm pack --pack-destination /tmp/mastra-local && cd ..
cd packages/core && pnpm pack --pack-destination /tmp/mastra-local && cd ../..

# 5. Wire into super-canopy (already done in package.json on this branch)
cd /path/to/super-canopy
bun install
```

To restore production packages after testing:

```bash
# In super-canopy package.json, revert resolutions back to:
# "mastracode": "https://github.com/superset-sh/mastra/releases/download/mastracode-v0.4.0-superset.16/mastracode-0.10.0-alpha.6.tgz"
# "@mastra/core": "https://github.com/superset-sh/mastra/releases/download/mastracode-v0.4.0-superset.16/mastra-core-1.18.0-alpha.3.tgz"
bun install
```

Once superset-sh/mastra#9 is merged and a new tarball release is cut, update the `resolutions` URLs to point to the new release and remove the local tarball entries.

---

## What's NOT done yet

- The `package.json` resolutions need to be reverted to GitHub URLs before merging this branch (the local `/tmp/mastra-local/` paths will break on CI and other machines)
- Once mastra#9 is merged + released as `mastracode-v0.4.0-superset.17` (or similar), update resolutions to the new release URLs
- The `TiptapPromptEditor`'s `SlashCommandPreview` component shows a preview for the old single-command-at-start flow — may want to update it to handle embedded chips
- Consider whether the `focusShortcutText` hint in the workspace `ChatInputFooter` needs to be re-added (it was removed in a previous refactor; the main `ChatInputFooter` passes it via `TiptapPromptEditor` but the workspace version does not pass `sessionId`/`workspaceId`)

---

## How to test

1. Add a command file to the project:
   ```bash
   echo "You are a UI redesign expert. Analyze the component and suggest improvements." > .claude/commands/redesign.md
   ```

2. Start the desktop app:
   ```bash
   bun dev --filter=@superset/desktop
   ```

3. In chat, type `help me /redesign`, select `redesign` from the slash command popover, then submit.

4. Expected: `Skill(redesign)` tool call block appears in the chat before the LLM reply, with "Successfully loaded skill" shown when complete.
