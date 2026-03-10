import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

/**
 * 테이블에서 Select 타입 추출
 *
 * @example
 * type User = SelectModel<typeof users>;
 */
export type SelectModel<T extends PgTableWithColumns<any>> = InferSelectModel<T>;

/**
 * 테이블에서 Insert 타입 추출
 *
 * @example
 * type NewUser = InsertModel<typeof users>;
 */
export type InsertModel<T extends PgTableWithColumns<any>> = InferInsertModel<T>;

/**
 * 테이블에서 Update 타입 추출 (모든 필드 optional)
 *
 * @example
 * type UpdateUser = UpdateModel<typeof users>;
 */
export type UpdateModel<T extends PgTableWithColumns<any>> = Partial<InferInsertModel<T>>;
