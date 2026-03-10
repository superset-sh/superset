/**
 * drizzle-orm 함수 및 @superbuilder/drizzle 기본 mock 헬퍼.
 *
 * 전체 jest.mock() 블록 대신 상수를 spread하여 사용 가능.
 *
 * 사용법:
 * jest.mock("drizzle-orm", () => DRIZZLE_ORM_MOCK);
 *
 * jest.mock("@superbuilder/drizzle", () => ({
 *   ...DRIZZLE_BASE_MOCK,
 *   blogPosts: { id: { name: "id" }, ... },
 * }));
 */

/**
 * drizzle-orm 패키지의 주요 함수 mock.
 * Service에서 실제 사용하는 함수만 남겨도 됩니다.
 */
export const DRIZZLE_ORM_MOCK = {
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: 'and' })),
  or: jest.fn((...conditions: any[]) => ({ conditions, type: 'or' })),
  not: jest.fn((condition: any) => ({ condition, type: 'not' })),
  desc: jest.fn((field: any) => ({ field, type: 'desc' })),
  asc: jest.fn((field: any) => ({ field, type: 'asc' })),
  count: jest.fn(() => ({ type: 'count' })),
  sum: jest.fn((field: any) => ({ field, type: 'sum' })),
  sql: jest.fn((strings: any, ...values: any[]) => ({ strings, values, type: 'sql' })),
  isNull: jest.fn((field: any) => ({ field, type: 'isNull' })),
  isNotNull: jest.fn((field: any) => ({ field, type: 'isNotNull' })),
  like: jest.fn((field: any, pattern: any) => ({ field, pattern, type: 'like' })),
  ilike: jest.fn((field: any, pattern: any) => ({ field, pattern, type: 'ilike' })),
  inArray: jest.fn((field: any, values: any) => ({ field, values, type: 'inArray' })),
  notInArray: jest.fn((field: any, values: any) => ({ field, values, type: 'notInArray' })),
  between: jest.fn((field: any, min: any, max: any) => ({ field, min, max, type: 'between' })),
  gt: jest.fn((field: any, value: any) => ({ field, value, type: 'gt' })),
  gte: jest.fn((field: any, value: any) => ({ field, value, type: 'gte' })),
  lt: jest.fn((field: any, value: any) => ({ field, value, type: 'lt' })),
  lte: jest.fn((field: any, value: any) => ({ field, value, type: 'lte' })),
};

/**
 * @superbuilder/drizzle 패키지의 기본 mock (DRIZZLE token + InjectDrizzle).
 * 실제 테이블 mock은 spread하여 추가합니다.
 *
 * @example
 * jest.mock("@superbuilder/drizzle", () => {
 *   const { Inject } = jest.requireActual("@nestjs/common");
 *   return {
 *     ...DRIZZLE_BASE_MOCK_WITH_INJECT(Inject),
 *     blogPosts: { id: { name: "id" }, title: { name: "title" } },
 *   };
 * });
 */
export function DRIZZLE_BASE_MOCK_WITH_INJECT(Inject: any) {
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
  };
}

/**
 * 테이블 컬럼 mock을 간결하게 생성하는 헬퍼.
 *
 * @example
 * const blogPosts = createTableMock({
 *   id: "id",
 *   title: "title",
 *   authorId: "author_id",
 *   isPublished: "is_published",
 *   createdAt: "created_at",
 * });
 * // → { id: { name: "id" }, title: { name: "title" }, ... }
 */
export function createTableMock(columns: Record<string, string>) {
  const result: Record<string, { name: string }> = {};
  for (const [key, dbName] of Object.entries(columns)) {
    result[key] = { name: dbName };
  }
  return result;
}
