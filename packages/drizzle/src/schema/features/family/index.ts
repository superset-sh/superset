/**
 * Family Feature Schema
 * 가족 그룹 관리 — 그룹, 멤버, 초대, 아이, 치료사 배정
 */
import {
  boolean,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const familyMemberRoleEnum = pgEnum("family_member_role", [
  "owner",
  "guardian",
  "therapist",
  "viewer",
]);

export const familyInvitationStatusEnum = pgEnum("family_invitation_status", [
  "pending",
  "accepted",
  "rejected",
  "expired",
]);

// ============================================================================
// Tables
// ============================================================================

export const familyGroups = pgTable("family_groups", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
});

export const familyMembers = pgTable(
  "family_members",
  {
    ...baseColumns(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: familyMemberRoleEnum("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_family_members_group_user").on(table.groupId, table.userId),
  ],
);

export const familyInvitations = pgTable("family_invitations", {
  ...baseColumns(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => familyGroups.id, { onDelete: "cascade" }),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  invitedEmail: text("invited_email").notNull(),
  role: familyMemberRoleEnum("role").notNull(),
  status: familyInvitationStatusEnum("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const familyChildren = pgTable("family_children", {
  ...baseColumns(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => familyGroups.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 50 }).notNull(),
  birthDate: date("birth_date").notNull(),
  gender: varchar("gender", { length: 10 }),
  notes: text("notes"),
  avatar: text("avatar"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

export const familyChildAssignments = pgTable(
  "family_child_assignments",
  {
    ...baseColumns(),
    childId: uuid("child_id")
      .notNull()
      .references(() => familyChildren.id, { onDelete: "cascade" }),
    therapistId: uuid("therapist_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("uq_family_child_assignments_child_therapist").on(
      table.childId,
      table.therapistId,
    ),
  ],
);

// ============================================================================
// Type Exports
// ============================================================================

export type FamilyGroup = typeof familyGroups.$inferSelect;
export type NewFamilyGroup = typeof familyGroups.$inferInsert;

export type FamilyMember = typeof familyMembers.$inferSelect;
export type NewFamilyMember = typeof familyMembers.$inferInsert;

export type FamilyInvitation = typeof familyInvitations.$inferSelect;
export type NewFamilyInvitation = typeof familyInvitations.$inferInsert;

export type FamilyChild = typeof familyChildren.$inferSelect;
export type NewFamilyChild = typeof familyChildren.$inferInsert;

export type FamilyChildAssignment = typeof familyChildAssignments.$inferSelect;
export type NewFamilyChildAssignment =
  typeof familyChildAssignments.$inferInsert;
