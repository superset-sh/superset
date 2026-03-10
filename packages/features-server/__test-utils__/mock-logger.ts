/**
 * @/core/logger mock factory.
 *
 * 사용법:
 * jest.mock("../core/logger", () => LOGGER_MOCK);
 */

export function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * jest.mock("../core/logger", () => LOGGER_MOCK) 에서 사용할 객체.
 * createLogger()를 호출하면 mock logger를 반환합니다.
 */
export const LOGGER_MOCK = {
  createLogger: () => createMockLogger(),
};
