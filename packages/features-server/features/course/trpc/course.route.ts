/**
 * Course tRPC Router
 */
import {
  adminProcedure,
  authProcedure,
  createServiceContainer,
  getAuthUserId,
  publicProcedure,
  router,
} from "../../../core/trpc";
import { z } from "zod";
import type { AttachmentService } from "../service/attachment.service";
import type { CourseService } from "../service/course.service";
import type { EnrollmentService } from "../service/enrollment.service";
import type { LessonService } from "../service/lesson.service";
import type { SectionService } from "../service/section.service";
import type { TopicService } from "../service/topic.service";

// Zod schemas
const reorderSchema = z.array(
  z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) }),
);

const paginationSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// Service container
const services = createServiceContainer<{
  topicService: TopicService;
  courseService: CourseService;
  sectionService: SectionService;
  lessonService: LessonService;
  enrollmentService: EnrollmentService;
  attachmentService: AttachmentService;
}>();

export const injectCourseServices = services.inject;

// ============================================================================
// Topic Router
// ============================================================================

const topicRouter = router({
  list: publicProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return services.get().topicService.findAll(input?.includeInactive ?? false);
    }),

  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return services.get().topicService.findById(input.id);
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().max(100).optional(),
        description: z.string().optional(),
        thumbnailUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().topicService.create(input);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          name: z.string().min(1).max(100).optional(),
          slug: z.string().max(100).optional(),
          description: z.string().optional(),
          thumbnailUrl: z.string().url().nullable().optional(),
          sortOrder: z.number().int().min(0).optional(),
          isActive: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().topicService.update(input.id, input.data);
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    return services.get().topicService.delete(input.id);
  }),

  reorder: adminProcedure.input(reorderSchema).mutation(async ({ input }) => {
    return services.get().topicService.reorder(input);
  }),
});

// ============================================================================
// Section Router
// ============================================================================

const sectionRouter = router({
  list: publicProcedure.input(z.object({ courseId: z.string().uuid() })).query(async ({ input }) => {
    return services.get().sectionService.findByCourseId(input.courseId);
  }),

  create: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().sectionService.create(input);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(500).nullable().optional(),
          sortOrder: z.number().int().min(0).optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().sectionService.update(input.id, input.data);
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const result = await services.get().sectionService.delete(input.id);
    await services.get().courseService.updateTotalLessons(result.courseId);
    return { success: true };
  }),

  reorder: adminProcedure.input(reorderSchema).mutation(async ({ input }) => {
    return services.get().sectionService.reorder(input);
  }),
});

// ============================================================================
// Lesson Router
// ============================================================================

const lessonRouter = router({
  byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return services.get().lessonService.findById(input.id);
  }),

  withVideo: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return services.get().lessonService.findByIdWithVideo(input.id);
  }),

  create: adminProcedure
    .input(
      z.object({
        sectionId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
        isFree: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const lesson = await services.get().lessonService.create(input);
      const courseId = await services.get().lessonService.getCourseIdByLessonId(lesson.id);
      await services.get().courseService.updateTotalLessons(courseId);
      return lesson;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(500).nullable().optional(),
          sortOrder: z.number().int().min(0).optional(),
          isFree: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().lessonService.update(input.id, input.data);
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const result = await services.get().lessonService.delete(input.id);
    await services.get().courseService.updateTotalLessons(result.courseId);
    return { success: true };
  }),

  setVideo: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        videoFileId: z.string().uuid(),
        videoDurationSeconds: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().lessonService.setVideo(input.id, {
        videoFileId: input.videoFileId,
        videoDurationSeconds: input.videoDurationSeconds,
      });
    }),

  removeVideo: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().lessonService.removeVideo(input.id);
    }),

  reorder: adminProcedure.input(reorderSchema).mutation(async ({ input }) => {
    return services.get().lessonService.reorder(input);
  }),
});

