import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { RoleService } from "./role.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  or: jest.fn((...conditions: any[]) => ({ conditions, type: "or" })),
  like: jest.fn((field: any, pattern: any) => ({ field, pattern, type: "like" })),
  sql: jest.fn((strings: any, ...values: any[]) => ({ strings, values, type: "sql" })),
  inArray: jest.fn((field: any, values: any) => ({ field, values, type: "inArray" })),
}));

// Mock schema tables
jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    roles: {
      id: { name: "id" },
      name: { name: "name" },
      slug: { name: "slug" },
      description: { name: "description" },
      color: { name: "color" },
      icon: { name: "icon" },
      priority: { name: "priority" },
      isSystem: { name: "is_system" },
      createdAt: { name: "created_at" },
      updatedAt: { name: "updated_at" },
    },
    rolePermissions: {
      roleId: { name: "role_id" },
      permissionId: { name: "permission_id" },
    },
    permissions: {
      id: { name: "id" },
      resource: { name: "resource" },
      action: { name: "action" },
      scope: { name: "scope" },
    },
    userRoles: {
      userId: { name: "user_id" },
      roleId: { name: "role_id" },
    },
  };
});

// Mock data
const mockRoleId = "123e4567-e89b-12d3-a456-426614174000";
const mockPermissionId = "223e4567-e89b-12d3-a456-426614174001";

