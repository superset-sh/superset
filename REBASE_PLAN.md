# Rebase and Port Plan: Invitation Logic

## Current Situation

**Branch**: `invitation-strip`
**Target**: `origin/main` (commit `0adb7d03`)
**Key Change in Main**: Settings refactored - `/settings/team` → `/settings/members`

## Conflicts Detected

### 1. `packages/auth/src/server.ts`
- **Main** added: `customSession` plugin
- **Our branch** added: `acceptInvitationEndpoint` plugin, `generateMagicTokenForInvite` import
- **Resolution**: Merge both changes

### 2. `apps/desktop/src/renderer/routes/_authenticated/settings/team/page.tsx`
- **Main**: Deleted (renamed to `members/`)
- **Our branch**: Modified
- **Resolution**: Port changes to new `members/` structure

### 3. `apps/web/src/app/(dashboard)/components/Header/Header.tsx`
- **Conflict**: Need to check what changed
- **Resolution**: TBD

### 4. `packages/trpc/src/router/organization/organization.ts`
- **Conflict**: Need to check what changed
- **Resolution**: TBD

## User Requirements

1. **Rebase onto main** (if possible)
2. **Port invitation logic to new settings structure**
3. **Separate table for pending invites** (new requirement)

---

## Step 1: Complete Rebase

### Conflicts to Resolve:

#### A. `packages/auth/src/server.ts`
```typescript
// ✅ DONE - Merge both:
import { bearer, customSession, organization } from "better-auth/plugins";
import { acceptInvitationEndpoint } from "./lib/accept-invitation-endpoint";
import { generateMagicTokenForInvite } from "./lib/generate-magic-token";

// In plugins array, add:
acceptInvitationEndpoint,
```

#### B. Delete `settings/team/page.tsx`
```bash
git rm apps/desktop/src/renderer/routes/_authenticated/settings/team/page.tsx
```

#### C. `Header.tsx` - Check and resolve
```bash
# View conflict
git show :2:apps/web/src/app/(dashboard)/components/Header/Header.tsx  # main
git show :3:apps/web/src/app/(dashboard)/components/Header/Header.tsx  # ours
```

#### D. `organization.ts` - Check and resolve
```bash
# View conflict
git show :2:packages/trpc/src/router/organization/organization.ts  # main
git show :3:packages/trpc/src/router/organization/organization.ts  # ours
```

---

## Step 2: Port Invitation UI to New Structure

### Old Structure (our branch)
```
settings/team/
├── page.tsx                              # Shows members + invitations mixed
├── components/
    └── InvitationActions/                # Actions for invitations
        ├── InvitationActions.tsx
        └── index.ts
```

### New Structure (main)
```
settings/members/
├── page.tsx                              # Entry point with search
├── components/
    ├── MembersSettings/
    │   ├── MembersSettings.tsx          # Main component
    │   ├── components/
    │   │   ├── InviteMemberButton/       # Invite UI
    │   │   └── MemberActions/            # Actions for members
    │   └── index.ts
    └── types.ts                          # Shared types
```

### Changes Needed

#### 2.1 Create Separate Invitations Section

**NEW FILE**: `settings/members/components/PendingInvitations/PendingInvitations.tsx`

```typescript
interface PendingInvitationsProps {
  visibleItems?: SettingItemId[] | null;
}

export function PendingInvitations({ visibleItems }: PendingInvitationsProps) {
  // Query invitations from @tanstack/react-db
  const { data: invitationsData, isLoading } = useLiveQuery(
    (q) =>
      q.from({ invitations: collections.invitations })
       .where(({ invitations }) => eq(invitations.status, "pending"))
       .where(({ invitations }) => eq(invitations.organizationId, activeOrgId))
       .orderBy(({ invitations }) => invitations.createdAt, "desc"),
    [collections, activeOrgId]
  );

  return (
    <div>
      <h3>Pending Invitations</h3>
      <Table>
        {/* Render invitations table */}
      </Table>
    </div>
  );
}
```

**Key Components:**
- Email
- Name (if provided)
- Role
- Invited by
- Sent date
- Actions (Resend, Cancel)

