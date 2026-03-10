/**
 * Community Admin REST Controller
 *
 * 시스템 관리자 전용 커뮤니티 관리 엔드포인트
 */
import {
  Controller,
  Get,
  Post,
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
import { CommunityService, CommunityModerationService } from "../service";
import type { ResolveReportDto, BanUserDto } from "../dto";

@ApiTags("Community Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/community")
export class CommunityAdminController {
  constructor(
    private readonly communityService: CommunityService,
    private readonly moderationService: CommunityModerationService,
  ) {}

  // ==========================================================================
  // 커뮤니티 관리
  // ==========================================================================

  @Get()
  @ApiOperation({ summary: "커뮤니티 목록 (관리자용)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "type", required: false, enum: ["public", "restricted", "private"] })
  @ApiResponse({ status: 200, description: "커뮤니티 목록 반환" })
  async list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("search") search?: string,
    @Query("type") type?: "public" | "restricted" | "private",
  ) {
    return this.communityService.adminFindAll({ page, limit, search, type });
  }

  @Delete(":id")
  @ApiOperation({ summary: "커뮤니티 삭제 (관리자)" })
  @ApiParam({ name: "id", description: "커뮤니티 ID" })
  @ApiResponse({ status: 200, description: "커뮤니티 삭제 성공" })
  async delete(@Param("id", ParseUUIDPipe) communityId: string) {
    return this.communityService.adminDelete(communityId);
  }

  @Get("stats")
  @ApiOperation({ summary: "전체 통계" })
  @ApiResponse({ status: 200, description: "전체 통계 반환" })
  async stats() {
    return this.communityService.getSystemStats();
  }

  // ==========================================================================
  // 신고 관리
  // ==========================================================================

  @Get("reports")
  @ApiOperation({ summary: "전체 신고 목록 (cross-community)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: ["pending", "reviewing", "resolved", "dismissed"] })
  @ApiResponse({ status: 200, description: "전체 신고 목록 반환" })
  async reports(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("status") status?: "pending" | "reviewing" | "resolved" | "dismissed",
  ) {
    return this.moderationService.getAllReports({ page, limit, status });
  }

  @Get("reports/stats")
  @ApiOperation({ summary: "신고 통계" })
  @ApiResponse({ status: 200, description: "신고 통계 반환" })
  async reportStats() {
    return this.moderationService.getReportStats();
  }

  @Post("reports/resolve")
  @ApiOperation({ summary: "신고 처리 (관리자)" })
  @ApiResponse({ status: 200, description: "신고 처리 완료" })
  @ApiBody({ schema: { type: 'object', required: ['reportId', 'action'], properties: { reportId: { type: 'string', format: 'uuid', description: '신고 ID' }, action: { type: 'string', enum: ['removed', 'banned', 'warned', 'dismissed'], description: '처리 조치' }, reason: { type: 'string', maxLength: 1000, description: '처리 사유' } } } })
  async resolveReport(@Body() dto: ResolveReportDto, @CurrentUser() user: User) {
    return this.moderationService.resolveReport(dto, user.id);
  }

  // ==========================================================================
  // 사용자 밴 관리
  // ==========================================================================

  @Post("ban")
  @ApiOperation({ summary: "사용자 밴 (관리자)" })
  @ApiResponse({ status: 200, description: "사용자 밴 성공" })
  @ApiBody({ schema: { type: 'object', required: ['communityId', 'userId', 'reason'], properties: { communityId: { type: 'string', format: 'uuid', description: '커뮤니티 ID' }, userId: { type: 'string', format: 'uuid', description: '사용자 ID' }, reason: { type: 'string', maxLength: 1000, description: '밴 사유' }, note: { type: 'string', maxLength: 1000, description: '모더레이터 메모' }, isPermanent: { type: 'boolean', default: true, description: '영구 밴 여부' }, durationDays: { type: 'integer', minimum: 1, description: '밴 기간 (일)' } } } })
  async banUser(@Body() dto: BanUserDto, @CurrentUser() user: User) {
    return this.moderationService.banUser(dto, user.id);
  }

  @Post("unban")
  @ApiOperation({ summary: "밴 해제 (관리자)" })
  @ApiResponse({ status: 200, description: "밴 해제 성공" })
  @ApiBody({ schema: { type: 'object', required: ['communityId', 'userId'], properties: { communityId: { type: 'string', format: 'uuid', description: '커뮤니티 ID' }, userId: { type: 'string', format: 'uuid', description: '사용자 ID' } } } })
  async unbanUser(
    @Body() dto: { communityId: string; userId: string },
    @CurrentUser() user: User,
  ) {
    await this.moderationService.unbanUser(dto.communityId, dto.userId, user.id);
    return { success: true };
  }
}