const mockRole = {
  id: mockRoleId,
  name: "Moderator",
  slug: "moderator",
  description: "Content moderator",
  color: "#3B82F6",
  icon: "shield",
  priority: 30,
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSystemRole = {
  ...mockRole,
  id: "333e4567-e89b-12d3-a456-426614174002",
  name: "Owner",
  slug: "owner",
  priority: 100,
  isSystem: true,
};

const mockPermission = {
  id: mockPermissionId,
  resource: "posts",
  action: "create",
  scope: null,
  description: "Create new posts",
  category: "posts",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Chainable mock DB
const createMockDb = () => {
  const resolveQueue: any[] = [];

  const createChainable = () => {
    const chain: any = {};
    const methods = [
      "select",
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "insert",
      "values",
      "returning",
      "update",
      "set",
      "delete",
      "innerJoin",
    ];

    methods.forEach((method) => {
      chain[method] = jest.fn().mockImplementation(() => {
        if (resolveQueue.length > 0) {
          const nextResolve = resolveQueue[0];
          if (nextResolve.method === method || nextResolve.method === "any") {
            resolveQueue.shift();
            return Promise.resolve(nextResolve.value);
          }
        }
        return chain;
      });
    });

    chain._queueResolve = (method: string, value: any) => {
      resolveQueue.push({ method, value });
    };

    chain._resetQueue = () => {
      resolveQueue.length = 0;
    };

    return chain;
  };

  return createChainable();
};

describe("RoleService", () => {
  let service: RoleService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // createRole
  // =========================================================================
  describe("createRole", () => {
    it("should create a role successfully", async () => {
      // getRoleBySlug → no existing role
      mockDb._queueResolve("limit", []);
      // insert().values().returning()
      mockDb._queueResolve("returning", [mockRole]);

      const result = await service.createRole({
        name: "Moderator",
        slug: "moderator",
        description: "Content moderator",
        color: "#3B82F6",
        icon: "shield",
        priority: 30,
      });

      expect(result).toEqual(mockRole);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should create a role with permissions", async () => {
      // getRoleBySlug → no existing role
      mockDb._queueResolve("limit", []);
      // insert().values().returning()
      mockDb._queueResolve("returning", [mockRole]);
      // assignPermissionsToRole → getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // verify permission exists (per-item) → select().from().where().limit()
      mockDb._queueResolve("limit", [mockPermission]);
      // check existing mapping (per-item) → select().from().where().limit()
      mockDb._queueResolve("limit", []);
      // insert role-permission mapping → insert().values()
      mockDb._queueResolve("values", []);

      const result = await service.createRole({
        name: "Moderator",
        slug: "moderator",
        permissionIds: [mockPermissionId],
      });

      expect(result).toEqual(mockRole);
    });

    it("should throw BadRequestException when slug already exists", async () => {
      // getRoleBySlug → existing role found
      mockDb._queueResolve("limit", [mockRole]);

      await expect(
        service.createRole({
          name: "Moderator",
          slug: "moderator",
        }),
      ).rejects.toThrow(BadRequestException);

      // Re-queue for message check
      mockDb._queueResolve("limit", [mockRole]);

      await expect(
        service.createRole({
          name: "Moderator",
          slug: "moderator",
        }),
      ).rejects.toThrow('Role with slug "moderator" already exists');
    });
  });

  // =========================================================================
  // updateRole
  // =========================================================================
  describe("updateRole", () => {
    it("should update a role successfully", async () => {
      const updatedRole = { ...mockRole, name: "Senior Moderator" };
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // update().set().where().returning()
      mockDb._queueResolve("returning", [updatedRole]);

      const result = await service.updateRole({
        id: mockRoleId,
        name: "Senior Moderator",
      });

      expect(result.name).toBe("Senior Moderator");
    });

    it("should throw NotFoundException when role does not exist", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.updateRole({ id: "nonexistent-id", name: "New Name" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException when updating system role", async () => {
      mockDb._queueResolve("limit", [mockSystemRole]);

      await expect(
        service.updateRole({ id: mockSystemRole.id, name: "Renamed Owner" }),
      ).rejects.toThrow(BadRequestException);

      // Re-queue for message check
      mockDb._queueResolve("limit", [mockSystemRole]);

      await expect(
        service.updateRole({ id: mockSystemRole.id, name: "Renamed Owner" }),
      ).rejects.toThrow("Cannot update system roles");
    });

    it("should throw BadRequestException when changing slug to existing one", async () => {
      const anotherRole = { ...mockRole, id: "another-id", slug: "existing-slug" };
      // getRoleById → current role
      mockDb._queueResolve("limit", [mockRole]);
      // getRoleBySlug → another role with same slug
      mockDb._queueResolve("limit", [anotherRole]);

      await expect(service.updateRole({ id: mockRoleId, slug: "existing-slug" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should allow updating slug to same value", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // update().set().where().returning()
      mockDb._queueResolve("returning", [mockRole]);

      // Updating with the same slug should not throw
      const result = await service.updateRole({
        id: mockRoleId,
        slug: "moderator", // same slug
      });

      expect(result).toEqual(mockRole);
    });
  });

  // =========================================================================
  // deleteRole
  // =========================================================================
  describe("deleteRole", () => {
    it("should delete a role successfully", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // getRoleUserCount → 0 users
      mockDb._queueResolve("where", [{ count: 0 }]);
      // delete().where()
      mockDb._queueResolve("where", []);

      await expect(service.deleteRole(mockRoleId)).resolves.toBeUndefined();
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("should throw NotFoundException when role does not exist", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.deleteRole("nonexistent-id")).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when deleting system role", async () => {
      mockDb._queueResolve("limit", [mockSystemRole]);

      await expect(service.deleteRole(mockSystemRole.id)).rejects.toThrow(BadRequestException);

      mockDb._queueResolve("limit", [mockSystemRole]);

      await expect(service.deleteRole(mockSystemRole.id)).rejects.toThrow(
        "Cannot delete system roles",
      );
    });

    it("should throw BadRequestException when role has assigned users", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // getRoleUserCount → 3 users
      mockDb._queueResolve("where", [{ count: 3 }]);

      await expect(service.deleteRole(mockRoleId)).rejects.toThrow(BadRequestException);

      // Re-queue for message check
      mockDb._queueResolve("limit", [mockRole]);
      mockDb._queueResolve("where", [{ count: 3 }]);

      await expect(service.deleteRole(mockRoleId)).rejects.toThrow(
        'Cannot delete role "Moderator" because it is assigned to 3 user(s)',
      );
    });
  });

  // =========================================================================
  // getRoleById
  // =========================================================================
  describe("getRoleById", () => {
    it("should return role when found", async () => {
      mockDb._queueResolve("limit", [mockRole]);

      const result = await service.getRoleById(mockRoleId);

      expect(result).toEqual(mockRole);
    });

    it("should return null when role not found", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getRoleById("nonexistent-id");

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getRoleBySlug
  // =========================================================================
  describe("getRoleBySlug", () => {
    it("should return role when found by slug", async () => {
      mockDb._queueResolve("limit", [mockRole]);

      const result = await service.getRoleBySlug("moderator");

      expect(result).toEqual(mockRole);
    });

    it("should return null when slug not found", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getRoleBySlug("nonexistent");

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getRoles
  // =========================================================================
  describe("getRoles", () => {
    it("should return all roles without filters", async () => {
      mockDb._queueResolve("orderBy", [mockRole, mockSystemRole]);

      const result = await service.getRoles();

      expect(result).toHaveLength(2);
    });

    it("should filter by isSystem", async () => {
      mockDb._queueResolve("orderBy", [mockSystemRole]);

      const result = await service.getRoles({ isSystem: true });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it("should filter by search term", async () => {
      mockDb._queueResolve("orderBy", [mockRole]);

      const result = await service.getRoles({ search: "mod" });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getRoleWithPermissions
  // =========================================================================
  describe("getRoleWithPermissions", () => {
    it("should return role with permissions", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // getRolePermissions → innerJoin query
      mockDb._queueResolve("where", [{ permission: mockPermission }]);

      const result = await service.getRoleWithPermissions(mockRoleId);

      expect(result).toBeDefined();
      expect(result!.permissions).toHaveLength(1);
      expect(result!.permissionCount).toBe(1);
    });

    it("should return null when role not found", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getRoleWithPermissions("nonexistent-id");

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // assignPermissionsToRole
  // =========================================================================
  describe("assignPermissionsToRole", () => {
    it("should assign permissions to role (per-item check and insert)", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // verify permission exists (per-item) → select().from().where().limit()
      mockDb._queueResolve("limit", [mockPermission]);
      // check existing mapping (per-item) → select().from().where().limit()
      mockDb._queueResolve("limit", []);
      // insert role-permission mapping → insert().values()
      mockDb._queueResolve("values", []);

      await expect(
        service.assignPermissionsToRole({
          roleId: mockRoleId,
          permissionIds: [mockPermissionId],
        }),
      ).resolves.toBeUndefined();

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should skip insert when mapping already exists", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // verify permission exists (per-item)
      mockDb._queueResolve("limit", [mockPermission]);
      // check existing mapping → already exists
      mockDb._queueResolve("limit", [{ roleId: mockRoleId, permissionId: mockPermissionId }]);

      await expect(
        service.assignPermissionsToRole({
          roleId: mockRoleId,
          permissionIds: [mockPermissionId],
        }),
      ).resolves.toBeUndefined();
    });

    it("should throw NotFoundException when role not found", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.assignPermissionsToRole({
          roleId: "nonexistent-id",
          permissionIds: [mockPermissionId],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when permission does not exist", async () => {
      const invalidPermId = "invalid-perm-id";
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // verify permission (per-item) → not found
      mockDb._queueResolve("limit", []);

      await expect(
        service.assignPermissionsToRole({
          roleId: mockRoleId,
          permissionIds: [invalidPermId],
        }),
      ).rejects.toThrow(NotFoundException);

      // Re-queue for message check
      mockDb._queueResolve("limit", [mockRole]);
      mockDb._queueResolve("limit", []);

      await expect(
        service.assignPermissionsToRole({
          roleId: mockRoleId,
          permissionIds: [invalidPermId],
        }),
      ).rejects.toThrow(/Permission with id/);
    });

    it("should handle empty permissionIds (no-op after role check)", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);

      await expect(
        service.assignPermissionsToRole({
          roleId: mockRoleId,
          permissionIds: [],
        }),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // removePermissionFromRole
  // =========================================================================
  describe("removePermissionFromRole", () => {
    it("should remove permission from role", async () => {
      // getRoleById
      mockDb._queueResolve("limit", [mockRole]);
      // delete
      mockDb._queueResolve("where", []);

      await expect(
        service.removePermissionFromRole(mockRoleId, mockPermissionId),
      ).resolves.toBeUndefined();
    });

    it("should throw NotFoundException when role not found", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.removePermissionFromRole("nonexistent-id", mockPermissionId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when modifying system role permissions", async () => {
      mockDb._queueResolve("limit", [mockSystemRole]);

      await expect(
        service.removePermissionFromRole(mockSystemRole.id, mockPermissionId),
      ).rejects.toThrow(BadRequestException);

      mockDb._queueResolve("limit", [mockSystemRole]);

      await expect(
        service.removePermissionFromRole(mockSystemRole.id, mockPermissionId),
      ).rejects.toThrow("Cannot modify permissions of system roles");
    });
  });

  // =========================================================================
  // getRoleUserCount
  // =========================================================================
  describe("getRoleUserCount", () => {
    it("should return user count for role", async () => {
      mockDb._queueResolve("where", [{ count: 5 }]);

      const result = await service.getRoleUserCount(mockRoleId);

      expect(result).toBe(5);
    });

    it("should return 0 when no users assigned", async () => {
      mockDb._queueResolve("where", [{ count: 0 }]);

      const result = await service.getRoleUserCount(mockRoleId);

      expect(result).toBe(0);
    });
  });

  // =========================================================================
  // seedSystemRoles
  // =========================================================================
  describe("seedSystemRoles", () => {
    it("should seed 4 system roles when none exist", async () => {
      // Each of 4 roles: getRoleBySlug → not found, then insert
      for (let i = 0; i < 4; i++) {
        mockDb._queueResolve("limit", []); // not found
        mockDb._queueResolve("values", []); // insert
      }

      await expect(service.seedSystemRoles()).resolves.toBeUndefined();
    });

    it("should skip existing system roles (idempotent)", async () => {
      // All 4 roles already exist
      for (let i = 0; i < 4; i++) {
        mockDb._queueResolve("limit", [mockSystemRole]); // found
      }

      await expect(service.seedSystemRoles()).resolves.toBeUndefined();
      // insert should not have been called
    });
  });
});
