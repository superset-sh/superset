import type {
  Course,
  CourseTopic,
  CourseSection,
  CourseLesson,
  CourseEnrollment,
  CourseAttachment,
} from "@superbuilder/drizzle";

// ============================================================================
// Topic Types
// ============================================================================

export interface CreateTopicInput {
  name: string;
  slug?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface UpdateTopicInput {
  name?: string;
  slug?: string;
  description?: string;
  thumbnailUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ReorderInput {
  id: string;
  sortOrder: number;
}

// ============================================================================
// Course Types
// ============================================================================

export interface CreateCourseInput {
  topicId: string;
  title: string;
  summary?: string;
  content?: unknown;
  thumbnailUrl?: string;
  estimatedMinutes?: number;
}

export interface UpdateCourseInput {
  topicId?: string;
  title?: string;
  slug?: string;
  summary?: string | null;
  content?: unknown;
  thumbnailUrl?: string | null;
  estimatedMinutes?: number | null;
  sortOrder?: number;
}

export interface CourseWithTopic extends Course {
  topic: Pick<CourseTopic, "id" | "name" | "slug">;
  enrollmentCount?: number;
}

export interface CourseDetail extends CourseWithTopic {
  sections: SectionWithLessons[];
  attachments: CourseAttachment[];
  enrollmentCount: number;
  averageProgress?: number;
}

// ============================================================================
// Section/Lesson Types
// ============================================================================

export interface CreateSectionInput {
  courseId: string;
  title: string;
  description?: string;
}

export interface UpdateSectionInput {
  title?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface CreateLessonInput {
  sectionId: string;
  title: string;
  description?: string;
  isFree?: boolean;
}

export interface UpdateLessonInput {
  title?: string;
  description?: string | null;
  sortOrder?: number;
  isFree?: boolean;
}

export interface SetVideoInput {
  videoFileId: string;
  videoDurationSeconds: number;
}

export interface LessonWithVideo extends CourseLesson {
  videoUrl?: string | null;
}

export interface SectionWithLessons extends CourseSection {
  lessons: LessonWithVideo[];
}

// ============================================================================
// Enrollment Types
// ============================================================================

export interface EnrollmentWithProgress extends CourseEnrollment {
  profile: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  progressPercent: number;
  lastActivityAt: Date | null;
}

export interface MyCourseWithProgress {
  course: CourseWithTopic;
  enrollment: CourseEnrollment;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
}

// ============================================================================
// Progress Types
// ============================================================================

export interface UpdateProgressInput {
  lessonId: string;
  currentPosition: number;
  totalDuration: number;
}

export interface CourseProgressDetail {
  courseProgress: {
    completedLessons: number;
    totalLessons: number;
    percent: number;
  };
  sections: Array<{
    id: string;
    title: string;
    completedLessons: number;
    totalLessons: number;
    percent: number;
    lessons: Array<{
      id: string;
      title: string;
      progressPercent: number;
      isCompleted: boolean;
      lastPosition: number;
    }>;
  }>;
}

// ============================================================================
// Pagination
// ============================================================================

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
