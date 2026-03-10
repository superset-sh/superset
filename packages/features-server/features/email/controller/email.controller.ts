/**
 * Email Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * 모든 엔드포인트는 Admin 권한이 필요합니다.
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard, NestAdminGuard } from '../../../core/nestjs/auth';
import { EmailService } from '../service/email.service';

@ApiTags('Email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller('admin/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  // ============================================================================
  // Admin Endpoints (Admin 권한 필요)
  // ============================================================================

  @Get('logs')
  @ApiOperation({ summary: '[Admin] 이메일 로그 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'status', required: false, type: String, description: '이메일 상태 필터 (pending, sending, sent, delivered, failed, bounced, opened)' })
  @ApiQuery({ name: 'templateType', required: false, type: String, description: '템플릿 타입 필터 (welcome, email-verification, password-reset, password-changed, notification)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이메일 주소 검색' })
  @ApiResponse({ status: 200, description: '이메일 로그 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('templateType') templateType?: string,
    @Query('search') search?: string,
  ) {
    return this.emailService.getEmailLogs({
      page,
      limit,
      status: status as any,
      templateType: templateType as any,
      search,
    });
  }

  @Get('logs/:logId')
  @ApiOperation({ summary: '[Admin] 이메일 로그 상세 조회' })
  @ApiParam({ name: 'logId', description: '이메일 로그 ID (UUID)' })
  @ApiResponse({ status: 200, description: '이메일 로그 상세 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiResponse({ status: 404, description: '이메일 로그를 찾을 수 없음' })
  async getLog(@Param('logId', ParseUUIDPipe) logId: string) {
    const log = await this.emailService.getEmailLog(logId);

    if (!log) {
      throw new NotFoundException('Email log not found');
    }

    return log;
  }

  @Post('logs/:logId/resend')
  @ApiOperation({ summary: '[Admin] 이메일 재발송' })
  @ApiParam({ name: 'logId', description: '재발송할 이메일 로그 ID (UUID)' })
  @ApiResponse({ status: 200, description: '재발송 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiResponse({ status: 404, description: '이메일 로그를 찾을 수 없음' })
  async resend(@Param('logId', ParseUUIDPipe) logId: string) {
    const log = await this.emailService.resendEmail(logId);
    return { success: true, log };
  }

  @Get('templates/:templateType/preview')
  @ApiOperation({ summary: '[Admin] 이메일 템플릿 미리보기' })
  @ApiParam({ name: 'templateType', description: '템플릿 타입 (welcome, email-verification, password-reset, password-changed, notification)' })
  @ApiResponse({ status: 200, description: '렌더링된 HTML 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async previewTemplate(
    @Param('templateType') _templateType: string,
  ) {
    // TODO: 템플릿 미리보기 구현 (현재 tRPC에서도 빈 HTML 반환)
    return { html: '' };
  }
}
