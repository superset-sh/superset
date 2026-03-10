/**
 * Course Feature - Client (Admin)
 */

// Routes
export {
  COURSE_ADMIN_PATH,
  COURSE_ADMIN_TOPICS_PATH,
  createCourseAdminRoutes,
  createCourseAdminRoute,
  createTopicAdminRoute,
  createCourseCreateRoute,
  createCourseDetailRoute,
} from "./routes";

// Pages
export {
  CourseAdmin,
  TopicManagement,
  CourseCreate,
  CourseDetail,
  CurriculumEditor,
  StudentList,
  AttachmentManager,
} from "./pages";

// Hooks
export {
  useTopics,
  useCreateTopic,
  useUpdateTopic,
  useDeleteTopic,
  useAdminCourseList,
  useAdminCourseById,
  useCreateCourse,
  useUpdateCourse,
  useDeleteCourse,
  usePublishCourse,
  useUnpublishCourse,
  useSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson,
  useStudentList,
  useAttachments,
  useCreateAttachment,
  useDeleteAttachment,
} from "./hooks";

// Types
export type * from "./types";
