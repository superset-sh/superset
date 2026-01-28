# Desktop: Invite Member

## What to Ship

Add invitation system to Settings → Team page. Admin+ can invite users by email with role selection.

**UI:**
- "Invite Member" button → dialog with email input + role dropdown
- Unified table showing both members and pending invitations
- Pending invitations shown with "Pending" badge, lighter styling
- Actions: Resend (if expired), Cancel (for invitations)
- Real-time updates via Electric SQL

**Permissions:**
- Admins can invite: members and admins
- Owners can invite: members, admins, and owners
- Members cannot invite (button disabled)

**Behavior:**
- Expiry: 48 hours (Better Auth default)
- Email: Sent via Resend with React Email template
- Acceptance: user clicks link → Better Auth creates member → Electric SQL syncs

## Files to Create

### 1. `packages/email/src/emails/organization-invitation.tsx`

```typescript
import { Heading, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface OrganizationInvitationEmailProps {
  organizationName: string;
  inviterName: string;
  inviteLink: string;
  role: string;
}

export function OrganizationInvitationEmail({
  organizationName = "Acme Inc",
  inviterName = "John Doe",
  inviteLink = "https://app.superset.sh/accept-invitation/123",
  role = "member",
}: OrganizationInvitationEmailProps) {
  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <StandardLayout preview={`${inviterName} invited you to join ${organizationName}`}>
      <Heading>You've been invited to join {organizationName}</Heading>

      <Text>
        {inviterName} has invited you to join <strong>{organizationName}</strong> on Superset as a{" "}
        <strong>{roleDisplay}</strong>.
      </Text>

      <Text>
        Superset helps teams automate workflows and boost productivity with AI-powered task management.
      </Text>

      <Button href={inviteLink}>Accept Invitation</Button>

      <Text>
        This invitation will expire in 48 hours. If you weren't expecting this invitation, you can
        safely ignore this email.
      </Text>
    </StandardLayout>
  );
}

export default OrganizationInvitationEmail;
```

### 2. `packages/email/src/lib/resend.ts`

```typescript
import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);
```

### 3. `packages/auth/src/lib/rate-limit.ts`

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// 10 invitations per hour per user
export const invitationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "ratelimit:invitation",
});
```

### 4. `apps/desktop/src/renderer/routes/_authenticated/settings/team/types.ts`

```typescript
import type { SelectInvitation, SelectMember, SelectUser } from "@superset/db/schema/auth";
import type { OrganizationRole } from "@superset/shared/auth";

export type TeamMember = SelectUser &
  SelectMember & {
    memberId: string;
    role: OrganizationRole;
  };

export type InvitationRow = SelectInvitation & {
  inviterName: string;
};
```

### 5. `apps/desktop/src/renderer/routes/_authenticated/settings/team/components/InviteMemberButton/InviteMemberButton.tsx`

Replace entire file:

```typescript
import { canInvite, getInvitableRoles, ORGANIZATION_ROLES, type OrganizationRole } from "@superset/shared/auth";
import { Button } from "@superset/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";

