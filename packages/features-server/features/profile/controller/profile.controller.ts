/**
 * Profile Feature - REST Controller
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
import { ProfileService } from '../service/profile.service';
import type { UpdateProfileInput, WithdrawInput } from '../dto';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // ============================================================================
  // Auth Endpoints (인증 필요)
  // ============================================================================

  @Get('me')
  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiResponse({ status: 200, description: '프로필 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '프로필을 찾을 수 없음' })
  async getProfile(@CurrentUser() user: User) {
    return this.profileService.getProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: '내 프로필 수정' })
  @ApiResponse({ status: 200, description: '수정된 프로필 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '프로필을 찾을 수 없음' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 50, description: '이름' }, avatar: { type: 'string', format: 'uri', nullable: true, description: '아바타 URL' } } } })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() input: UpdateProfileInput,
  ) {
    return this.profileService.updateProfile(user.id, input);
  }

  @Put('avatar')
  @ApiOperation({ summary: '아바타 URL 업데이트' })
  @ApiResponse({ status: 200, description: '수정된 프로필 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '프로필을 찾을 수 없음' })
  @ApiBody({ schema: { type: 'object', required: ['avatarUrl'], properties: { avatarUrl: { type: 'string', format: 'uri', nullable: true, description: '아바타 URL (null이면 삭제)' } } } })
  async updateAvatar(
    @CurrentUser() user: User,
    @Body() body: { avatarUrl: string | null },
  ) {
    return this.profileService.updateAvatar(user.id, body.avatarUrl);
  }

  @Get('withdrawable')
  @ApiOperation({ summary: '탈퇴 가능 여부 확인' })
  @ApiResponse({ status: 200, description: '탈퇴 가능 여부 반환' })
  async checkWithdrawable(@CurrentUser() user: User) {
    return this.profileService.checkWithdrawable(user.id);
  }

  @Post('withdraw')
  @ApiOperation({ summary: '회원 탈퇴 요청' })
  @ApiResponse({ status: 200, description: '탈퇴 성공' })
  @ApiResponse({ status: 400, description: '활성 구독 존재 또는 이미 탈퇴' })
  async withdraw(
    @CurrentUser() user: User,
    @Body() input: WithdrawInput,
  ) {
    return this.profileService.withdraw(user.id, input);
  }

  // ============================================================================
  // Admin Endpoints (Admin 권한 필요)
  // ============================================================================

  @Get('admin/list')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 전체 사용자 목록 조회 (페이지네이션 + 검색)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이름/이메일 검색' })
  @ApiQuery({ name: 'marketingConsent', required: false, enum: ['agreed', 'not_agreed'], description: '마케팅 동의 필터' })
  @ApiResponse({ status: 200, description: '사용자 목록 반환 (페이지네이션)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async adminList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('marketingConsent') marketingConsent?: 'agreed' | 'not_agreed',
  ) {
    return this.profileService.listAll({ page, limit, search, marketingConsent });
  }

  @Put('admin/:targetId/role')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 사용자 역할 변경' })
  @ApiParam({ name: 'targetId', description: '대상 사용자 ID (UUID)' })
  @ApiResponse({ status: 200, description: '수정된 프로필 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요 또는 자기 자신 변경 불가' })
  @ApiResponse({ status: 404, description: '대상 사용자를 찾을 수 없음' })
  @ApiBody({ schema: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'editor', 'guest'], description: '변경할 역할' } } } })
  async adminUpdateRole(
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() body: { role: 'admin' | 'editor' | 'guest' },
    @CurrentUser() user: User,
  ) {
    return this.profileService.updateRole(targetId, body.role, user.id);
  }

  @Put('admin/:targetId/deactivate')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 사용자 비활성화' })
  @ApiParam({ name: 'targetId', description: '대상 사용자 ID (UUID)' })
  @ApiResponse({ status: 200, description: '비활성화된 프로필 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요 또는 자기 자신 비활성화 불가' })
  @ApiResponse({ status: 404, description: '대상 사용자를 찾을 수 없음' })
  async adminDeactivate(
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @CurrentUser() user: User,
  ) {
    return this.profileService.deactivate(targetId, user.id);
  }

  @Put('admin/:targetId/reactivate')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 사용자 재활성화' })
  @ApiParam({ name: 'targetId', description: '대상 사용자 ID (UUID)' })
  @ApiResponse({ status: 200, description: '재활성화된 프로필 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiResponse({ status: 404, description: '대상 사용자를 찾을 수 없음' })
  async adminReactivate(
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.profileService.reactivate(targetId);
  }

  @Get('admin/withdrawal-reasons')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 탈퇴 사유 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'reasonType', required: false, type: String })
  @ApiResponse({ status: 200, description: '탈퇴 사유 목록 반환' })
  async adminWithdrawalReasons(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('reasonType') reasonType?: string,
  ) {
    return this.profileService.adminWithdrawalReasons({ page, limit, reasonType });
  }
}
