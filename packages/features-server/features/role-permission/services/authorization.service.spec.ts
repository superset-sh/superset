import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { AuthorizationService } from "./authorization.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  inArray: jest.fn((field: any, values: any) => ({ field, values, type: "inArray" })),
}));

// Mock schema tables
jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    userRoles: {
      userId: { name: "user_id" },
      roleId: { name: "role_id" },
    },
    roles: {
      id: { name: "id" },
      slug: { name: "slug" },
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
  };
});

// Mock data
const mockUserId = "123e4567-e89b-12d3-a456-426614174000";
const mockAssignedBy = "999e4567-e89b-12d3-a456-426614174999";

const mockOwnerRole = {
  id: "role-owner-id",
  name: "Owner",
  slug: "owner",
  priority: 100,
  isSystem: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMemberRole = {
  id: "role-member-id",
  name: "Member",
  slug: "member",
  priority: 50,
  isSystem: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPostsCreatePerm = {
  id: "perm-posts-create",
  resource: "posts",
  action: "create",
  scope: null,
  description: "Create posts",
  category: "posts",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPostsUpdateOwnPerm = {
  id: "perm-posts-update-own",
  resource: "posts",
  action: "update",
  scope: "own",
  description: "Update own posts",
  category: "posts",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPostsUpdateAllPerm = {
  id: "perm-posts-update-all",
  resource: "posts",
  action: "update",
  scope: "all",
  description: "Update all posts",
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

describe("AuthorizationService", () => {
  let service: AuthorizationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
    service.clearAllCaches();
  });

  // =========================================================================
  // hasPermission
  // =========================================================================
  describe("hasPermission", () => {
    it("should return true when user has exact permission", async () => {
      // getUserPermissions → getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → get permissions from rolePermissions
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.hasPermission(mockUserId, "posts.create");

      expect(result).toBe(true);
    });

    it("should return false when user lacks permission", async () => {
      // getUserPermissions → getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → permissions
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.hasPermission(mockUserId, "admin.settings");

      expect(result).toBe(false);
    });

    it("should return false when user has no roles", async () => {
      // getUserPermissions → getUserRoles → empty
      mockDb._queueResolve("where", []);

      const result = await service.hasPermission(mockUserId, "posts.create");

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // checkPermission (private, tested via hasPermission behavior)
  // =========================================================================
  describe("permission scope matching", () => {
    it('should match "all" scope satisfying "own" scope requirement', async () => {
      // getUserPermissions → getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → has "posts.update.all"
      mockDb._queueResolve("where", [{ permission: mockPostsUpdateAllPerm }]);

      const result = await service.hasPermission(mockUserId, "posts.update.own");

      expect(result).toBe(true);
    });

    it('should NOT match "own" scope satisfying "all" scope requirement', async () => {
      // getUserPermissions → getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → has "posts.update.own"
      mockDb._queueResolve("where", [{ permission: mockPostsUpdateOwnPerm }]);

      const result = await service.hasPermission(mockUserId, "posts.update.all");

      expect(result).toBe(false);
    });

    it("should match permission without scope when no scope required", async () => {
      // getUserPermissions → getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → has "posts.create" (no scope)
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.hasPermission(mockUserId, "posts.create");

      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // checkPermissionDetailed
  // =========================================================================
  describe("checkPermissionDetailed", () => {
    it("should return detailed result when permission granted", async () => {
      // getUserPermissions → getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → permissions
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.checkPermissionDetailed(mockUserId, "posts.create");

      expect(result.hasPermission).toBe(true);
      expect(result.reason).toBe("User has required permission");
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it("should return detailed result when permission denied", async () => {
      // getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions
      mockDb._queueResolve("where", []);

      const result = await service.checkPermissionDetailed(mockUserId, "admin.settings");

      expect(result.hasPermission).toBe(false);
      expect(result.reason).toContain("admin.settings");
    });
  });

  // =========================================================================
  // hasAllPermissions
  // =========================================================================
  describe("hasAllPermissions", () => {
    it("should return true when user has all required permissions", async () => {
      // getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions
      mockDb._queueResolve("where", [
        { permission: mockPostsCreatePerm },
        { permission: mockPostsUpdateOwnPerm },
      ]);

      const result = await service.hasAllPermissions(mockUserId, [
        "posts.create",
        "posts.update.own",
      ]);

      expect(result).toBe(true);
    });

    it("should return false when user lacks any required permission", async () => {
      // getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → only has posts.create
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.hasAllPermissions(mockUserId, [
        "posts.create",
        "admin.settings",
      ]);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // hasAnyPermission
  // =========================================================================
  describe("hasAnyPermission", () => {
    it("should return true when user has at least one permission", async () => {
      // getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.hasAnyPermission(mockUserId, ["posts.create", "admin.settings"]);

      expect(result).toBe(true);
    });

    it("should return false when user has none of the permissions", async () => {
      // getUserRoles
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.hasAnyPermission(mockUserId, ["admin.settings", "admin.access"]);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // canAccessResource
  // =========================================================================
  describe("canAccessResource", () => {
    it('should allow access with "all" scope permission', async () => {
      // getUserPermissions → getUserRoles (1st hasPermission call, sets cache)
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → has posts.update.all
      mockDb._queueResolve("where", [{ permission: mockPostsUpdateAllPerm }]);

      const result = await service.canAccessResource({
        userId: mockUserId,
        resource: "posts",
        action: "update",
        resourceOwnerId: "other-user-id",
      });

      expect(result).toBe(true);
    });

    it('should allow own resource access with "own" scope', async () => {
      // getUserPermissions → getUserRoles (1st hasPermission call, sets cache)
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → has posts.update.own
      mockDb._queueResolve("where", [{ permission: mockPostsUpdateOwnPerm }]);
      // allPermission check fails ('own' doesn't satisfy 'all')
      // ownPermission check: userId === resourceOwnerId + cache hit → true

      const result = await service.canAccessResource({
        userId: mockUserId,
        resource: "posts",
        action: "update",
        resourceOwnerId: mockUserId, // same user = owner
      });

      expect(result).toBe(true);
    });

    it("should deny access when user has no matching permissions at all", async () => {
      // getUserPermissions → getUserRoles (1st hasPermission call, sets cache)
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → only has posts.create (no delete permission)
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      // posts.delete.all → false (cache hit, no match)
      // posts.delete.own → skipped (not resource owner)
      // posts.delete → false (cache hit, no match)

      const result = await service.canAccessResource({
        userId: mockUserId,
        resource: "posts",
        action: "delete",
        resourceOwnerId: "other-user-id",
      });

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Cache behavior
  // =========================================================================
  describe("cache", () => {
    it("should use cached data on subsequent calls", async () => {
      // First call: fetch from DB
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      await service.getUserPermissions(mockUserId);

      // Second call: should use cache (no new DB calls needed)
      const result = await service.getUserPermissions(mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].resource).toBe("posts");
    });

    it("should invalidate cache for specific user", async () => {
      // First call
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      await service.getUserPermissions(mockUserId);

      // Invalidate
      service.invalidateUserCache(mockUserId);

      // Next call should hit DB again
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.getUserPermissions(mockUserId);
      expect(result).toHaveLength(1);
    });

    it("should clear all caches", async () => {
      // Populate cache
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      await service.getUserPermissions(mockUserId);

      // Clear all
      service.clearAllCaches();

      // Should hit DB again
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.getUserPermissions(mockUserId);
      expect(result).toHaveLength(1);
    });

    it("should expire cache after TTL", async () => {
      // Populate cache
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      await service.getUserPermissions(mockUserId);

      // Manually expire cache by manipulating cachedAt
      const cacheField = (service as any).cache as Map<string, any>;
      const cached = cacheField.get(mockUserId);
      if (cached) {
        cached.cachedAt = new Date(Date.now() - 6 * 60 * 1000); // 6 min ago
      }

      // Should hit DB again due to expired cache
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.getUserPermissions(mockUserId);
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getUserPermissions — deduplication
  // =========================================================================
  describe("getUserPermissions deduplication", () => {
    it("should deduplicate permissions from multiple roles", async () => {
      const adminRole = { ...mockMemberRole, id: "role-admin", slug: "admin" };

      // getUserRoles → user has 2 roles
      mockDb._queueResolve("where", [{ role: mockMemberRole }, { role: adminRole }]);
      // getUserPermissions → same permission from both roles
      mockDb._queueResolve("where", [
        { permission: mockPostsCreatePerm },
        { permission: mockPostsCreatePerm }, // duplicate
        { permission: mockPostsUpdateOwnPerm },
      ]);

      const result = await service.getUserPermissions(mockUserId);

      // Should deduplicate by permission ID
      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // assignRolesToUser
  // =========================================================================
  describe("assignRolesToUser", () => {
    it("should assign roles to user (per-item check and insert)", async () => {
      // verify role exists → select().from(roles).where().limit()
      mockDb._queueResolve("limit", [mockMemberRole]);
      // check existing mapping → select().from(userRoles).where().limit()
      mockDb._queueResolve("limit", []);
      // insert new user-role mapping → insert().values()
      mockDb._queueResolve("values", []);

      await expect(
        service.assignRolesToUser(mockUserId, [mockMemberRole.id], mockAssignedBy),
      ).resolves.toBeUndefined();

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should skip insert when mapping already exists", async () => {
      // verify role exists
      mockDb._queueResolve("limit", [mockMemberRole]);
      // check existing mapping → already exists
      mockDb._queueResolve("limit", [{ userId: mockUserId, roleId: mockMemberRole.id }]);

      await expect(
        service.assignRolesToUser(mockUserId, [mockMemberRole.id], mockAssignedBy),
      ).resolves.toBeUndefined();
    });

    it("should throw NotFoundException when role does not exist", async () => {
      const invalidRoleId = "invalid-role-id";
      // verify role → not found
      mockDb._queueResolve("limit", []);

      await expect(
        service.assignRolesToUser(mockUserId, [invalidRoleId], mockAssignedBy),
      ).rejects.toThrow(NotFoundException);

      mockDb._queueResolve("limit", []);

      await expect(
        service.assignRolesToUser(mockUserId, [invalidRoleId], mockAssignedBy),
      ).rejects.toThrow(/역할을 찾을 수 없습니다/);
    });

    it("should handle empty roleIds (no-op)", async () => {
      // Empty array = no loops execute, just invalidateUserCache
      await expect(
        service.assignRolesToUser(mockUserId, [], mockAssignedBy),
      ).resolves.toBeUndefined();
    });

    it("should invalidate cache after role assignment", async () => {
      // Populate cache first
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);
      await service.getUserPermissions(mockUserId);

      // Assign role (per-item)
      mockDb._queueResolve("limit", [mockMemberRole]);
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("values", []);

      await service.assignRolesToUser(mockUserId, [mockMemberRole.id], mockAssignedBy);

      // Cache should be invalidated — next call hits DB
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const perms = await service.getUserPermissions(mockUserId);
      expect(perms).toHaveLength(1);
    });
  });

  // =========================================================================
  // removeRoleFromUser
  // =========================================================================
  describe("removeRoleFromUser", () => {
    it("should remove role from user", async () => {
      mockDb._queueResolve("where", []);

      await expect(
        service.removeRoleFromUser(mockUserId, mockMemberRole.id),
      ).resolves.toBeUndefined();

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("should invalidate cache after role removal", async () => {
      // Populate cache
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);
      await service.getUserPermissions(mockUserId);

      // Remove role
      mockDb._queueResolve("where", []);
      await service.removeRoleFromUser(mockUserId, mockMemberRole.id);

      // Cache should be invalidated
      mockDb._queueResolve("where", []);
      const roles = await service.getUserRoles(mockUserId);
      expect(roles).toHaveLength(0);
    });
  });

  // =========================================================================
  // getUserPermissionSet
  // =========================================================================
  describe("getUserPermissionSet", () => {
    it("should return complete permission set", async () => {
      // getUserRoles (called directly from getUserPermissionSet)
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → getUserRoles (called again, no cache for roles alone)
      mockDb._queueResolve("where", [{ role: mockMemberRole }]);
      // getUserPermissions → get permissions
      mockDb._queueResolve("where", [{ permission: mockPostsCreatePerm }]);

      const result = await service.getUserPermissionSet(mockUserId);

      expect(result.userId).toBe(mockUserId);
      expect(result.roles).toHaveLength(1);
      expect(result.permissions).toHaveLength(1);
      expect(result.cachedAt).toBeInstanceOf(Date);
    });
  });
});
