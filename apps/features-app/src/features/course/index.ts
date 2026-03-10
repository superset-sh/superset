/**
 * Course Feature - Client
 */

// Routes
export {
  COURSE_PATH,
  MY_COURSES_PATH,
  COURSE_LEARN_PATH,
  createCourseRoutes,
  createCourseAuthRoutes,
  createCourseListRoute,
  createCourseDetailRoute,
  createMyCoursesRoute,
  createCourseLearnRoute,
} from "./routes";

// UI - Pages
export { CourseList, CourseDetail, MyCourses, CourseLearn } from "./pages";

// Hooks
export {
  useCourseList,
  useCourseBySlug,
  useCourseCurriculum,
  useTopicList,
  useIsEnrolled,
  useMyCourses,
  useCourseProgress,
  useEnroll,
  useCancelEnrollment,
  useUpdateProgress,
  useToggleLessonComplete,
  useLessonWithVideo,
  useProgressTracker,
} from "./hooks";
