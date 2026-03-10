/**
 * Review Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Public: list, get, getSummary, getSummaryBatch
 * - Auth: create, update, delete, toggleHelpful, getHelpfulStatus, report
 * - Admin: adminUpdateStatus, adminGetPendingReviews, adminGetReports, adminResolveReport
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
  UseGuards,
  ParseUUIDPipe,
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
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { ReviewService } from "../service/review.service";
import type { CreateReviewInput, UpdateReviewInput } from "../service/review.service";

@ApiTags("Review")
@Controller("review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ============================================================================
  // Public Endpoints
  // ============================================================================

  @Get()
  @ApiOperation({ summary: "리뷰 목록 조회 (페이지네이션)" })
  @ApiQuery({ name: "targetType", required: true, description: "대상 엔티티 타입 (e.g., board_post, product)" })
  @ApiQuery({ name: "targetId", required: true, description: "대상 엔티티 ID (UUID)" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "페이지 번호 (기본값: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "페이지당 항목 수 (기본값: 10, 최대: 50)" })
  @ApiQuery({ name: "sort", required: false, enum: ["recent", "rating_high", "rating_low", "helpful", "oldest"], description: "정렬 기준" })
  @ApiQuery({ name: "ratingFilter", required: false, type: Number, description: "별점 필터 (1-5)" })
  @ApiResponse({ status: 200, description: "리뷰 목록 반환" })
  async list(
    @Query("targetType") targetType: string,
    @Query("targetId", ParseUUIDPipe) targetId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("sort") sort?: "recent" | "rating_high" | "rating_low" | "helpful" | "oldest",
    @Query("ratingFilter") ratingFilter?: string,
  ) {
    return this.reviewService.findByTarget({
      targetType,
      targetId,
      page,
      limit,
      sort: sort || "recent",
      ratingFilter: ratingFilter ? parseInt(ratingFilter) : undefined,
    });
  }

  @Get("summary")
  @ApiOperation({ summary: "리뷰 요약 조회 (평균 별점, 분포, 총 개수)" })
  @ApiQuery({ name: "targetType", required: true, description: "대상 엔티티 타입" })
  @ApiQuery({ name: "targetId", required: true, description: "대상 엔티티 ID (UUID)" })
  @ApiResponse({ status: 200, description: "리뷰 요약 정보 반환" })
  async getSummary(
    @Query("targetType") targetType: string,
    @Query("targetId", ParseUUIDPipe) targetId: string,
  ) {
    return this.reviewService.getSummary(targetType, targetId);
  }

  @Post("summary/batch")
  @ApiOperation({ summary: "여러 대상 리뷰 요약 일괄 조회" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "대상 엔티티 타입" },
        targetIds: { type: "array", items: { type: "string", format: "uuid" }, description: "대상 엔티티 ID 목록 (최대 50개)" },
      },
      required: ["targetType", "targetIds"],
    },
  })
  @ApiResponse({ status: 200, description: "대상별 리뷰 요약 맵 반환" })
  async getSummaryBatch(
    @Body() body: { targetType: string; targetIds: string[] },
  ) {
    const result = await this.reviewService.getSummaryBatch(body.targetType, body.targetIds);
    return Object.fromEntries(result);
  }

  @Get(":id")
  @ApiOperation({ summary: "리뷰 상세 조회" })
  @ApiParam({ name: "id", description: "리뷰 ID (UUID)" })
  @ApiResponse({ status: 200, description: "리뷰 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "리뷰를 찾을 수 없음" })
  async get(@Param("id", ParseUUIDPipe) id: string) {
    return this.reviewService.findById(id);
  }

  // ============================================================================
  // Auth Endpoints (인증 필요)
  // ============================================================================

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리뷰 작성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "대상 엔티티 타입" },
        targetId: { type: "string", format: "uuid", description: "대상 엔티티 ID" },
        rating: { type: "number", minimum: 1, maximum: 5, description: "별점 (1-5)" },
        title: { type: "string", maxLength: 200, description: "리뷰 제목" },
        content: { type: "string", minLength: 10, maxLength: 2000, description: "리뷰 내용 (10-2000자)" },
        images: { type: "array", items: { type: "string", format: "uuid" }, description: "첨부 파일 ID 목록 (최대 10개)" },
        verifiedPurchase: { type: "boolean", description: "구매 인증 여부" },
      },
      required: ["targetType", "targetId", "rating", "title", "content"],
    },
  })
  @ApiResponse({ status: 201, description: "리뷰 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 409, description: "이미 리뷰를 작성한 대상" })
  async create(
    @CurrentUser() user: User,
    @Body() body: CreateReviewInput,
  ) {
    return this.reviewService.create(user.id, body);
  }

  @Put(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리뷰 수정" })
  @ApiParam({ name: "id", description: "리뷰 ID (UUID)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200, description: "리뷰 제목" },
        content: { type: "string", minLength: 10, maxLength: 2000, description: "리뷰 내용" },
        images: { type: "array", items: { type: "string", format: "uuid" }, description: "첨부 파일 ID 목록" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "리뷰 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "본인 리뷰만 수정 가능" })
  @ApiResponse({ status: 404, description: "리뷰를 찾을 수 없음" })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateReviewInput,
  ) {
    return this.reviewService.update(id, user.id, body);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리뷰 삭제 (소프트 삭제)" })
  @ApiParam({ name: "id", description: "리뷰 ID (UUID)" })
  @ApiResponse({ status: 200, description: "리뷰 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "본인 리뷰만 삭제 가능" })
  @ApiResponse({ status: 404, description: "리뷰를 찾을 수 없음" })
  async delete(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.reviewService.delete(id, user.id);
    return { success: true };
  }

  @Post(":reviewId/helpful")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리뷰 도움됨 토글" })
  @ApiParam({ name: "reviewId", description: "리뷰 ID (UUID)" })
  @ApiResponse({ status: 200, description: "도움됨 토글 결과 (added: true/false)" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async toggleHelpful(
    @CurrentUser() user: User,
    @Param("reviewId", ParseUUIDPipe) reviewId: string,
  ) {
    return this.reviewService.toggleHelpful(reviewId, user.id);
  }

  @Get(":reviewId/helpful/status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리뷰 도움됨 투표 상태 조회" })
  @ApiParam({ name: "reviewId", description: "리뷰 ID (UUID)" })
  @ApiResponse({ status: 200, description: "도움됨 투표 상태 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getHelpfulStatus(
    @CurrentUser() user: User,
    @Param("reviewId", ParseUUIDPipe) reviewId: string,
  ) {
    const hasVoted = await this.reviewService.getHelpfulStatus(reviewId, user.id);
    return { hasVoted };
  }

  @Post("report")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리뷰 신고" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        reviewId: { type: "string", format: "uuid", description: "신고할 리뷰 ID" },
        reason: { type: "string", enum: ["spam", "inappropriate", "offensive", "fake", "other"], description: "신고 사유" },
        details: { type: "string", maxLength: 500, description: "추가 설명 (최대 500자)" },
      },
      required: ["reviewId", "reason"],
    },
  })
  @ApiResponse({ status: 200, description: "신고 접수 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 409, description: "이미 신고한 리뷰" })
  async report(
    @CurrentUser() user: User,
    @Body() body: { reviewId: string; reason: "spam" | "inappropriate" | "offensive" | "fake" | "other"; details?: string },
  ) {
    await this.reviewService.createReport(body.reviewId, user.id, body.reason, body.details);
    return { success: true };
  }

  // ============================================================================
  // Admin Endpoints (관리자 권한 필요)
  // ============================================================================

  @Put("admin/:id/status")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "[Admin] 리뷰 상태 변경" })
  @ApiParam({ name: "id", description: "리뷰 ID (UUID)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "hidden"], description: "변경할 상태" },
        reason: { type: "string", maxLength: 500, description: "상태 변경 사유" },
      },
      required: ["status"],
    },
  })
  @ApiResponse({ status: 200, description: "상태 변경 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  @ApiResponse({ status: 404, description: "리뷰를 찾을 수 없음" })
  async adminUpdateStatus(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { status: "pending" | "approved" | "hidden"; reason?: string },
  ) {
    return this.reviewService.adminUpdateStatus(id, body.status, user.id, body.reason);
  }

  @Get("admin/pending")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "[Admin] 대기 중인 리뷰 목록 조회" })
  @ApiResponse({ status: 200, description: "대기 중인 리뷰 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminGetPendingReviews() {
    return this.reviewService.adminGetPendingReviews();
  }

  @Get("admin/reports")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "[Admin] 신고 목록 조회" })
  @ApiQuery({ name: "status", required: false, enum: ["pending", "resolved", "dismissed"], description: "신고 상태 필터" })
  @ApiResponse({ status: 200, description: "신고 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminGetReports(
    @Query("status") status?: "pending" | "resolved" | "dismissed",
  ) {
    return this.reviewService.adminGetReports(status);
  }

  @Put("admin/reports/:reportId/resolve")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "[Admin] 신고 처리" })
  @ApiParam({ name: "reportId", description: "신고 ID (UUID)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["resolved", "dismissed"], description: "처리 결과" },
        notes: { type: "string", maxLength: 1000, description: "관리자 메모 (최대 1000자)" },
      },
      required: ["action"],
    },
  })
  @ApiResponse({ status: 200, description: "신고 처리 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminResolveReport(
    @CurrentUser() user: User,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() body: { action: "resolved" | "dismissed"; notes?: string },
  ) {
    await this.reviewService.resolveReport(reportId, body.action, user.id, body.notes);
    return { success: true };
  }
}
