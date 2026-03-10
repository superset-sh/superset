/**
 * File Manager tRPC Router
 *
 * 파일 조회/삭제 프로시저 (업로드는 REST controller로 처리)
 */
import { z } from "zod";
import {
  router as createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  createSingleServiceContainer,
} from "../../core/trpc";
import { paginationSchema, idSchema } from "../../features/_common";
import type { FileService } from "./service/file.service";

// Service container (injected via NestJS onModuleInit)
const { service: getFileService, inject: injectFileService } =
  createSingleServiceContainer<FileService>();

export { injectFileService };

export const fileManagerRouter = createTRPCRouter({
  /**
   * 내 파일 목록 조회
   */
  list: protectedProcedure
    .input(paginationSchema)
    .query(async ({ ctx, input }) => {
      return getFileService().findByUser(ctx.user!.id, input);
    }),

  /**
   * ID로 파일 조회
   */
  byId: publicProcedure
    .input(idSchema)
    .query(async ({ input }) => {
      return getFileService().findById(input.id);
    }),

  /**
   * 내 파일 삭제
   */
  delete: protectedProcedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => {
      await getFileService().delete(input.id, ctx.user!.id);
      return { success: true };
    }),

  /**
   * 다운로드용 Signed URL 발급
   */
  signedUrl: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        expiresIn: z.number().min(60).max(86400).default(3600),
      }),
    )
    .query(async ({ ctx, input }) => {
      const url = await getFileService().getSignedUrl(input.id, ctx.user!.id);
      return { url, expiresIn: input.expiresIn };
    }),

  /**
   * Admin 프로시저
   */
  admin: createTRPCRouter({
    /**
     * 전체 파일 목록 조회 (관리자용)
     */
    list: adminProcedure
      .input(paginationSchema)
      .query(async ({ input }) => {
        return getFileService().findAll(input);
      }),

    /**
     * 관리자 파일 삭제 (권한 검사 없음)
     */
    delete: adminProcedure
      .input(idSchema)
      .mutation(async ({ input }) => {
        await getFileService().adminDelete(input.id);
        return { success: true };
      }),
  }),
});

export type FileManagerRouter = typeof fileManagerRouter;