// ============================================================================
// Enrollment Router
// ============================================================================

const enrollmentRouter = router({
  enroll: authProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().enrollmentService.enroll(input.courseId, userId);
    }),

  cancel: authProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().enrollmentService.cancel(input.courseId, userId);
    }),

  isEnrolled: authProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().enrollmentService.isEnrolled(input.courseId, userId);
    }),

  myCourses: authProcedure.query(async ({ ctx }) => {
    const userId = getAuthUserId(ctx);
    return services.get().enrollmentService.myCourses(userId);
  }),

  adminList: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        ...paginationSchema.shape,
      }),
    )
    .query(async ({ input }) => {
      const { courseId, ...pagination } = input;
      return services.get().enrollmentService.adminList(courseId, pagination);
    }),

  toggleLessonComplete: authProcedure
    .input(
      z.object({
        lessonId: z.string().uuid(),
        completed: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services
        .get()
        .enrollmentService.toggleLessonComplete(input.lessonId, userId, input.completed);
    }),

  updateProgress: authProcedure
    .input(
      z.object({
        lessonId: z.string().uuid(),
        currentPosition: z.number().int().min(0),
        totalDuration: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      await services.get().enrollmentService.updateProgress(input, userId);
      return { success: true };
    }),

  courseProgress: authProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().enrollmentService.getCourseProgress(input.courseId, userId);
    }),
});

// ============================================================================
// Attachment Router
// ============================================================================

const attachmentRouter = router({
  list: publicProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.get().attachmentService.findByCourseId(input.courseId);
    }),

  create: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        fileId: z.string().uuid().optional(),
        url: z.string().url().optional(),
        fileType: z.string().max(50).optional(),
        title: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().attachmentService.create(input);
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    return services.get().attachmentService.delete(input.id);
  }),

  reorder: adminProcedure.input(reorderSchema).mutation(async ({ input }) => {
    return services.get().attachmentService.reorder(input);
  }),
});

// ============================================================================
// Main Course Router
// ============================================================================

export const courseRouter = router({
  // Course CRUD
  list: publicProcedure
    .input(
      z
        .object({
          ...paginationSchema.shape,
          topicId: z.string().uuid().optional(),
          sort: z.enum(["order", "latest"]).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return services.get().courseService.findPublished(input ?? {});
    }),

  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    return services.get().courseService.findBySlug(input.slug);
  }),

  adminById: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return services.get().courseService.findById(input.id);
  }),

  adminList: adminProcedure
    .input(
      z
        .object({
          ...paginationSchema.shape,
          status: z.enum(["draft", "published"]).optional(),
          topicId: z.string().uuid().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return services.get().courseService.adminList(input ?? {});
    }),

  create: adminProcedure
    .input(
      z.object({
        topicId: z.string().uuid(),
        title: z.string().min(1).max(200),
        summary: z.string().optional(),
        content: z.any().optional(),
        thumbnailUrl: z.string().url().optional(),
        estimatedMinutes: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().courseService.create(input, userId);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z.object({
          topicId: z.string().uuid().optional(),
          title: z.string().min(1).max(200).optional(),
          slug: z.string().max(200).optional(),
          summary: z.string().nullable().optional(),
          content: z.any().optional(),
          thumbnailUrl: z.string().url().nullable().optional(),
          estimatedMinutes: z.number().int().positive().nullable().optional(),
          sortOrder: z.number().int().min(0).optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      return services.get().courseService.update(input.id, input.data);
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    return services.get().courseService.delete(input.id);
  }),

  publish: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    return services.get().courseService.publish(input.id);
  }),

  unpublish: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return services.get().courseService.unpublish(input.id);
    }),

  // Nested routers
  topic: topicRouter,
  section: sectionRouter,
  lesson: lessonRouter,
  enrollment: enrollmentRouter,
  attachment: attachmentRouter,
});

export type CourseRouter = typeof courseRouter;
