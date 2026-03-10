/**
 * @superbuilder/drizzle
 *
 * Drizzle ORM 유틸리티 패키지
 * - 공통 컬럼 헬퍼 (baseColumns, timestamps, softDelete)
 * - 타입 유틸리티
 * - NestJS Database 모듈
 */

export * from "./utils";

// NestJS 모듈은 별도 export path 사용 권장:
// import { DatabaseModule, DRIZZLE } from "@superbuilder/drizzle/module"
// 하지만 하위 호환성을 위해 여기서도 export
export * from "./database.module";
export * from "./drizzle.decorator";
export * from "./schema-registry";

// Re-export all feature schemas
export * from "./schema/index";
