import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";

export const CONFIGURE_CARD_PROMPT = `Help me configure the lines shown on the sidebar workspace cards by editing the "workspaceCard" block of this project's .superset/config.json (the repo-shared default for which card lines show).

IMPORTANT — where the file lives. The app reads the shared config from the PROJECT ROOT (the main checkout), NOT from an agent worktree. If your current working directory path contains ".superset/worktrees/", you are in a worktree: run \`git worktree list\` and treat the FIRST entry as the main checkout. Write the config there (create the .superset/ directory and config.json if they don't exist), AND copy the same file into the current worktree so the change is part of what you commit. If you are not in a worktree, just edit ./.superset/config.json at the repo root.

Schema. Boolean fields prTitle, prChecks, diffStats, status, linearTicket (all default to true), plus a customLines array. Each customLines entry is discriminated by "type":
1. command — { id, type: "command", label, command, enabled }. The shell command runs in the workspace folder; the first line of its output shows on the card. ("type" may be omitted; it defaults to "command".)
2. component — { id, type: "component", label, component, enabled }. "component" names a built-in app widget. Valid keys: "pomodoro" (elapsed time since workspace creation in 25-minute cycles), "clock" (current local time), "pr-checks-inline" (compact PR checks summary). Unknown keys render nothing.
3. widget — { id, type: "widget", label, file, enabled }. The richest option: "file" points at an LLM-authored TSX file you write under .superset/widgets/ (canonically .superset/widgets/<name>.tsx; "file" is that path RELATIVE to .superset/, e.g. "widgets/ci.tsx" — it must be relative, no leading slash, no ".." segments). A widget can render icons, badges, links, and buttons, and can poll or run shell commands. Author widgets against the kit + style chart documented in apps/desktop/docs/workspace-card-widgets.md (read it before writing one): each widget is a file that does \`export default function Widget({ ctx, kit }) { ... }\`, may import only from "react", "react-icons/lu", and "superset/widgets", and must follow the card styling conventions (11px text, truncation, gap-1.5, muted-foreground) and design tokens described there.

For every line: "id" must be unique; "label" is an optional prefix; "enabled" defaults to true.

Security. command and widget lines run arbitrary code, so the app gates them behind explicit user approval (Project Settings → Workspace card). The trust approval covers the widget file CONTENTS, so each time you create or edit a .superset/widgets/*.tsx file the user must re-approve before it runs. Mention this when you add or change a command or widget line.

Validation steps after editing:
- Confirm the JSON is valid: \`python3 -m json.tool .superset/config.json\` (and the worktree copy, if any).
- Confirm .superset/config.json and .superset/widgets/ are NOT gitignored (\`git check-ignore -v .superset/config.json\`), since the config is meant to be shared in the repo.
- Widgets and config hot-reload — no app restart needed; the card updates as you save.

Before writing anything, ASK me which built-in lines I want visible and which custom lines or widgets I want (and what each should do). Then update the file(s) accordingly, preserving every other key already in the config. Note: the app's in-app card settings only override this file on a given machine when they diverge from it.`;

/**
 * "Configure card with agent": pre-fills the new-workspace prompt and opens
 * the creation modal — same flow as setup/teardown script configuration. The
 * user reviews and submits; nothing starts automatically.
 */
export function useConfigureCardWithAgent(projectId: string): () => void {
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const openNewWorkspaceModal = useNewWorkspaceModalStore((s) => s.openModal);

	return () => {
		updateDraft({
			prompt: CONFIGURE_CARD_PROMPT,
			selectedProjectId: projectId,
		});
		openNewWorkspaceModal(projectId);
	};
}
