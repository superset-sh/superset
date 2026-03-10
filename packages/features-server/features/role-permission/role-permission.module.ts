import { Module, type OnModuleInit } from '@nestjs/common';
import { RoleService, PermissionService, AuthorizationService } from './services';
import { RolePermissionController } from './controller';
import { injectRolePermissionServices } from './trpc/role-permission.route';
import { injectAuthServiceForMiddleware } from './middleware/require-permission.middleware';

/**
 * Role & Permission Module
 *
 * Provides role-based access control (RBAC) functionality
 */
@Module({
  controllers: [RolePermissionController],
  providers: [RoleService, PermissionService, AuthorizationService],
  exports: [RoleService, PermissionService, AuthorizationService],
})
export class RolePermissionModule implements OnModuleInit {
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  onModuleInit() {
    injectRolePermissionServices(
      this.roleService,
      this.permissionService,
      this.authorizationService,
    );
    injectAuthServiceForMiddleware(this.authorizationService);
  }
}
