# Cloud sidebar components

The cloud section of the desktop sidebar, broken into components that each have a Storybook story.
The visual spec is the Superset page "Cloud workspaces"
(https://app.superset.sh/page/cloud-row-states-nmkrlp, Sidebar tab); every story should match a
section of it.

## Rules

- **Views take props only.** No tRPC, stores, providers or hooks that reach app state inside a view,
  so a story can render it with plain data. The thin wrapper that fetches data lives next to it.
- **Views take API types, narrowed with `Pick`**, not hand-written copies of them. From app code a view
  imports only `import type` and presentational components (`StatusIcon`, `ProjectThumbnail`); a value
  import from a hook's folder drags the app runtime in and breaks Storybook. Original sidebar files are
  not edited to serve the new views.
- **Every view has a story**, covering the states on the spec page.
- **Shared visual atoms live in `packages/ui`** and use its existing Storybook. Everything specific to
  the sidebar lives in the desktop app and uses the desktop Storybook.
- **Cloud rows are their own component**, not branches inside the shared workspace row.
- Folder layout follows the root `AGENTS.md`: one folder per component with an `index.ts`, nested
  under the component that uses it, promoted only when used twice.

## File structure

```
packages/ui/
├── .storybook/main.ts                          # also picks up src/atoms/**/*.stories.tsx
└── src/atoms/
    ├── AvatarStack/                            # presence avatars: one or several, outline, solid backing, idle fade, one initial
    │   ├── AvatarStack.tsx
    │   ├── AvatarStack.stories.tsx
    │   └── index.ts
    └── WaveSpinner/                            # 11px, 3×3 squares, fill then empty
        ├── WaveSpinner.tsx
        ├── WaveSpinner.stories.tsx
        └── index.ts

apps/desktop/
├── .storybook/                                 # desktop Storybook: renderer aliases, Lingui macro, dark theme
│   ├── main.ts
│   ├── preview.tsx
│   └── storybook.css
└── src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/
    ├── DashboardSidebarCloudSection/
    │   ├── DashboardSidebarCloudSection.tsx    # wrapper: cloud list + device-local sidebar state → groups of items
    │   ├── index.ts
    │   ├── types.ts                            # PR and task types, Picks of API types
    │   ├── constants.ts                        # active window, PR icon and colour per state
    │   ├── components/
    │   │   ├── DashboardSidebarCloudItem/      # wrapper per box: route, rename, ports, PR, menu + hover card wiring
    │   │   ├── DashboardSidebarCloudGroup/     # wrapper: local group header shell, rename/delete, collapse
    │   │   ├── DashboardSidebarCloudRailItem/  # collapsed sidebar: repo icon + name tooltip (not mocked yet)
    │   │   ├── DashboardSidebarCloudListDialog/ # view: every box, Show on / Hide from Sidebar
    │   │   ├── DashboardSidebarPortsCard/      # view: the ports hover card (only the cloud row uses it)
    │   │   ├── DashboardSidebarCloudRow/       # view: repo icon, name, owner, ports, PR, status slot, ✕
    │   │   │   ├── DashboardSidebarCloudRow.tsx
    │   │   │   ├── DashboardSidebarCloudRow.stories.tsx
    │   │   │   ├── index.ts
    │   │   │   └── components/
    │   │   │       ├── DashboardSidebarCloudStatus/          # 24px slot: wave, dots, info, time
    │   │   │       ├── DashboardSidebarCloudPortsButton/     # tower + 11px count badge, 9+
    │   │   │       └── DashboardSidebarCloudPullRequestButton/
    │   │   ├── DashboardSidebarCloudContextMenu/  # view: cloud-only; an item shows when its handler is passed
    │   │   │   ├── DashboardSidebarCloudContextMenu.tsx
    │   │   │   ├── DashboardSidebarCloudContextMenu.stories.tsx
    │   │   │   └── index.ts
    │   │   └── DashboardSidebarCloudHoverCard/ # view: name, created-by, Tasks, Pull requests, People
    │   │       ├── DashboardSidebarCloudHoverCard.tsx
    │   │       ├── DashboardSidebarCloudHoverCard.stories.tsx
    │   │       ├── index.ts
    │   │       └── components/
    │   │           ├── DashboardSidebarCloudOwnerAvatar/   # the mock's plain 16px avatar, no outline
    │   │           ├── DashboardSidebarCloudHoverCardSection/
    │   │           ├── DashboardSidebarCloudTaskRow/
    │   │           ├── DashboardSidebarCloudPullRequestRow/
    │   │           └── DashboardSidebarCloudPersonRow/
    │   └── utils/
    │       ├── buildCloudSidebar/              # which boxes show, grouped and ordered; read state (tested)
    │       └── toPullRequestDisplayState/      # open + isDraft → draft
```

## Decisions locked on the spec page

| Part | Decision |
| --- | --- |
| Row | 32px tall, 2px apart |
| Repo icon, avatars | 20px (18px the runner-up) |
| Owner avatar | Only on boxes that aren't yours, right after the name; outline at 35% |
| Right side | Ports tower, PR icon, status slot, each a 24px cell; 20px gap before them |
| Status slot | Flush right. Creating: gray wave. Working: amber wave. Needs you: pulsing yellow 8px dot. Done, unread: white 8px dot. Failed: salmon "i". Idle: time since the agent last notified |
| Wave | 11px, 3×3 squares of 3px, 1px gaps, fills diagonally, full for one frame, empties; 1.2s loop |
| Ports | Static radio tower, 11px count badge top right, "9+" above nine; the badge's ring is the sidebar's own surface (`muted/35` over the background in dark), not `--sidebar` |
| ✕ | Replaces only the status slot on hover. 20px button, 16px `HiMiniXMark` (20px-grid heroicon; Lucide's `LuX` renders ~9px) whose strokes are 8×8, exactly the dot's pixels; 6px padding around the strokes; button extends 6.25px past the slot into the row's 8px right padding |
| Hover card | Name, created-by line, then Tasks, Pull requests, People; no dividers; lists scroll past four; PR rows open GitHub |
| Ports card | Count top right turns into an unplug button on card hover, tooltip "Close all ports"; per-port ✕ on row hover |

## Build order

- [x] Desktop Storybook set up
- [x] `AvatarStack` (one or many people) and `WaveSpinner`, with stories
- [x] Cloud row and its parts, with stories
- [x] Hover card and its sections, with stories
- [x] Ports card, with stories (local ports chip not switched over yet)
- [x] Cloud context menu, its own view with stories (the shared workspace menu is untouched)
- [x] Wrappers wired to real data; cloud rows no longer go through the shared workspace row
- [x] Simple cloud list: a dialog from the Cloud header, every box by last agent message, Show on / Hide from Sidebar
- [ ] Designed cloud list view (mock first)
- [x] Delete main's now-unreachable cloud branches in the shared row
- [x] Adversarial review (state, regressions, conventions/a11y/i18n); findings fixed or noted on the verification page

## State

Everything about a box comes from `cloudWorkspace.list` (react-query + the realtime push). What this
person's sidebar shows lives on the device in `renderer/stores/cloud-sidebar.ts`, per organization:
- a box shows when its entry says so, otherwise when you created it
- groups are named, collapsible, in creation order; boxes by the agent's last message (`agentStatusAt`, else created), newest first
- read state is `lastReadAt` against the box's `agentStatusAt`
