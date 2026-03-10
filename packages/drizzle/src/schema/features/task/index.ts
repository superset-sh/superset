import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { baseColumns, baseColumnsWithSoftDelete } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
  "duplicate",
]);

export const taskProjectStatusEnum = pgEnum("task_project_status", [
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
]);

export const taskCycleStatusEnum = pgEnum("task_cycle_status", [
  "active",
  "completed",
]);

export const taskActivityActionEnum = pgEnum("task_activity_action", [
  "created",
  "status_changed",
  "priority_changed",
  "assigned",
  "unassigned",
  "label_added",
  "label_removed",
  "project_changed",
  "cycle_changed",
  "estimate_changed",
  "due_date_changed",
  "title_changed",
  "description_changed",
  "parent_changed",
  "commented",
]);

// ============================================================================
// Constants
// ============================================================================

export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskStatusCategory = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export const STATUS_CATEGORY_MAP: Record<TaskStatus, TaskStatusCategory> = {
  backlog: "backlog",
  todo: "unstarted",
  in_progress: "started",
  in_review: "started",
  done: "completed",
  canceled: "canceled",
  duplicate: "canceled",
};

export const STATUS_DISPLAY_ORDER: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
  "duplicate",
];

export const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

// ============================================================================
// Tables
// ============================================================================

export const taskProjects = pgTable("task_projects", {
  ...baseColumnsWithSoftDelete(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).unique().notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 7 }),
  status: taskProjectStatusEnum("status").default("planned").notNull(),
  startDate: date("start_date"),
  targetDate: date("target_date"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

export const taskCycles = pgTable("task_cycles", {
  ...baseColumns(),
  name: varchar("name", { length: 200 }),
  number: serial("number"),
  status: taskCycleStatusEnum("status").default("active").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

export const taskLabels = pgTable("task_labels", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  description: text("description"),
});

export const taskTasks = pgTable(
  "task_tasks",
  {
    ...baseColumnsWithSoftDelete(),
    identifier: varchar("identifier", { length: 20 }).unique().notNull(),
    number: serial("number"),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: taskStatusEnum("status").default("backlog").notNull(),
    priority: integer("priority").default(0).notNull(),
    assigneeId: uuid("assignee_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => taskProjects.id, {
      onDelete: "set null",
    }),
    cycleId: uuid("cycle_id").references(() => taskCycles.id, {
      onDelete: "set null",
    }),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => taskTasks.id,
      { onDelete: "set null" },
    ),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimate: integer("estimate"),
    sortOrder: real("sort_order").default(0).notNull(),
  },
  (table) => [
    index("idx_task_tasks_status").on(table.status),
    index("idx_task_tasks_assignee").on(table.assigneeId),
    index("idx_task_tasks_project").on(table.projectId),
    index("idx_task_tasks_cycle").on(table.cycleId),
    index("idx_task_tasks_parent").on(table.parentId),
    index("idx_task_tasks_created_at").on(table.createdAt),
  ],
);

export const taskTaskLabels = pgTable(
  "task_task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskTasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => taskLabels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.labelId] })],
);

export const taskComments = pgTable(
  "task_comments",
  {
    ...baseColumnsWithSoftDelete(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskTasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
  },
  (table) => [index("idx_task_comments_task").on(table.taskId)],
);

export const taskActivities = pgTable(
  "task_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskTasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    action: taskActivityActionEnum("action").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_task_activities_task").on(table.taskId),
    index("idx_task_activities_created_at").on(table.createdAt),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const taskProjectsRelations = relations(taskProjects, ({ one, many }) => ({
  createdBy: one(profiles, { fields: [taskProjects.createdById], references: [profiles.id] }),
  tasks: many(taskTasks),
}));

export const taskCyclesRelations = relations(taskCycles, ({ one, many }) => ({
  createdBy: one(profiles, { fields: [taskCycles.createdById], references: [profiles.id] }),
  tasks: many(taskTasks),
}));

export const taskTasksRelations = relations(taskTasks, ({ one, many }) => ({
  assignee: one(profiles, {
    fields: [taskTasks.assigneeId],
    references: [profiles.id],
    relationName: "taskAssignee",
  }),
  createdBy: one(profiles, {
    fields: [taskTasks.createdById],
    references: [profiles.id],
    relationName: "taskCreator",
  }),
  project: one(taskProjects, {
    fields: [taskTasks.projectId],
    references: [taskProjects.id],
  }),
  cycle: one(taskCycles, {
    fields: [taskTasks.cycleId],
    references: [taskCycles.id],
  }),
  parent: one(taskTasks, {
    fields: [taskTasks.parentId],
    references: [taskTasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(taskTasks, { relationName: "subtasks" }),
  taskLabels: many(taskTaskLabels),
  comments: many(taskComments),
  activities: many(taskActivities),
}));

export const taskTaskLabelsRelations = relations(taskTaskLabels, ({ one }) => ({
  task: one(taskTasks, { fields: [taskTaskLabels.taskId], references: [taskTasks.id] }),
  label: one(taskLabels, { fields: [taskTaskLabels.labelId], references: [taskLabels.id] }),
}));

export const taskLabelsRelations = relations(taskLabels, ({ many }) => ({
  taskLabels: many(taskTaskLabels),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(taskTasks, { fields: [taskComments.taskId], references: [taskTasks.id] }),
  author: one(profiles, { fields: [taskComments.authorId], references: [profiles.id] }),
}));

export const taskActivitiesRelations = relations(taskActivities, ({ one }) => ({
  task: one(taskTasks, { fields: [taskActivities.taskId], references: [taskTasks.id] }),
  actor: one(profiles, { fields: [taskActivities.actorId], references: [profiles.id] }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type TaskProject = typeof taskProjects.$inferSelect;
export type NewTaskProject = typeof taskProjects.$inferInsert;
export type TaskCycle = typeof taskCycles.$inferSelect;
export type NewTaskCycle = typeof taskCycles.$inferInsert;
export type TaskLabel = typeof taskLabels.$inferSelect;
export type NewTaskLabel = typeof taskLabels.$inferInsert;
export type TaskTask = typeof taskTasks.$inferSelect;
export type NewTaskTask = typeof taskTasks.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
export type TaskActivity = typeof taskActivities.$inferSelect;
export type NewTaskActivity = typeof taskActivities.$inferInsert;
