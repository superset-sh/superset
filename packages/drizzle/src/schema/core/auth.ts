import { pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

const authSchema = pgSchema("auth");

export const users = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
