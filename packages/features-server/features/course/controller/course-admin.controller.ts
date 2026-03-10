/**
 * Course Feature - Admin REST Controller
 *
 * Admin: 주제 CRUD, 강의 CRUD, 섹션/레슨 CRUD, 수강생 관리, 첨부파일 관리
 */
import {
  Controller,
  Get,
  Post,
  Put,
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
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { TopicService } from "../service/topic.service";
import { CourseService } from "../service/course.service";
import { SectionService } from "../service/section.service";
import { LessonService } from "../service/lesson.service";
import { EnrollmentService } from "../service/enrollment.service";
import { AttachmentService } from "../service/attachment.service";
import type { CreateTopicInput, UpdateTopicInput, ReorderInput } from "../types";

@ApiTags("Course Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/course")
export class CourseAdminController {
  constructor(
    private readonly topicService: TopicService,
    private readonly courseService: CourseService,
    private readonly sectionService: SectionService,
    private readonly lessonService: LessonService,
    private readonly enrollmentService: EnrollmentService,
    private readonly attachmentService: AttachmentService,
  ) {}

  // ============================================================================
  // Topics
  // ============================================================================

  @Get("topics")
  @ApiOperation({ summary: "전체 주제 목록 조회 (비활성 포함)" })
  @ApiResponse({ status: 200, description: "주제 목록 반환" })
  async topics() {
    return this.topicService.findAll(true);
  }

  @Post("topics")
  @ApiOperation({ summary: "주제 생성" })
  @ApiResponse({ status: 201, description: "주제 생성 성공" })
  @ApiResponse({ status: 409, description: "slug 중복" })
  async createTopic(@Body() body: CreateTopicInput) {
    return this.topicService.create(body);
  }

  @Put("topics/:id")
  @ApiOperation({ summary: "주제 수정" })
  @ApiParam({ name: "id", description: "주제 UUID" })
  @ApiResponse({ status: 200, description: "주제 수정 성공" })
  async updateTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateTopicInput,
  ) {
    return this.topicService.update(id, body);
  }

  @Delete("topics/:id")
  @ApiOperation({ summary: "주제 삭제" })
  @ApiParam({ name: "id", description: "주제 UUID" })
  @ApiResponse({ status: 200, description: "주제 삭제 성공" })
  @ApiResponse({ status: 400, description: "강의가 존재하여 삭제 불가" })
  async deleteTopic(@Param("id", ParseUUIDPipe) id: string) {
    return this.topicService.delete(id);
  }

  @Put("topics/reorder")
  @ApiOperation({ summary: "주제 정렬 순서 변경" })
  @ApiResponse({ status: 200, description: "정렬 순서 변경 성공" })
  async reorderTopics(@Body() body: ReorderInput[]) {
    return this.topicService.reorder(body);
  }

  // ============================================================================
  // Courses
  // ============================================================================

  @Get()
  @ApiOperation({ summary: "전체 강의 목록 조회 (draft 포함)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: ["draft", "published"] })
  @ApiQuery({ name: "topicId", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, description: "강의 목록 반환" })
  async adminList(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("status") status?: string,
    @Query("topicId") topicId?: string,
    @Query("search") search?: string,
  ) {
    return this.courseService.adminList({ page, limit, status, topicId, search });
  }

  @Get(":id")
  @ApiOperation({ summary: "강의 상세 조회 (Admin)" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "강의 상세 반환" })
  async adminById(@Param("id", ParseUUIDPipe) id: string) {
    return this.courseService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: "강의 생성" })
  @ApiResponse({ status: 201, description: "강의 생성 성공" })
  async createCourse(@CurrentUser() user: User, @Body() body: { topicId: string; title: string; summary?: string; content?: unknown; thumbnailUrl?: string; estimatedMinutes?: number }) {
    return this.courseService.create(body, user.id);
  }

  @Put(":id")
  @ApiOperation({ summary: "강의 수정" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "강의 수정 성공" })
  async updateCourse(@Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.courseService.update(id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "강의 삭제" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "강의 삭제 성공" })
  async deleteCourse(@Param("id", ParseUUIDPipe) id: string) {
    return this.courseService.delete(id);
  }

  @Post(":id/publish")
  @ApiOperation({ summary: "강의 발행" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "발행 성공" })
  @ApiResponse({ status: 400, description: "발행 조건 미충족" })
  async publish(@Param("id", ParseUUIDPipe) id: string) {
    return this.courseService.publish(id);
  }

  @Post(":id/unpublish")
  @ApiOperation({ summary: "강의 미발행" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "미발행 성공" })
  async unpublish(@Param("id", ParseUUIDPipe) id: string) {
    return this.courseService.unpublish(id);
  }

  // ============================================================================
  // Sections
  // ============================================================================

  @Get(":id/sections")
  @ApiOperation({ summary: "강의 커리큘럼 조회 (Admin)" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiResponse({ status: 200, description: "섹션+레슨 구조 반환" })
  async sections(@Param("id", ParseUUIDPipe) id: string) {
    return this.sectionService.findByCourseId(id);
  }

  @Post("sections")
  @ApiOperation({ summary: "섹션 생성" })
  @ApiResponse({ status: 201, description: "섹션 생성 성공" })
  async createSection(@Body() body: { courseId: string; title: string; description?: string }) {
    return this.sectionService.create(body);
  }

  @Put("sections/:id")
  @ApiOperation({ summary: "섹션 수정" })
  @ApiParam({ name: "id", description: "섹션 UUID" })
  @ApiResponse({ status: 200, description: "섹션 수정 성공" })
  async updateSection(@Param("id", ParseUUIDPipe) id: string, @Body() body: { title?: string; description?: string; sortOrder?: number }) {
    return this.sectionService.update(id, body);
  }

  @Delete("sections/:id")
  @ApiOperation({ summary: "섹션 삭제 (하위 레슨 포함)" })
  @ApiParam({ name: "id", description: "섹션 UUID" })
  @ApiResponse({ status: 200, description: "섹션 삭제 성공" })
  async deleteSection(@Param("id", ParseUUIDPipe) id: string) {
    const result = await this.sectionService.delete(id);
    await this.courseService.updateTotalLessons(result.courseId);
    return { success: true };
  }

  @Put("sections/reorder")
  @ApiOperation({ summary: "섹션 정렬 순서 변경" })
  @ApiResponse({ status: 200, description: "정렬 순서 변경 성공" })
  async reorderSections(@Body() body: ReorderInput[]) {
    return this.sectionService.reorder(body);
  }

  // ============================================================================
  // Lessons
  // ============================================================================

  @Post("lessons")
  @ApiOperation({ summary: "레슨 생성" })
  @ApiResponse({ status: 201, description: "레슨 생성 성공" })
  async createLesson(@Body() body: { sectionId: string; title: string; description?: string; isFree?: boolean }) {
    const lesson = await this.lessonService.create(body);
    const courseId = await this.lessonService.getCourseIdByLessonId(lesson.id);
    await this.courseService.updateTotalLessons(courseId);
    return lesson;
  }

  @Put("lessons/:id")
  @ApiOperation({ summary: "레슨 수정" })
  @ApiParam({ name: "id", description: "레슨 UUID" })
  @ApiResponse({ status: 200, description: "레슨 수정 성공" })
  async updateLesson(@Param("id", ParseUUIDPipe) id: string, @Body() body: { title?: string; description?: string; sortOrder?: number; isFree?: boolean }) {
    return this.lessonService.update(id, body);
  }

  @Delete("lessons/:id")
  @ApiOperation({ summary: "레슨 삭제" })
  @ApiParam({ name: "id", description: "레슨 UUID" })
  @ApiResponse({ status: 200, description: "레슨 삭제 성공" })
  async deleteLesson(@Param("id", ParseUUIDPipe) id: string) {
    const result = await this.lessonService.delete(id);
    await this.courseService.updateTotalLessons(result.courseId);
    return { success: true };
  }

  @Post("lessons/:id/video")
  @ApiOperation({ summary: "레슨 동영상 설정" })
  @ApiParam({ name: "id", description: "레슨 UUID" })
  @ApiResponse({ status: 200, description: "동영상 설정 성공" })
  async setVideo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { videoFileId: string; videoDurationSeconds: number },
  ) {
    return this.lessonService.setVideo(id, body);
  }

  @Delete("lessons/:id/video")
  @ApiOperation({ summary: "레슨 동영상 제거" })
  @ApiParam({ name: "id", description: "레슨 UUID" })
  @ApiResponse({ status: 200, description: "동영상 제거 성공" })
  async removeVideo(@Param("id", ParseUUIDPipe) id: string) {
    return this.lessonService.removeVideo(id);
  }

  @Put("lessons/reorder")
  @ApiOperation({ summary: "레슨 정렬 순서 변경" })
  @ApiResponse({ status: 200, description: "정렬 순서 변경 성공" })
  async reorderLessons(@Body() body: ReorderInput[]) {
    return this.lessonService.reorder(body);
  }

  // ============================================================================
  // Enrollment (Admin)
  // ============================================================================

  @Get(":id/students")
  @ApiOperation({ summary: "강의 수강생 목록 조회" })
  @ApiParam({ name: "id", description: "강의 UUID" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "수강생 목록 반환" })
  async students(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.enrollmentService.adminList(id, { page, limit });
  }

  // ============================================================================
  // Attachments (Admin)
  // ============================================================================

  @Post("attachments")
  @ApiOperation({ summary: "첨부파일 추가" })
  @ApiResponse({ status: 201, description: "첨부파일 추가 성공" })
  async createAttachment(@Body() body: { courseId: string; fileId?: string; url?: string; fileType?: string; title?: string }) {
    return this.attachmentService.create(body);
  }

  @Delete("attachments/:id")
  @ApiOperation({ summary: "첨부파일 삭제" })
  @ApiParam({ name: "id", description: "첨부파일 UUID" })
  @ApiResponse({ status: 200, description: "첨부파일 삭제 성공" })
  async deleteAttachment(@Param("id", ParseUUIDPipe) id: string) {
    return this.attachmentService.delete(id);
  }

  @Put("attachments/reorder")
  @ApiOperation({ summary: "첨부파일 정렬 순서 변경" })
  @ApiResponse({ status: 200, description: "정렬 순서 변경 성공" })
  async reorderAttachments(@Body() body: ReorderInput[]) {
    return this.attachmentService.reorder(body);
  }
}
