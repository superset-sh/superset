/**
 * Notification Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * Auth 엔드포인트 + Admin 엔드포인트
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  ParseBoolPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from '../../../core/nestjs/auth';
import { NotificationService } from '../service/notification.service';
import type {
  UpdateSettingsInput,
  BroadcastInput,
} from '../dto';

@ApiTags('Notification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ============================================================================
  // Auth Endpoints (인증 필요)
  // ============================================================================

  @Get()
  @ApiOperation({ summary: '알림 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean, description: '읽지 않은 알림만 (기본값: false)' })
  @ApiQuery({ name: 'type', required: false, type: String, description: '알림 유형 필터 (comment, like, follow, mention, system, announcement)' })
  @ApiResponse({ status: 200, description: '알림 목록 반환 (페이지네이션)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async list(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('unreadOnly', new DefaultValuePipe(false), ParseBoolPipe) unreadOnly: boolean,
    @Query('type') type?: string,
  ) {
    return this.notificationService.list(user.id, { page, limit, unreadOnly, type: type as any });
  }

  @Get('unread-count')
  @ApiOperation({ summary: '읽지 않은 알림 수 조회' })
  @ApiResponse({ status: 200, description: '읽지 않은 알림 수 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getUnreadCount(@CurrentUser() user: User) {
    return this.notificationService.getUnreadCount(user.id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: '알림 읽음 처리' })
  @ApiParam({ name: 'id', description: '알림 ID (UUID)' })
  @ApiResponse({ status: 200, description: '읽음 처리 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '알림을 찾을 수 없음' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: User,
  ) {
    return this.notificationService.markAsRead(user.id, notificationId);
  }

  @Post('read-all')
  @ApiOperation({ summary: '전체 알림 읽음 처리' })
  @ApiResponse({ status: 200, description: '전체 읽음 처리 성공 (처리된 알림 수 반환)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async markAllAsRead(@CurrentUser() user: User) {
    return this.notificationService.markAllAsRead(user.id);
  }

  @Get('settings')
  @ApiOperation({ summary: '알림 설정 조회' })
  @ApiResponse({ status: 200, description: '알림 설정 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getSettings(@CurrentUser() user: User) {
    return this.notificationService.getSettings(user.id);
  }

  @Put('settings')
  @ApiOperation({ summary: '알림 설정 업데이트' })
  @ApiResponse({ status: 200, description: '설정 업데이트 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiBody({ schema: { type: 'object', required: ['type', 'enabled'], properties: { type: { type: 'string', enum: ['comment', 'like', 'follow', 'mention', 'system', 'announcement'], description: '알림 유형' }, enabled: { type: 'boolean', description: '활성화 여부' }, channels: { type: 'array', items: { type: 'string', enum: ['email', 'push', 'inapp'] }, description: '수신 채널' } } } })
  async updateSettings(
    @Body() dto: UpdateSettingsInput,
    @CurrentUser() user: User,
  ) {
    return this.notificationService.updateSettings(user.id, dto);
  }

  // ============================================================================
  // Admin Endpoints (Admin 권한 필요)
  // ============================================================================

  @Post('admin/broadcast')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 전체 공지 발송' })
  @ApiResponse({ status: 201, description: '공지 발송 성공 (발송된 수 반환)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiBody({ schema: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string', minLength: 1, maxLength: 200, description: '공지 제목' }, content: { type: 'string', minLength: 1, description: '공지 내용' }, targetUserIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '대상 사용자 ID (없으면 전체)' } } } })
  async broadcast(@Body() dto: BroadcastInput) {
    return this.notificationService.broadcast(dto);
  }

  @Get('admin/stats')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 알림 통계 조회' })
  @ApiResponse({ status: 200, description: '알림 통계 반환 (전체, 읽지않음, 오늘)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getStats() {
    return this.notificationService.getStats();
  }
}