export function InviteMemberButton() {
  const { data: session } = authClient.useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();

  const organizationId = session?.session?.activeOrganizationId;
  const organizationName = activeOrg?.name;
  const currentUserRole = activeOrg?.members?.find(
    (m) => m.userId === session?.user?.id,
  )?.role as OrganizationRole | undefined;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("member");
  const [isInviting, setIsInviting] = useState(false);

  const invitableRoles = currentUserRole ? getInvitableRoles(currentUserRole) : [];
  const canInviteAnyone = invitableRoles.length > 0;

  const handleInvite = async () => {
    if (!organizationId || !currentUserRole) return;

    if (!canInvite(currentUserRole, role)) {
      toast.error(`Cannot invite users as ${ORGANIZATION_ROLES[role].name}`);
      return;
    }

    setIsInviting(true);
    try {
      await authClient.organization.inviteMember({
        organizationId,
        email,
        role,
      });

      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  if (!canInviteAnyone) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button disabled className="gap-2">
            <HiOutlinePlus className="h-4 w-4" />
            Invite Member
          </Button>
        </TooltipTrigger>
        <TooltipContent>Members cannot invite others</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <HiOutlinePlus className="h-4 w-4" />
        Invite Member
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {organizationName ?? "your organization"}. Expires in 48 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isInviting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(val) => setRole(val as OrganizationRole)}>
                <SelectTrigger id="role" disabled={isInviting}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invitableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ORGANIZATION_ROLES[r].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isInviting}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isInviting || !email}>
              {isInviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### 6. `apps/desktop/src/renderer/routes/_authenticated/settings/team/components/InviteMemberButton/index.ts`

```typescript
export * from "./InviteMemberButton";
```

### 7. `apps/desktop/src/renderer/routes/_authenticated/settings/team/components/InvitationActions/InvitationActions.tsx`

```typescript
import type { SelectInvitation } from "@superset/db/schema";
import type { OrganizationRole } from "@superset/shared/auth";
import { Button } from "@superset/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineEnvelope, HiOutlineXMark } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";

interface InvitationActionsProps {
  invitation: SelectInvitation;
  organizationId: string;
}

export function InvitationActions({ invitation, organizationId }: InvitationActionsProps) {
  const [isCanceling, setIsCanceling] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const isExpired = new Date() > new Date(invitation.expiresAt);

  const handleCancel = async () => {
    setIsCanceling(true);
    try {
      await authClient.organization.cancelInvitation({ invitationId: invitation.id });
      toast.success("Invitation canceled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel invitation");
    } finally {
      setIsCanceling(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await authClient.organization.inviteMember({
        organizationId,
        email: invitation.email,
        role: (invitation.role || "member") as OrganizationRole,
        resend: true,
      });
      toast.success("Invitation resent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend invitation");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <HiEllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isExpired && (
          <DropdownMenuItem onSelect={handleResend} disabled={isResending} className="gap-2">
            <HiOutlineEnvelope className="h-4 w-4" />
            Resend
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handleCancel} disabled={isCanceling} className="text-destructive gap-2">
          <HiOutlineXMark className="h-4 w-4" />
          Cancel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 8. `apps/desktop/src/renderer/routes/_authenticated/settings/team/components/InvitationActions/index.ts`

```typescript
export * from "./InvitationActions";
```

### 9. `apps/desktop/src/renderer/routes/_authenticated/settings/team/page.tsx`

Replace the entire page with unified table approach:

```tsx
import {
	canRemoveMember,
	getRoleSortPriority,
	type OrganizationRole,
} from "@superset/shared/auth";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { InviteMemberButton } from "./components/InviteMemberButton";
import { InvitationActions } from "./components/InvitationActions";
import { MemberActions } from "./components/MemberActions";
import type { InvitationRow, TeamMember } from "./types";

export const Route = createFileRoute("/_authenticated/settings/team/")({
	component: TeamSettingsPage,
});

type TableRow =
	| ({ type: "member" } & TeamMember)
	| ({ type: "invitation" } & InvitationRow);

function TeamSettingsPage() {
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const collections = useCollections();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const { data: membersData, isLoading: membersLoading } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.innerJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ members, users }) => ({
					...users,
					...members,
					memberId: members.id,
				}))
				.where(({ members }) =>
					eq(members.organizationId, activeOrganizationId ?? ""),
				)
				.orderBy(({ members }) => members.role, "asc")
				.orderBy(({ members }) => members.createdAt, "asc"),
		[collections, activeOrganizationId],
	);

	const { data: invitationsData, isLoading: invitationsLoading } = useLiveQuery(
		(q) =>
			q
				.from({ invitations: collections.invitations })
				.leftJoin(
					{ inviters: collections.users },
					({ invitations, inviters }) => eq(invitations.inviterId, inviters.id),
				)
				.where(({ invitations }) =>
					eq(invitations.organizationId, activeOrganizationId ?? ""),
				)
				.where(({ invitations }) => eq(invitations.status, "pending"))
				.select(({ invitations, inviters }) => ({
					...invitations,
					inviterName: inviters?.name ?? "Unknown",
				}))
				.orderBy(({ invitations }) => invitations.createdAt, "desc"),
		[collections, activeOrganizationId],
	);

	// Sort by role priority (owner > admin > member), then by join date
	// Cast roles to OrganizationRole since database stores them as strings
	const members: TeamMember[] = (membersData ?? [])
		.map((m) => ({
			...m,
			role: m.role as OrganizationRole,
		}))
		.sort((a, b) => {
			const priorityDiff =
				getRoleSortPriority(a.role) - getRoleSortPriority(b.role);
			if (priorityDiff !== 0) return priorityDiff;
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		});

	const invitations: InvitationRow[] = invitationsData ?? [];
	const ownerCount = members.filter((m) => m.role === "owner").length;

	const currentUserId = session?.user?.id;
	const currentMember = activeOrg?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const currentUserRole = currentMember?.role as OrganizationRole;

	// Combine members and invitations into unified rows
	const tableRows: TableRow[] = [
		// Pending invitations first
		...invitations.map((invitation) => ({
			type: "invitation" as const,
			...invitation,
		})),
		// Then members
		...members.map((member) => ({
			type: "member" as const,
			...member,
		})),
	];

	const isLoading = membersLoading || invitationsLoading;

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8 border-b">
				<div className="max-w-5xl">
					<h2 className="text-2xl font-semibold">Organization</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Manage members and invitations in your organization
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8">
					<div className="max-w-5xl space-y-4">
						<div className="flex justify-end">
							<InviteMemberButton />
						</div>

						{isLoading ? (
							<div className="space-y-2 border rounded-lg">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<Skeleton className="h-8 w-8 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-3 w-32" />
										</div>
										<Skeleton className="h-4 w-16" />
										<Skeleton className="h-4 w-20" />
									</div>
								))}
							</div>
						) : tableRows.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								No members yet
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Joined</TableHead>
											<TableHead className="w-[50px]" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{tableRows.map((row) => {
											if (row.type === "invitation") {
												const isExpired = new Date() > new Date(row.expiresAt);

												return (
													<TableRow key={row.id} className="opacity-60">
														<TableCell>
															<span className="text-sm italic text-muted-foreground">
																{row.email}
															</span>
														</TableCell>
														<TableCell className="text-muted-foreground">
															{row.email}
														</TableCell>
														<TableCell>
															<Badge variant="secondary" className="text-xs capitalize">
																{row.role}
															</Badge>
														</TableCell>
														<TableCell>
															<Badge variant={isExpired ? "outline" : "default"} className="text-xs">
																{isExpired ? "Expired" : "Pending"}
															</Badge>
														</TableCell>
														<TableCell className="text-muted-foreground text-sm">
															{formatDate(row.createdAt)}
														</TableCell>
														<TableCell>
															<InvitationActions
																invitation={row}
																organizationId={row.organizationId}
															/>
														</TableCell>
													</TableRow>
												);
											}

											// Member row
											const isCurrentUserRow = row.userId === currentUserId;

											return (
												<TableRow key={row.memberId}>
													<TableCell>
														<div className="flex items-center gap-3">
															<Avatar
																size="md"
																fullName={row.name}
																image={row.image}
															/>
															<div className="flex items-center gap-2">
																<span className="font-medium">
																	{row.name || "Unknown"}
																</span>
																{isCurrentUserRow && (
																	<Badge variant="secondary" className="text-xs">
																		You
																	</Badge>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{row.email}
													</TableCell>
													<TableCell>
														<Badge
															variant={row.role === "owner" ? "default" : "outline"}
															className="text-xs capitalize"
														>
															{row.role}
														</Badge>
													</TableCell>
													<TableCell />
													<TableCell className="text-muted-foreground">
														{formatDate(row.createdAt)}
													</TableCell>
													<TableCell>
														<MemberActions
															member={row}
															currentUserRole={currentUserRole}
															ownerCount={ownerCount}
															isCurrentUser={isCurrentUserRow}
															canRemove={canRemoveMember(
																currentUserRole,
																row.role,
																isCurrentUserRow,
																ownerCount,
															)}
														/>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
```

## Files to Modify

### 10. `packages/db/src/schema/auth.ts`

Add after line 150 (after invitations table definition):
```typescript
export type SelectInvitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;
```

### 11. `packages/shared/src/auth/authorization/authorization.ts`

Add invitation functions at the end:
```typescript
/**
 * Get roles that an actor can invite new users as.
 *
 * Rules:
 * - Members cannot invite anyone
 * - Admins and owners can invite roles up to their own level
 *
 * @param actorRole - Role of the user performing the invitation
 * @returns Array of roles the actor can invite
 */
export function getInvitableRoles(actorRole: OrganizationRole): OrganizationRole[] {
  if (actorRole === "member") return [];

  const actorLevel = getRoleLevel(actorRole);
  return ROLE_HIERARCHY.filter((role) => getRoleLevel(role) <= actorLevel);
}

/**
 * Check if an actor can invite a user with a specific role.
 *
 * @param actorRole - Role of the user performing the invitation
 * @param inviteRole - Role to invite the new user as
 * @returns Whether the actor can invite with this role
 */
export function canInvite(
  actorRole: OrganizationRole,
  inviteRole: OrganizationRole,
): boolean {
  return getInvitableRoles(actorRole).includes(inviteRole);
}
```

### 12. `packages/shared/src/auth/authorization/authorization.test.ts`

Add tests at the end:
```typescript
describe("getInvitableRoles", () => {
  test("admin can invite members and admins", () => {
    const roles = getInvitableRoles("admin");
    expect(roles).toEqual(["member", "admin"]);
  });

  test("owner can invite all roles", () => {
    const roles = getInvitableRoles("owner");
    expect(roles).toEqual(["member", "admin", "owner"]);
  });

  test("member cannot invite anyone", () => {
    expect(getInvitableRoles("member")).toEqual([]);
  });
});

describe("canInvite", () => {
  test("admin can invite admin", () => {
    expect(canInvite("admin", "admin")).toBe(true);
  });

  test("admin cannot invite owner", () => {
    expect(canInvite("admin", "owner")).toBe(false);
  });

  test("member cannot invite anyone", () => {
    expect(canInvite("member", "member")).toBe(false);
    expect(canInvite("member", "admin")).toBe(false);
  });
});
```

### 13. `packages/auth/src/server.ts`

Add imports at top:
```typescript
import { OrganizationInvitationEmail } from "@superset/email/emails/organization-invitation";
import { resend } from "@superset/email/lib/resend";
import { canInvite, type OrganizationRole } from "@superset/shared/auth";
import { and } from "drizzle-orm";
import { invitationRateLimit } from "./lib/rate-limit";
```

Replace organization plugin (around line 99):
```typescript
plugins: [
  organization({
    creatorRole: "owner",
    invitationExpiresIn: 60 * 60 * 48, // 48 hours
    sendInvitationEmail: async (data) => {
      const inviteLink = `${env.NEXT_PUBLIC_WEB_URL}/accept-invitation/${data.id}`;

      await resend.emails.send({
        from: "Superset <noreply@superset.sh>",
        to: data.email,
        subject: `${data.inviter.user.name} invited you to join ${data.organization.name}`,
        react: OrganizationInvitationEmail({
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          inviteLink,
          role: data.role,
        }),
      });
    },
    organizationHooks: {
      beforeCreateInvitation: async ({ inviterId, organizationId, role }) => {
        // Rate limiting: 10 invitations per hour per user
        const { success } = await invitationRateLimit.limit(inviterId);
        if (!success) {
          throw new Error("Rate limit exceeded. Max 10 invitations per hour.");
        }

        const inviterMember = await db.query.members.findFirst({
          where: and(
            eq(members.userId, inviterId),
            eq(members.organizationId, organizationId),
          ),
        });

        if (!inviterMember) {
          throw new Error("Not a member of this organization");
        }

        if (!canInvite(inviterMember.role as OrganizationRole, role as OrganizationRole)) {
          throw new Error("Cannot invite users with this role");
        }
      },
    },
  }),
  bearer(),
],
```

### 14. `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`

Add import at top with other imports:
```typescript
import type {
  SelectMember,
  SelectOrganization,
  SelectRepository,
  SelectTask,
  SelectTaskStatus,
  SelectUser,
  SelectInvitation,
} from "@superset/db/schema";
```

Update `OrgCollections` interface (around line 22):
```typescript
interface OrgCollections {
  tasks: Collection<SelectTask>;
  taskStatuses: Collection<SelectTaskStatus>;
  repositories: Collection<SelectRepository>;
  members: Collection<SelectMember>;
  users: Collection<SelectUser>;
  invitations: Collection<SelectInvitation>;
}
```

Add invitations collection in `createOrgCollections` function (after users collection, around line 179):
```typescript
const invitations = createCollection(
  electricCollectionOptions<SelectInvitation>({
    id: `invitations-${organizationId}`,
    shapeOptions: {
      url: electricUrl,
      params: {
        table: "auth.invitations",
        organizationId,
      },
      headers,
      columnMapper,
    },
    getKey: (item) => item.id,
  }),
);
```

Update return statement (around line 181):
```typescript
return { tasks, taskStatuses, repositories, members, users, invitations };
```

### 15. `packages/email/package.json`

Add to dependencies:
```json
"dependencies": {
  "@react-email/components": "1.0.1",
  "@react-email/tailwind": "2.0.3",
  "@t3-oss/env-core": "^0.13.8",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "zod": "^4.3.5",
  "resend": "^4.0.1"
}
```

### 16. `packages/auth/package.json`

Add to dependencies:
```json
"dependencies": {
  "@superset/email": "workspace:*",
  "@upstash/ratelimit": "^2.0.4",
  "@upstash/redis": "^1.34.3"
}
```

### 17. `.env` and `.env.example`

Add to both files (after Upstash section around line 123):
```bash
# -----------------------------------------------------------------------------
# Resend (Email)
# -----------------------------------------------------------------------------
RESEND_API_KEY=
```

## Installation Steps

1. Install dependencies:
```bash
bun install
```

2. Set up Resend API key in `.env`:
   - Get API key from https://resend.com
   - Verify sender domain `noreply@superset.sh`

## Acceptance Tests

**Unified Table:**
- [ ] Pending invitations appear at top of table with lighter styling (opacity-60)
- [ ] Invitations show email in Name column (no avatar, italic, grayed)
- [ ] Invitations show "Pending" or "Expired" badge in Status column
- [ ] Members have empty Status column (no badge for active members)
- [ ] Invitations show date in "Joined" column
- [ ] Members show date in "Joined" column

**As admin:**
- [ ] Button enabled, role dropdown shows Member/Admin only
- [ ] Send invitation → success toast, email sent, appears at top of unified table
- [ ] Can cancel pending invitation via dropdown menu

**As owner:**
- [ ] Role dropdown shows Member/Admin/Owner
- [ ] Can resend expired invitations (shows Resend option in dropdown)

**As member:**
- [ ] Button disabled with tooltip "Members cannot invite others"

**Email:**
- [ ] Invitation email received with correct organization name, inviter name, role
- [ ] Accept invitation link works and creates member

**Backend:**
- [ ] Admin inviting owner → Error
- [ ] Member inviting → Error
- [ ] Rate limit: 11th invitation within 1 hour → Error

**Tests:**
- [ ] `bun test packages/shared/src/auth/authorization/authorization.test.ts`
