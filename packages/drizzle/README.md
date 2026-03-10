# @superbuilder/drizzle

Drizzle ORM 유틸리티 패키지 - 스키마 작성을 위한 공통 헬퍼

## 설치

```bash
pnpm add @superbuilder/drizzle
```

## 사용법

### 공통 컬럼 헬퍼

```typescript
import { baseColumns, softDelete } from "@superbuilder/drizzle/utils";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  ...baseColumns(), // id, createdAt, updatedAt
  ...softDelete(), // deletedAt, isDeleted

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
});
```

### 개별 헬퍼 사용

```typescript
import { id, timestamps } from "@superbuilder/drizzle/utils";

export const categories = pgTable("categories", {
  id: id(),
  ...timestamps(),

  name: varchar("name", { length: 100 }).notNull(),
});
```

### 타입 유틸리티

```typescript
import type { InsertModel, SelectModel, UpdateModel } from "@superbuilder/drizzle/utils";
import { posts } from "./schema";

type Post = SelectModel<typeof posts>;
type NewPost = InsertModel<typeof posts>;
type UpdatePost = UpdateModel<typeof posts>;
```

## API

### 컬럼 헬퍼

| 함수                          | 설명            | 생성되는 컬럼                  |
| ----------------------------- | --------------- | ------------------------------ |
| `id()`                        | UUID 기본키     | `id`                           |
| `timestamps()`                | 생성/수정 시간  | `createdAt`, `updatedAt`       |
| `softDelete()`                | 소프트 삭제     | `deletedAt`, `isDeleted`       |
| `baseColumns()`               | id + timestamps | `id`, `createdAt`, `updatedAt` |
| `baseColumnsWithSoftDelete()` | 전체 조합       | 위 전체                        |

### 타입 유틸리티

| 타입             | 설명                                                  |
| ---------------- | ----------------------------------------------------- |
| `SelectModel<T>` | 테이블에서 Select 결과 타입 추출                      |
| `InsertModel<T>` | 테이블에서 Insert 입력 타입 추출                      |
| `UpdateModel<T>` | 테이블에서 Update 입력 타입 추출 (모든 필드 optional) |
