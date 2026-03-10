import { pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";

export const profileWithdrawalReasonTypeEnum = pgEnum("profile_withdrawal_reason_type", [
  "no_longer_use", "lack_features", "difficult_to_use",
  "too_expensive", "found_alternative", "other",
]);

export const profileWithdrawalReasons = pgTable("profile_withdrawal_reasons", {
  ...baseColumns(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  reasonType: profileWithdrawalReasonTypeEnum("reason_type").notNull(),
  reasonDetail: text("reason_detail"),
});

export type ProfileWithdrawalReason = typeof profileWithdrawalReasons.$inferSelect;
export type NewProfileWithdrawalReason = typeof profileWithdrawalReasons.$inferInsert;
