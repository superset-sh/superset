/**
 * 공통 테스트 상수.
 * Feature-specific 데이터는 각 spec 파일 내부에 정의합니다.
 */

/** 고정 QA 테스트 계정 */
export const TEST_USER = {
  id: '2b6527ac-c020-47b3-bcf3-33cb8e43bd7c',
  email: 'qa@test.com',
  name: 'QA Tester',
};

/** Admin 테스트 계정 */
export const TEST_ADMIN = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'admin@tester.com',
  name: 'Admin Tester',
  role: 'admin' as const,
};

/** Owner 테스트 계정 */
export const TEST_OWNER = {
  id: 'f0e1d2c3-b4a5-6789-0fed-cba987654321',
  email: 'owner@tester.com',
  name: 'Owner Tester',
  role: 'owner' as const,
};

/** 공통 UUID 목록 (테스트 데이터 생성 시 사용) */
export const TEST_IDS = {
  UUID_1: '123e4567-e89b-12d3-a456-426614174000',
  UUID_2: '223e4567-e89b-12d3-a456-426614174001',
  UUID_3: '323e4567-e89b-12d3-a456-426614174002',
  UUID_4: '423e4567-e89b-12d3-a456-426614174003',
  UUID_5: '523e4567-e89b-12d3-a456-426614174004',
};

/** 공통 날짜 (고정 날짜로 테스트 결정성 보장) */
export const TEST_DATES = {
  CREATED: new Date('2026-01-01T00:00:00.000Z'),
  UPDATED: new Date('2026-01-15T00:00:00.000Z'),
  NOW: new Date('2026-02-01T00:00:00.000Z'),
};
