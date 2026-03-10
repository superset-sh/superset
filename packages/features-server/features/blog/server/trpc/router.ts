import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../../../../core/trpc";
import { BlogService } from "../service";
import { createBlogPostSchema, updateBlogPostSchema, clapPostSchema, createResponseSchema } from "../../dto";

let blogService: BlogService;
export const setBlogService = (service: BlogService) => {
    blogService = service;
};

export const blogRouter = router({
    getPosts: publicProcedure
        .input(z.object({
            cursor: z.string().optional(),
            limit: z.number().min(1).max(50).optional(),
            authorId: z.string().uuid().optional(),
        }).optional())
        .query(async ({ input }) => {
            return blogService.getPosts(input);
        }),

    getPostBySlug: publicProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            const viewerId = ctx.user?.id;
            return blogService.getPostBySlug(input, viewerId);
        }),

    createPost: protectedProcedure
        .input(createBlogPostSchema)
        .mutation(async ({ input, ctx }) => {
            return blogService.createPost(ctx.user.id, input);
        }),

    updatePost: protectedProcedure
        .input(z.object({ id: z.string().uuid(), data: updateBlogPostSchema }))
        .mutation(async ({ input, ctx }) => {
            return blogService.updatePost(ctx.user.id, input.id, input.data);
        }),

    deletePost: protectedProcedure
        .input(z.string().uuid())
        .mutation(async ({ input, ctx }) => {
            return blogService.deletePost(ctx.user.id, input);
        }),

    clap: protectedProcedure
        .input(clapPostSchema)
        .mutation(async ({ input, ctx }) => {
            return blogService.clapPost(ctx.user.id, input);
        }),

    createResponse: protectedProcedure
        .input(createResponseSchema)
        .mutation(async ({ input, ctx }) => {
            return blogService.createResponse(ctx.user.id, input);
        }),

    getResponses: publicProcedure
        .input(z.string().uuid())
        .query(async ({ input }) => {
            return blogService.getResponses(input);
        }),

    toggleBookmark: protectedProcedure
        .input(z.string().uuid())
        .mutation(async ({ input, ctx }) => {
            return blogService.toggleBookmark(ctx.user.id, input);
        }),
});

export type BlogRouter = typeof blogRouter;
