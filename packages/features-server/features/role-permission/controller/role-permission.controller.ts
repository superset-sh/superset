/**
 * Role & Permission REST Controller
 *
 * 역할, 권한, 사용자 역할 할당, 관리자 유틸리티 엔드포인트
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
import { RoleService, PermissionService, AuthorizationService } from "../services";
import type {
  CreateRoleInput,
  UpdateRoleInput,
} from "../dto";

@ApiTags("Role & Permission")
@Controller("role-permission")
export class RolePermissionController {
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  // ==========================================================================
  // Permissions — Public
  // ==========================================================================

  @Get("permissions")
  @ApiOperation({ summary: "전체 권한 목록 조회" })
  @ApiQuery({ name: "category", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, description: "권한 목록 반환" })
  async listPermissions(
    @Query("category") category?: string,
    @Query("search") search?: string,
  ) {
    return this.permissionService.getPermissions({ category, search });
  }

  @Get("permissions/:id")
  @ApiOperation({ summary: "권한 상세 조회" })
  @ApiParam({ name: "id", description: "권한 ID" })
  @ApiResponse({ status: 200, description: "권한 상세 정보" })
  @ApiResponse({ status: 404, description: "권한을 찾을 수 없음" })
  async getPermission(@Param("id", ParseUUIDPipe) id: string) {
    return this.permissionService.getPermissionById(id);
  }

  @Get("permissions/by-category")
  @ApiOperation({ summary: "카테고리별 권한 조회" })
  @ApiResponse({ status: 200, description: "카테고리별 권한 목록 반환" })
  async getPermissionsByCategory() {
    return this.permissionService.getPermissionsByCategory();
  }

  // ==========================================================================
  // My (현재 사용자) — Auth
  // ==========================================================================

  @Get("my/roles")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 역할 조회" })
  @ApiResponse({ status: 200, description: "내 역할 목록 반환" })
  async myRoles(@CurrentUser() user: User) {
    return this.authorizationService.getUserRoles(user.id);
  }

  @Get("my/permissions")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 권한 조회" })
  @ApiResponse({ status: 200, description: "내 권한 목록 반환" })
  async myPermissions(@CurrentUser() user: User) {
    return this.authorizationService.getUserPermissions(user.id);
  }

  @Get("my/permission-set")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 권한 세트 조회" })
  @ApiResponse({ status: 200, description: "내 권한 세트 반환" })
  async myPermissionSet(@CurrentUser() user: User) {
    return this.authorizationService.getUserPermissionSet(user.id);
  }

  @Get("my/check")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "특정 권한 보유 여부 확인" })
  @ApiQuery({ name: "permission", required: true, type: String, description: "확인할 권한 (예: users.read)" })
  @ApiQuery({ name: "userId", required: false, type: String, description: "확인 대상 사용자 ID (미입력시 본인)" })
  @ApiResponse({ status: 200, description: "권한 보유 여부 반환" })
  async checkPermission(
    @CurrentUser() user: User,
    @Query("permission") permission: string,
    @Query("userId") userId?: string,
  ) {
    const targetUserId = userId || user.id;
    return this.authorizationService.checkPermissionDetailed(
      targetUserId,
      permission as `${string}.${string}`,
    );
  }

  // ==========================================================================
  // Roles — Admin
  // ==========================================================================

  @Get("roles")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할 목록 조회 (관리자)" })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "isSystem", required: false, type: Boolean })
  @ApiResponse({ status: 200, description: "역할 목록 반환" })
  async listRoles(
    @Query("search") search?: string,
    @Query("isSystem") isSystem?: boolean,
  ) {
    return this.roleService.getRoles({ search, isSystem });
  }

  @Get("roles/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할 상세 조회 (관리자)" })
  @ApiParam({ name: "id", description: "역할 ID" })
  @ApiQuery({ name: "includePermissions", required: false, type: Boolean })
  @ApiResponse({ status: 200, description: "역할 상세 정보" })
  @ApiResponse({ status: 404, description: "역할을 찾을 수 없음" })
  async getRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("includePermissions") includePermissions?: boolean,
  ) {
    if (includePermissions) {
      return this.roleService.getRoleWithPermissions(id);
    }
    return this.roleService.getRoleById(id);
  }

  @Post("roles")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할 생성 (관리자)" })
  @ApiResponse({ status: 201, description: "역할 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['name', 'slug'], properties: { name: { type: 'string', minLength: 2, maxLength: 50, description: '역할 이름' }, slug: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-z0-9-]+$', description: '역할 슬러그' }, description: { type: 'string', maxLength: 500, description: '설명' }, color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', description: '색상 (hex)' }, icon: { type: 'string', maxLength: 50, description: '아이콘' }, priority: { type: 'integer', minimum: 0, maximum: 100, default: 0, description: '우선순위' }, permissionIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '할당할 권한 ID 목록' } } } })
  async createRole(@Body() dto: CreateRoleInput) {
    return this.roleService.createRole(dto);
  }

  @Put("roles/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할 수정 (관리자)" })
  @ApiParam({ name: "id", description: "역할 ID" })
  @ApiResponse({ status: 200, description: "역할 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string', minLength: 2, maxLength: 50, description: '역할 이름' }, slug: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-z0-9-]+$', description: '역할 슬러그' }, description: { type: 'string', maxLength: 500, nullable: true, description: '설명' }, color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', nullable: true, description: '색상 (hex)' }, icon: { type: 'string', maxLength: 50, nullable: true, description: '아이콘' }, priority: { type: 'integer', minimum: 0, maximum: 100, description: '우선순위' } } } })
  async updateRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: Omit<UpdateRoleInput, "id">,
  ) {
    return this.roleService.updateRole({ id, ...dto });
  }

  @Delete("roles/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할 삭제 (관리자)" })
  @ApiParam({ name: "id", description: "역할 ID" })
  @ApiResponse({ status: 200, description: "역할 삭제 성공" })
  async deleteRole(@Param("id", ParseUUIDPipe) id: string) {
    await this.roleService.deleteRole(id);
    return { success: true, message: "Role deleted successfully" };
  }

  @Get("roles/:id/permissions")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할의 권한 목록 (관리자)" })
  @ApiParam({ name: "id", description: "역할 ID" })
  @ApiResponse({ status: 200, description: "역할의 권한 목록 반환" })
  async getRolePermissions(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleService.getRolePermissions(id);
  }

  @Post("roles/:id/permissions")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할에 권한 할당 (관리자)" })
  @ApiParam({ name: "id", description: "역할 ID" })
  @ApiResponse({ status: 200, description: "권한 할당 성공" })
  @ApiBody({ schema: { type: 'object', required: ['permissionIds'], properties: { permissionIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '할당할 권한 ID 목록' } } } })
  async assignPermissionsToRole(
    @Param("id", ParseUUIDPipe) roleId: string,
    @Body() dto: { permissionIds: string[] },
  ) {
    await this.roleService.assignPermissionsToRole({ roleId, permissionIds: dto.permissionIds });
    return {
      success: true,
      roleId,
      assignedPermissions: dto.permissionIds,
      message: "Permissions assigned successfully",
    };
  }

  @Delete("roles/:roleId/permissions/:permissionId")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "역할에서 권한 제거 (관리자)" })
  @ApiParam({ name: "roleId", description: "역할 ID" })
  @ApiParam({ name: "permissionId", description: "권한 ID" })
  @ApiResponse({ status: 200, description: "권한 제거 성공" })
  async removePermissionFromRole(
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Param("permissionId", ParseUUIDPipe) permissionId: string,
  ) {
    await this.roleService.removePermissionFromRole(roleId, permissionId);
    return { success: true, message: "Permission removed successfully" };
  }

  // ==========================================================================
  // User Roles — Admin
  // ==========================================================================

  @Get("users/:userId/roles")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "사용자의 역할 조회 (관리자)" })
  @ApiParam({ name: "userId", description: "사용자 ID" })
  @ApiQuery({ name: "includePermissions", required: false, type: Boolean })
  @ApiResponse({ status: 200, description: "사용자 역할 목록 반환" })
  async getUserRoles(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query("includePermissions") includePermissions?: boolean,
  ) {
    const roles = await this.authorizationService.getUserRoles(userId);

    if (includePermissions) {
      const permissions = await this.authorizationService.getUserPermissions(userId);
      return { roles, permissions };
    }

    return { roles };
  }

  @Post("users/:userId/roles")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "사용자에게 역할 할당 (관리자)" })
  @ApiParam({ name: "userId", description: "사용자 ID" })
  @ApiResponse({ status: 200, description: "역할 할당 성공" })
  @ApiBody({ schema: { type: 'object', required: ['roleIds'], properties: { roleIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '할당할 역할 ID 목록' } } } })
  async assignRolesToUser(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: { roleIds: string[] },
    @CurrentUser() user: User,
  ) {
    await this.authorizationService.assignRolesToUser(userId, dto.roleIds, user.id);
    return {
      success: true,
      userId,
      assignedRoles: dto.roleIds,
      message: "Roles assigned successfully",
    };
  }

  @Delete("users/:userId/roles/:roleId")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "사용자에서 역할 제거 (관리자)" })
  @ApiParam({ name: "userId", description: "사용자 ID" })
  @ApiParam({ name: "roleId", description: "역할 ID" })
  @ApiResponse({ status: 200, description: "역할 제거 성공" })
  async removeRoleFromUser(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("roleId", ParseUUIDPipe) roleId: string,
  ) {
    await this.authorizationService.removeRoleFromUser(userId, roleId);
    return { success: true, message: "Role removed successfully" };
  }

  // ==========================================================================
  // Admin Utilities
  // ==========================================================================

  @Post("admin/seed-roles")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "시스템 역할 시드 (관리자)" })
  @ApiResponse({ status: 200, description: "시스템 역할 시드 완료" })
  async seedRoles() {
    await this.roleService.seedSystemRoles();
    return { success: true, message: "System roles seeded successfully" };
  }

  @Post("admin/seed-permissions")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "시스템 권한 시드 (관리자)" })
  @ApiResponse({ status: 200, description: "시스템 권한 시드 완료" })
  async seedPermissions() {
    await this.permissionService.seedSystemPermissions();
    return { success: true, message: "System permissions seeded successfully" };
  }

  @Post("admin/clear-cache")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "전체 권한 캐시 초기화 (관리자)" })
  @ApiResponse({ status: 200, description: "캐시 초기화 완료" })
  async clearCache() {
    this.authorizationService.clearAllCaches();
    return { success: true, message: "All permission caches cleared" };
  }

  @Post("admin/invalidate-cache/:userId")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "특정 사용자 캐시 무효화 (관리자)" })
  @ApiParam({ name: "userId", description: "사용자 ID" })
  @ApiResponse({ status: 200, description: "사용자 캐시 무효화 완료" })
  async invalidateUserCache(@Param("userId", ParseUUIDPipe) userId: string) {
    this.authorizationService.invalidateUserCache(userId);
    return { success: true, message: `Cache invalidated for user: ${userId}` };
  }
}
