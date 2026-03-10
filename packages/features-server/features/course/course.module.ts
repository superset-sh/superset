import { Module, OnModuleInit } from "@nestjs/common";
import {
  TopicService,
  CourseService,
  SectionService,
  LessonService,
  EnrollmentService,
  AttachmentService,
} from "./service";
import { CourseController, CourseAdminController } from "./controller";
import { injectCourseServices } from "./trpc";

@Module({
  controllers: [CourseController, CourseAdminController],
  providers: [
    TopicService,
    CourseService,
    SectionService,
    LessonService,
    EnrollmentService,
    AttachmentService,
  ],
  exports: [
    TopicService,
    CourseService,
    SectionService,
    LessonService,
    EnrollmentService,
    AttachmentService,
  ],
})
export class CourseModule implements OnModuleInit {
  constructor(
    private readonly topicService: TopicService,
    private readonly courseService: CourseService,
    private readonly sectionService: SectionService,
    private readonly lessonService: LessonService,
    private readonly enrollmentService: EnrollmentService,
    private readonly attachmentService: AttachmentService,
  ) {}

  onModuleInit() {
    injectCourseServices({
      topicService: this.topicService,
      courseService: this.courseService,
      sectionService: this.sectionService,
      lessonService: this.lessonService,
      enrollmentService: this.enrollmentService,
      attachmentService: this.attachmentService,
    });
  }
}
