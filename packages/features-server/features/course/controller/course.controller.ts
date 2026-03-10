/**
 * Course Feature - Public/Auth REST Controller
 *
 * Public: 주제 목록, 강의 목록, 강의 상세, 첨부파일 목록
 * Auth: 수강 신청, 수강 취소, 내 수강 목록, 진행률 업데이트, 강의 진행 상황
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { TopicService } from "../service/topic.service";
import { CourseService } from "../service/course.service";
import { SectionService } from "../service/section.service";
import { EnrollmentService } from "../service/enrollment.service";
import { AttachmentService } from "../service/attachment.service";

@ApiTags("Course")
@Controller("course")
export class CourseController {
  constructor(
    private readonly topicService: TopicService,
    private readonly courseService: CourseService,
    private readonly sectionService: SectionService,
    private readonly enrollmentService: EnrollmentService,
    private readonly attachmentService: AttachmentService,
  ) {}

  // ============================================================================
  // Topics (Public)
  // ============================================================================

  @Get("topics")
  @ApiOperation({ summary: "활성 주제 목록 조회" })
  @ApiResponse({ status: 200, description: "주제 목록 반환" })
  async topics() {
    return this.topicService.findAll(false);
  }

  // ============================================================================
  // Courses (Public)
  // ============================================================================

  @Get()
  @ApiOperation({ summary: "발행된 강의 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "topicId", required: false, type: String })
  @ApiQuery({ name: "sort", required: false, enum: ["order", "latest"] })
  @ApiResponse({ status: 200, description: "강의 목록 반환 (페이지네이션)" })
  async list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("topicId") topicId?: string,
    @Query("sort") sort?: string,
  ) {
    return this.courseService.findPublished({ page, limit, topicId, sort });
  }

  @Get("by-slug/:slug")
  @ApiOperation({ summary: "Slug로 강의 상세 조회" })
  @ApiParam({ name: "slug", description: "강의 slug" })
  @ApiResponse({ status: 200, description: "강의 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "강의를 찾을 수 없음" })
  async bySlug(@Param("slug") slug: string) {
    return this.courseService.findBySlug(slug);
  }

  @Get(":id/curriculum")
  @ApiOperation({ summary: "강의 커리큘럼 조회 (섹션+레슨)" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "커리큘럼 구조 반환" })
  async curriculum(@Param("id", ParseUUIDPipe) id: string) {
    return this.sectionService.findByCourseId(id);
  }

  @Get(":id/attachments")
  @ApiOperation({ summary: "강의 첨부파일 목록 조회" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "첨부파일 목록 반환" })
  async attachments(@Param("id", ParseUUIDPipe) id: string) {
    return this.attachmentService.findByCourseId(id);
  }

  // ============================================================================
  // Enrollment (Auth)
  // ============================================================================

  @Post(":id/enroll")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "수강 신청" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 201, description: "수강 신청 성공" })
  @ApiResponse({ status: 409, description: "이미 수강 중" })
  async enroll(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.enrollmentService.enroll(id, user.id);
  }

  @Delete(":id/enroll")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "수강 취소" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "수강 취소 성공" })
  async cancelEnrollment(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.enrollmentService.cancel(id, user.id);
  }

  @Get(":id/enrolled")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "수강 여부 확인" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "수강 여부 반환" })
  async isEnrolled(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const enrolled = await this.enrollmentService.isEnrolled(id, user.id);
    return { enrolled };
  }

  @Get("my/courses")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 수강 목록 조회" })
  @ApiResponse({ status: 200, description: "수강 중인 강의 목록 반환" })
  async myCourses(@CurrentUser() user: User) {
    return this.enrollmentService.myCourses(user.id);
  }

  // ============================================================================
  // Progress (Auth)
  // ============================================================================

  @Post("progress")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "진행률 업데이트 (비디오 위치 기반)" })
  @ApiResponse({ status: 200, description: "진행률 업데이트 성공" })
  async updateProgress(
    @CurrentUser() user: User,
    @Body() body: { lessonId: string; currentPosition: number; totalDuration: number },
  ) {
    await this.enrollmentService.updateProgress(body, user.id);
    return { success: true };
  }

  @Post("progress/complete")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "레슨 완료/미완료 토글" })
  @ApiResponse({ status: 200, description: "레슨 완료 상태 변경 성공" })
  async toggleLessonComplete(
    @CurrentUser() user: User,
    @Body() body: { lessonId: string; completed: boolean },
  ) {
    return this.enrollmentService.toggleLessonComplete(body.lessonId, user.id, body.completed);
  }

  @Get(":id/progress")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "강의 전체 진행 상황 조회" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "강의 진행 상황 반환" })
  async courseProgress(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.enrollmentService.getCourseProgress(id, user.id);
  }
}