#### 2.2 Update `MembersSettings.tsx`

```typescript
export function MembersSettings({ visibleItems }: MembersSettingsProps) {
  // Existing members table code...

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8">
        {/* Existing members table */}
        <MembersTable members={members} ... />

        {/* NEW: Add pending invitations section */}
        <div className="mt-12">
          <PendingInvitations visibleItems={visibleItems} />
        </div>
      </div>
    </div>
  );
}
```

#### 2.3 Move InvitationActions Component

**FROM**: `settings/team/components/InvitationActions/`
**TO**: `settings/members/components/PendingInvitations/components/InvitationActions/`

**Update imports** in the moved component to work with new structure.

#### 2.4 Update Settings Search

**FILE**: `settings/utils/settings-search.ts`

Add new search item IDs:
```typescript
export const SETTING_ITEM_ID = {
  // ... existing
  MEMBERS_PENDING_INVITATIONS: "members-pending-invitations",
} as const;

// Update settingItems array:
{
  id: SETTING_ITEM_ID.MEMBERS_PENDING_INVITATIONS,
  section: "members",
  title: "Pending Invitations",
  description: "View and manage organization invitations",
  keywords: ["invite", "invitation", "pending"],
}
```

---

## Step 3: Ensure Invitations Sync to Local DB

### Current Flow
1. API backend creates invitation in Postgres
2. Electric SQL syncs to local DB
3. UI reads from local DB via `@tanstack/react-db`

### Files to Check

**Electric Sync Config**: `apps/desktop/src/lib/trpc/routers/electric/initialize.ts`

Ensure `invitations` table is synced:
```typescript
await db.sync(
  shapes.members({ where: organizationClause }),
  shapes.invitations({ where: organizationClause }),  // ✅ Should exist
  // ...
)
```

---

## Step 4: Separate Invitations UI (User Request)

### Visual Separation

Instead of mixing members and invitations in one table, create **two distinct sections**:

```
┌─────────────────────────────────────────┐
│ Members                                  │
│ ┌─────────────────────────────────────┐ │
│ │ Table: Active members                │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Pending Invitations                      │
│ ┌─────────────────────────────────────┐ │
│ │ Table: Pending invites               │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Implementation

- Keep existing `<MembersTable>` for active members
- Add new `<PendingInvitationsTable>` below with visual separation
- Use same table styling but different sections
- Both should be searchable in settings search

---

## Step 5: Testing Checklist

After rebase and port:

- [ ] Members page loads without errors
- [ ] Active members display correctly
- [ ] Pending invitations display in separate section
- [ ] Invite member button works
- [ ] Accept invitation flow works (web app)
- [ ] Resend invitation works
- [ ] Cancel invitation works
- [ ] Settings search finds both members and invitations
- [ ] Electric sync includes invitations table
- [ ] Better Auth endpoint `/api/auth/accept-invitation` works

---

## Files That Need Changes

### To Modify
1. `packages/auth/src/server.ts` - Add imports and plugin
2. `apps/desktop/src/renderer/routes/_authenticated/settings/members/components/MembersSettings/MembersSettings.tsx` - Add invitations section
3. `settings/utils/settings-search.ts` - Add invitation search items

### To Create
1. `settings/members/components/PendingInvitations/PendingInvitations.tsx`
2. `settings/members/components/PendingInvitations/components/InvitationActions/` (moved from team/)
3. `settings/members/components/PendingInvitations/index.ts`

### To Delete
1. `settings/team/page.tsx` (already deleted in rebase)
2. `settings/team/components/InvitationActions/` (moved to members/)

---

## Next Steps

1. **Resume rebase** and resolve remaining conflicts
2. **Port invitation UI** to new members structure
3. **Add separate invitations table** UI
4. **Test full flow** end-to-end
5. **Commit and push**

---

## Notes

- User wants invitations in a **separate table**, not mixed with members
- Settings structure now uses search functionality
- New `customSession` plugin in main needs to be preserved
- `acceptInvitationEndpoint` is working and should be kept
