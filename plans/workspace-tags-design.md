# Workspace tags, and sidebar folders built on them

Design doc for a fresh PR. The `workspace-tags` branch (#6564 and the refactor on top of it) is
being discarded; this is what that work established, so the reimplementation can go straight to the
end state instead of arriving at it by correction.

Scope is **v2 only**. `renderer/screens/main/**` and
`lib/trpc/routers/workspaces/procedures/sections.ts` are the v1 section system and are not touched.

---

## 1. The model

A sidebar folder **is** a tag. Both halves derive from host-side tags:

| | Source |
|---|---|
| Does the folder exist? | any workspace in the project carries the tag |
| Which workspaces are in it? | the ones carrying the tag |
| Its colour, label, order, collapsed | local presentation row, created only when someone customises |

The point is that **any actor that can tag a workspace can file it** — the CLI, an MCP agent, an
automation — including on a machine that has never seen the tag. That property is the whole feature;
everything below protects it.

### Why not a tag entity

Tempting, and it's what GitHub/Linear/Notion labels do. Rejected because a required entity means
`--tag anything` needs get-or-create, a foreign key, and a lifecycle — and cheap, unceremonious
tagging from an agent is the thing we are optimising for. Jira labels, Docker tags, and S3 tags are
plain strings for the same reason.

The attributes an entity would carry (shared colour, one-shot rename) are better bought by
promoting only the *presentation* row host-side. See §7.

---

## 2. Data model

```
workspaces(..., parent_workspace_id, spawn_origin)     -- lineage, separate feature
workspace_tags(workspace_id, tag, created_at)
  UNIQUE(workspace_id, tag)
  INDEX(tag)
  FK workspace_id -> workspaces(id) ON DELETE CASCADE
```

`tag` is stored already-normalized. No tag table, no tag ids.

Local (per device), presentation only:

```
{ sectionId: `${projectId}:${tag}`, projectId, name, tag, color, tabOrder, isCollapsed }
```

The composite key is what lets a derived folder be addressed by the existing UI plumbing without a
stored row — the tag is recoverable from the key alone.

---

## 3. Normalization is one definition, shared

Put it in `@superset/shared/workspace-tags`, imported by host service, CLI, MCP **and** the
renderer. Not duplicated per surface.

- `normalizeWorkspaceTag` — trim + lowercase; returns `null` for empty or over-length.
- `normalizeWorkspaceTags` — normalize, drop, dedupe, **sort**.
- A zod input schema used by every router that accepts tags.

Three rules learned the hard way:

- **Normalize on both sides of every comparison.** A folder keyed `Perf` must match a workspace
  tagged `perf`, or membership silently fails.
- **Reject, don't drop.** Over-length tags and over-cap sets must error at the router boundary. The
  first implementation silently discarded them, so a CLI user got a success and no tag.
- **Sort the set.** Otherwise the create broadcast and a later list disagree on order, and rows
  reshuffle on refetch.

One cap (32/workspace, 64 chars) expressed once — not a zod `.max(64)` next to a constant of 32.

---

## 4. Derivation: one resolver, no exceptions

The single most expensive mistake in the discarded branch: **three independent passes each derived
membership their own way** — the sidebar builder, the top-level lane in `useDashboardSidebarState`,
and `getFlattenedV2WorkspaceIds`. Every bug in the original review traced to them disagreeing.

Build one module and route all three through it:

```ts
getProjectFolderTagIndex(sections, projectId): Map<tag, FolderRef>
resolveWorkspaceFolder(tags, index): FolderRef | null   // lowest tabOrder wins ties
applyFolderTagChange(currentTags, folderTags, nextTag): string[]
parseSidebarFolderKey(sectionId): { projectId, tag } | null
deriveTagFolders(sections, workspaces): Section[]        // union: stored rows + tag-only folders
```

**Invariant: a workspace renders in exactly one container.** Tags are many-to-many; ordering, DnD,
selection and keyboard nav all assume one. Ties resolve to the lowest `tabOrder`. Multi-membership
is a separate project — it needs composite (folder, workspace) keys through the flatten pass, drag
ids, selection store and pinned dedupe.

`applyFolderTagChange` must only touch tags the project has a folder for. An agent's `--tag scratch`
has to survive the user dragging that workspace between folders.

---

## 5. Mutation semantics

Keep every existing `useDashboardSidebarState` signature. `sectionId` stays the UI's currency; for a
tag-backed folder it is just `${projectId}:${tag}`. Done this way, DnD, bulk actions, context menus
and shortcuts need **no changes at all** — only storage moves.

| Action | Behaviour |
|---|---|
| Create folder from workspace | mint tag from the name, tag the workspace |
| Move into folder | replace the project's folder tags with the target tag |
| Ungroup / move to top level | strip the project's folder tags |
| Rename | retag every member, rekey the local row |
| Delete folder | untag every member, drop the row |
| Colour / collapse / reorder | local row only |

Three specific traps:

- **Retag before rekeying the row.** Swap the row first and the strip step can no longer see the old
  tag, so it survives on every member — litter that silently recaptures them if a folder by that
  name is ever created again.
- **Materialize on first interaction.** A derived folder has no row, so colour/rename/collapse/
  delete must create one and then proceed; otherwise they silently no-op. Do *not* create rows
  up front — every tag an agent invents would litter local storage.
- **A move into a derived folder must read the tag from the key.** Treating a missing row as "legacy
  folder" writes a `sectionId` pointing at nothing and orphans the workspace.

Membership writes are host calls, so route them through the existing optimistic path
(`hostWorkspacesCache.upsertWorkspace` → `workspace.update` → `invalidateHost` + toast on failure).

Host-side, wrap tag replacement in a transaction — it is delete-then-insert, and a throw between
them loses the whole set.

---

## 6. Migrating existing folders

Legacy folders store membership in `sidebarState.sectionId`. Convert in place:

1. Slug `name` → tag; a name that can't be a tag falls back to `group`; collisions get `-2`.
2. Members are the folder's **visible** `sectionId` rows — never resurrect a hidden tombstone.
3. Tag every member on its host. Unreachable host → leave the whole folder legacy, retry next run.
4. Only once all members landed: insert the tag-keyed row, delete the legacy row, clear `sectionId`.

**No migration flag.** `tag === null` is itself the "not converted" marker: idempotent, resumable,
self-clearing, and no new persisted key to register under the desktop localStorage policy.

Park a folder for the session if its host *rejects* a write — the effect re-runs on every
workspace-cache change, so a permanently failing folder would otherwise hammer the host forever.

**Consequence to accept up front:** a folder whose host is offline stays legacy indefinitely, so
`sectionId` cannot be deleted in the same release. Make the rule unambiguous instead: a folder with
`tag === null` owns its members via `sectionId`; a tag-backed folder **ignores `sectionId`
entirely**. Since migration only sets `tag` after every member is tagged, a stale pointer can never
beat a live tag.

---

## 7. Agreed follow-up: presentation host-side

Not in the first PR, but design toward it.

```
workspace_tag_settings(project_id, tag, display_name, color, tab_order)
```

A row exists only once someone customises the folder — same lifecycle as the local row, just on the
host. It buys two things the string model can't:

- **Rename becomes one row update and stops retagging.** Today rename is O(members) independent
  writes with no transaction spanning them; a 30-workspace folder half-lands on a flaky host. With
  `display_name`, `tag` stays the stable slug agents target and the label is what the sidebar shows.
- **Colour and name follow the user** across devices. Today they're per-device.

`isCollapsed` stays local — it's per-window view state, not a property of the group.

---

## 8. Traps that cost real time

Worth reading before writing code; each of these was found by the app breaking, not by review.

- **`undefined` is not `null`.** A persisted row written before a field existed carries `undefined`.
  A `=== null` guard let it through to `normalizeWorkspaceTag`, which crashed the entire sidebar on
  `.trim()`. Every unit test passed, because every fixture set the field explicitly. Use `== null`,
  and add a fixture with the field *absent*.
- **`withReadHeal` deletes rows that fail schema parse.** A stricter schema destroys users' folders
  on first boot, before any migration can read them. Widen fields (`sectionId` uuid → string), give
  new fields a default, and verify both old and new shapes parse.
- **`getProjectTopLevelItems` counted tag-derived rows as top-level.** They have a null `sectionId`
  but render inside a folder, so every insert index computed against that list was shifted by
  phantom siblings.
- **"Ungroup" was a guaranteed no-op.** It early-returns when `sectionId` is already null — which is
  exactly the state of a tag-derived member. The check has to consider the *derived* container.
- **The lineage cascade yanked children out of their own folders.** It couldn't distinguish "derived
  alongside the parent" from "derived into a different folder"; both look like `sectionId === null`.
- **`deleteSection` stranded tag-derived members**, because it re-seated only rows matching the
  `sectionId` it was deleting.
- **Renumbering drizzle migrations:** don't hand-edit. Reset `drizzle/` to main, re-run
  `drizzle-kit generate` per migration in order, then confirm a follow-up generate reports *"No
  schema changes"*. Verify against a real, previously-migrated host DB — a fresh one proves nothing.

### Dev-environment traps (unrelated to the feature, cost hours)

- **The documented CDP auth repair switches the active org and persists it.** That silently moved
  the dev app off the org holding all its data. Don't run the dev sign-in unless the session is
  actually broken.
- **`setup.sh --force` does not run API migrations.** After merging main, session restore 500s on
  `column "last_active_organization_id" does not exist` → sign-in wall → onboarding gate → no host
  service starts. The fix is `bun run db:migrate` against the workspace's own Neon branch. Every
  symptom looked like a corrupt workspace; it was one missing column.

---

## 9. Build order

1. **`@superset/shared/workspace-tags`** — constants, normalizers, zod input schema, tests.
2. **Host service** — `workspace_tags` table, transactional read/write helpers, `tags` on
   create/update/list and on the update *result*, MCP `workspaces_update` accepting tags.
3. **Derivation module** — the five functions in §4, unit-tested including the absent-field fixture.
4. **Sidebar read path** — builder consumes `deriveTagFolders`; point the top-level lane and the
   flatten pass at the same resolver.
5. **Mutations** — signatures unchanged, membership becomes host writes, materialize-on-interaction.
6. **Migration** — §6, last, once the shape is settled.
7. **CLI** — `--tag` on create/update (exists), `--tag` filter and a TAGS column on `ws list`.

Build the derived-folder case **first**, not as a retrofit. In the discarded branch, folders only
rendered when a local row existed, so CLI tagging grouped nothing — the feature's whole premise was
missing until it was caught by someone asking whether it actually worked like folders.

---

## 10. Deferred / open

| | |
|---|---|
| Stray agent tags each become a visible folder | needs a per-project hide list and a "Hide folder" action that doesn't untag |
| An empty folder can't exist | untagging the last member drops colour and position; consider keeping the row briefly |
| Cloud and session workspaces can't be tagged | they render in a flat lane with `projectId: null`; never were groupable |
| Moving between folders needs a reachable host | optimistic upsert hides latency, but genuinely offline fails where localStorage always succeeded |
| Multi-membership | deliberately out of scope; see §4 |
| Folder names are normalized | shows `perf work`, not `Perf Work`; tags allow spaces, so no slugging beyond trim/lowercase |

---

## Verification worth repeating

The end-to-end check that actually proves the feature, done over CDP against the running app on real
data: tag two workspaces of one project **over the host service, with no folder created anywhere**,
and confirm the folder appears holding both while local storage still contains no row for it. Then
untag and confirm it disappears. That single test covers derivation, existence, membership and
cleanup, and it is the one that would have caught the missing-derived-folder gap on day one.
