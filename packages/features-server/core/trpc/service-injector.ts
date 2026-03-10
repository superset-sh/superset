/**
 * Service Container for tRPC Router Dependency Injection
 *
 * tRPC 라우터는 모듈 import 시점에 생성되지만, NestJS 서비스는 DI 컨테이너
 * 초기화 후 주입됩니다. 이 헬퍼는 두 라이프사이클을 연결합니다.
 *
 * @example Multi-service
 * ```ts
 * const services = createServiceContainer<{
 *   boardService: BoardService;
 *   postService: PostService;
 * }>();
 *
 * export const boardRouter = router({
 *   list: publicProcedure.query(() => services.get().boardService.findAll()),
 * });
 * export const injectBoardServices = services.inject;
 * ```
 *
 * @example Single-service
 * ```ts
 * const { service: getProfileService, inject: injectProfileService } =
 *   createSingleServiceContainer<ProfileService>();
 *
 * export const profileRouter = router({
 *   me: protectedProcedure.query(({ ctx }) =>
 *     getProfileService().getProfile(ctx.user!.id)),
 * });
 * export { injectProfileService };
 * ```
 */

export function createServiceContainer<
  TServices extends Record<string, unknown>,
>() {
  let container: TServices | null = null;

  return {
    /** 서비스 컨테이너를 반환합니다. 주입 전 호출 시 에러를 던집니다. */
    get(): TServices {
      if (!container) {
        throw new Error(
          "Services not initialized. Ensure the module called inject() in onModuleInit().",
        );
      }
      return container;
    },

    /** Module의 onModuleInit()에서 호출하여 서비스를 주입합니다. */
    inject(services: TServices): void {
      container = services;
    },

    /** 서비스 주입 여부 확인 (테스트용) */
    isInitialized(): boolean {
      return container !== null;
    },

    /** 서비스 초기화 해제 (테스트용) */
    clear(): void {
      container = null;
    },
  };
}

export function createSingleServiceContainer<TService>() {
  const container = createServiceContainer<{ service: TService }>();

  return {
    /** 주입된 서비스를 반환합니다. */
    service: (): TService => container.get().service,

    /** Module의 onModuleInit()에서 호출하여 서비스를 주입합니다. */
    inject: (service: TService): void => container.inject({ service }),

    /** 서비스 주입 여부 확인 (테스트용) */
    isInitialized: (): boolean => container.isInitialized(),

    /** 서비스 초기화 해제 (테스트용) */
    clear: (): void => container.clear(),
  };
}
