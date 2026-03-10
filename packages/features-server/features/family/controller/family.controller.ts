/**
 * Family Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * 그룹, 멤버, 아이, 치료사 배정, Admin 엔드포인트
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
import {
  JwtAuthGuard,
  NestAdminGuard,
  CurrentUser,
  type User,
} from '../../../core/nestjs/auth';
import { FamilyService } from '../service/family.service';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  InviteMemberInput,
  CreateChildInput,
  UpdateChildInput,
} from '../dto';

@ApiTags('Family')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('family')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  // ============================================================================
  // Group Endpoints
  // ============================================================================

  @Post()
  @ApiOperation({ summary: '가족 그룹 생성' })
  @ApiResponse({ status: 201, description: '그룹 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', maxLength: 100, description: '그룹명' } },
    },
  })
  async createGroup(
    @CurrentUser() user: User,
    @Body() input: CreateGroupInput,
  ) {
    return this.familyService.createGroup(user.id, input);
  }

  @Get('my')
  @ApiOperation({ summary: '내 그룹 목록 조회' })
  @ApiResponse({ status: 200, description: '그룹 목록 반환 (memberCount, childCount 포함)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getMyGroups(@CurrentUser() user: User) {
    return this.familyService.getMyGroups(user.id);
  }

  @Get(':groupId')
  @ApiOperation({ summary: '그룹 상세 조회 (멤버 + 아이 포함)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 200, description: '그룹 상세 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '그룹 멤버가 아님' })
  @ApiResponse({ status: 404, description: '그룹을 찾을 수 없음' })
  async getGroup(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.familyService.getGroup(user.id, groupId);
  }

  @Put(':groupId')
  @ApiOperation({ summary: '그룹명 수정 (owner/guardian)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 200, description: '수정된 그룹 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음 (owner/guardian만)' })
  @ApiResponse({ status: 404, description: '그룹을 찾을 수 없음' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', maxLength: 100, description: '그룹명' } },
    },
  })
  async updateGroup(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: UpdateGroupInput,
  ) {
    return this.familyService.updateGroup(user.id, groupId, input);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: '그룹 삭제 — soft delete (owner만)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음 (owner만)' })
  @ApiResponse({ status: 404, description: '그룹을 찾을 수 없음' })
  async deleteGroup(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.familyService.deleteGroup(user.id, groupId);
  }

  // ============================================================================
  // Member Endpoints
  // ============================================================================

  @Post(':groupId/invite')
  @ApiOperation({ summary: '멤버 초대 (owner/guardian)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 201, description: '초대 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 409, description: '이미 멤버이거나 대기 중인 초대 존재' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'role'],
      properties: {
        email: { type: 'string', format: 'email', description: '초대 대상 이메일' },
        role: { type: 'string', enum: ['guardian', 'therapist', 'viewer'], description: '부여할 역할' },
      },
    },
  })
  async inviteMember(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: Omit<InviteMemberInput, 'groupId'>,
  ) {
    return this.familyService.inviteMember(user.id, {
      groupId,
      ...body,
    });
  }

  @Post('invitations/accept')
  @ApiOperation({ summary: '초대 수락' })
  @ApiResponse({ status: 200, description: '초대 수락 성공' })
  @ApiResponse({ status: 400, description: '만료된 초대' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '초대 대상 이메일 불일치' })
  @ApiResponse({ status: 404, description: '유효하지 않은 초대' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string', description: '초대 토큰' } },
    },
  })
  async acceptInvitation(
    @CurrentUser() user: User,
    @Body() body: { token: string },
  ) {
    return this.familyService.acceptInvitation(user.id, body.token);
  }

  @Post('invitations/reject')
  @ApiOperation({ summary: '초대 거절' })
  @ApiResponse({ status: 200, description: '초대 거절 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '초대 대상 이메일 불일치' })
  @ApiResponse({ status: 404, description: '유효하지 않은 초대' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string', description: '초대 토큰' } },
    },
  })
  async rejectInvitation(
    @CurrentUser() user: User,
    @Body() body: { token: string },
  ) {
    return this.familyService.rejectInvitation(user.id, body.token);
  }

  @Put(':groupId/members/:memberId/role')
  @ApiOperation({ summary: '멤버 역할 변경 (owner/guardian)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiParam({ name: 'memberId', description: '멤버 ID (UUID)' })
  @ApiResponse({ status: 200, description: '역할 변경 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '멤버를 찾을 수 없음' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['newRole'],
      properties: {
        newRole: { type: 'string', enum: ['guardian', 'therapist', 'viewer'], description: '변경할 역할' },
      },
    },
  })
  async updateMemberRole(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: { newRole: 'guardian' | 'therapist' | 'viewer' },
  ) {
    return this.familyService.updateMemberRole(user.id, {
      groupId,
      memberId,
      newRole: body.newRole,
    });
  }

  @Delete(':groupId/members/:memberId')
  @ApiOperation({ summary: '멤버 제거 (owner/guardian)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiParam({ name: 'memberId', description: '멤버 ID (UUID)' })
  @ApiResponse({ status: 200, description: '멤버 제거 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음 또는 owner 제거 불가' })
  @ApiResponse({ status: 404, description: '멤버를 찾을 수 없음' })
  async removeMember(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.familyService.removeMember(user.id, groupId, memberId);
  }

  @Post(':groupId/leave')
  @ApiOperation({ summary: '그룹 탈퇴 (owner 불가)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 200, description: '그룹 탈퇴 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: 'owner는 탈퇴 불가' })
  async leaveGroup(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.familyService.leaveGroup(user.id, groupId);
  }

  // ============================================================================
  // Child Endpoints
  // ============================================================================

  @Post(':groupId/children')
  @ApiOperation({ summary: '아이 등록 (owner/guardian)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 201, description: '아이 등록 성공' })
  @ApiResponse({ status: 400, description: '인원 제한 초과' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'birthDate'],
      properties: {
        name: { type: 'string', maxLength: 50, description: '아이 이름' },
        birthDate: { type: 'string', format: 'date', description: '생년월일 (YYYY-MM-DD)' },
        gender: { type: 'string', maxLength: 10, description: '성별' },
        notes: { type: 'string', description: '특이사항' },
        avatar: { type: 'string', description: '프로필 사진 URL' },
      },
    },
  })
  async createChild(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: Omit<CreateChildInput, 'groupId'>,
  ) {
    return this.familyService.createChild(user.id, { groupId, ...body });
  }

  @Get(':groupId/children')
  @ApiOperation({ summary: '아이 목록 조회 (therapist는 배정된 아이만)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 200, description: '아이 목록 반환 (만 나이 포함)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '그룹 멤버가 아님' })
  async getChildren(
    @CurrentUser() user: User,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.familyService.getChildren(user.id, groupId);
  }

  @Get('children/:childId')
  @ApiOperation({ summary: '아이 상세 조회 (therapist는 배정된 아이만)' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiResponse({ status: 200, description: '아이 상세 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음 또는 배정되지 않은 아이' })
  @ApiResponse({ status: 404, description: '아이를 찾을 수 없음' })
  async getChild(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.familyService.getChild(user.id, childId);
  }

  @Put('children/:childId')
  @ApiOperation({ summary: '아이 정보 수정 (owner/guardian)' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiResponse({ status: 200, description: '수정된 아이 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '아이를 찾을 수 없음' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 50, description: '아이 이름' },
        birthDate: { type: 'string', format: 'date', description: '생년월일' },
        gender: { type: 'string', maxLength: 10, description: '성별' },
        notes: { type: 'string', description: '특이사항' },
        avatar: { type: 'string', description: '프로필 사진 URL' },
      },
    },
  })
  async updateChild(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() body: Omit<UpdateChildInput, 'childId'>,
  ) {
    return this.familyService.updateChild(user.id, { childId, ...body });
  }

  @Put('children/:childId/deactivate')
  @ApiOperation({ summary: '아이 비활성화 (owner/guardian)' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiResponse({ status: 200, description: '비활성화 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '아이를 찾을 수 없음' })
  async deactivateChild(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.familyService.deactivateChild(user.id, childId);
  }

  @Put('children/:childId/reactivate')
  @ApiOperation({ summary: '아이 재활성화 (owner/guardian) — 인원 제한 재확인' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiResponse({ status: 200, description: '재활성화 성공' })
  @ApiResponse({ status: 400, description: '인원 제한 초과' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '아이를 찾을 수 없음' })
  async reactivateChild(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.familyService.reactivateChild(user.id, childId);
  }

  @Post('children/:childId/therapists')
  @ApiOperation({ summary: '치료사 배정 (owner/guardian)' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiResponse({ status: 201, description: '배정 성공' })
  @ApiResponse({ status: 400, description: '대상이 therapist 멤버가 아님' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '아이를 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '이미 배정됨' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['therapistId'],
      properties: { therapistId: { type: 'string', format: 'uuid', description: '치료사 ID' } },
    },
  })
  async assignTherapist(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() body: { therapistId: string },
  ) {
    return this.familyService.assignTherapist(user.id, {
      childId,
      therapistId: body.therapistId,
    });
  }

  @Delete('children/:childId/therapists/:therapistId')
  @ApiOperation({ summary: '치료사 배정 해제 (owner/guardian)' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiParam({ name: 'therapistId', description: '치료사 ID (UUID)' })
  @ApiResponse({ status: 200, description: '배정 해제 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '배정 정보를 찾을 수 없음' })
  async unassignTherapist(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('therapistId', ParseUUIDPipe) therapistId: string,
  ) {
    return this.familyService.unassignTherapist(user.id, {
      childId,
      therapistId,
    });
  }

  @Get('children/:childId/therapists')
  @ApiOperation({ summary: '아이의 치료사 배정 목록 (owner/guardian)' })
  @ApiParam({ name: 'childId', description: '아이 ID (UUID)' })
  @ApiResponse({ status: 200, description: '배정 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '아이를 찾을 수 없음' })
  async getChildAssignments(
    @CurrentUser() user: User,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.familyService.getChildAssignments(user.id, childId);
  }

  // ============================================================================
  // Admin Endpoints
  // ============================================================================

  @Get('admin/groups')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 전체 그룹 목록 조회 (페이지네이션)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '그룹명 검색' })
  @ApiResponse({ status: 200, description: '그룹 목록 반환 (페이지네이션)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async adminListGroups(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.familyService.adminListGroups({ page, limit, search });
  }

  @Get('admin/groups/:groupId')
  @UseGuards(NestAdminGuard)
  @ApiOperation({ summary: '[Admin] 그룹 상세 조회 (멤버 + 아이 포함)' })
  @ApiParam({ name: 'groupId', description: '그룹 ID (UUID)' })
  @ApiResponse({ status: 200, description: '그룹 상세 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiResponse({ status: 404, description: '그룹을 찾을 수 없음' })
  async adminGetGroupDetail(
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.familyService.adminGetGroupDetail(groupId);
  }
}
