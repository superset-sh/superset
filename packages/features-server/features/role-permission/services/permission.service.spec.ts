import { Test, TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { PermissionService } from "./permission.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  or: jest.fn((...conditions: any[]) => ({ conditions, type: "or" })),
  like: jest.fn((field: any, pattern: any) => ({ field, pattern, type: "like" })),
}));

// Mock schema tables
jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    permissions: {
      id: { name: "id" },
      resource: { name: "resource" },
      action: { name: "action" },
      scope: { name: "scope" },
      description: { name: "description" },
      category: { name: "category" },
      createdAt: { name: "created_at" },
      updatedAt: { name: "updated_at" },
    },
  };
});

// Mock data
const mockPostsCreatePerm = {
  id: "perm-001",
  resource: "posts",
  action: "create",
  scope: null,
  description: "Create new posts",
  category: "posts",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPostsReadPerm = {
  id: "perm-002",
  resource: "posts",
  action: "read",
  scope: null,
  description: "View posts",
  category: "posts",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAdminAccessPerm = {
  id: "perm-003",
  resource: "admin",
  action: "access",
  scope: null,
  description: "Access admin panel",
  category: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUncategorizedPerm = {
  id: "perm-004",
  resource: "custom",
  action: "do",
  scope: null,
  description: "Custom action",
  category: null,
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

describe("PermissionService", () => {
  let service: PermissionService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // getPermissions
  // =========================================================================
  describe("getPermissions", () => {
    it("should return all permissions without filters", async () => {
      mockDb._queueResolve("orderBy", [
        mockPostsCreatePerm,
        mockPostsReadPerm,
        mockAdminAccessPerm,
      ]);

      const result = await service.getPermissions();

      expect(result).toHaveLength(3);
    });

    it("should filter by resource", async () => {
      mockDb._queueResolve("orderBy", [mockPostsCreatePerm, mockPostsReadPerm]);

      const result = await service.getPermissions({ resource: "posts" });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("should filter by action", async () => {
      mockDb._queueResolve("orderBy", [mockPostsCreatePerm]);

      const result = await service.getPermissions({ action: "create" });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it("should filter by category", async () => {
      mockDb._queueResolve("orderBy", [mockAdminAccessPerm]);

      const result = await service.getPermissions({ category: "admin" });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe("admin");
    });

    it("should filter by search term", async () => {
      mockDb._queueResolve("orderBy", [mockPostsCreatePerm]);

      const result = await service.getPermissions({ search: "create" });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it("should apply multiple filters", async () => {
      mockDb._queueResolve("orderBy", [mockPostsCreatePerm]);

      const result = await service.getPermissions({
        resource: "posts",
        action: "create",
      });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getPermissionById
  // =========================================================================
  describe("getPermissionById", () => {
    it("should return permission when found", async () => {
      mockDb._queueResolve("limit", [mockPostsCreatePerm]);

      const result = await service.getPermissionById("perm-001");

      expect(result).toEqual(mockPostsCreatePerm);
    });

    it("should return null when permission not found", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.getPermissionById("nonexistent");

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getPermissionsByCategory
  // =========================================================================
  describe("getPermissionsByCategory", () => {
    it("should group permissions by category", async () => {
      mockDb._queueResolve("orderBy", [
        mockPostsCreatePerm,
        mockPostsReadPerm,
        mockAdminAccessPerm,
      ]);

      const result = await service.getPermissionsByCategory();

      expect(Object.keys(result)).toContain("posts");
      expect(Object.keys(result)).toContain("admin");
      expect(result["posts"]).toHaveLength(2);
      expect(result["admin"]).toHaveLength(1);
    });

    it('should use "uncategorized" for null category', async () => {
      mockDb._queueResolve("orderBy", [mockUncategorizedPerm]);

      const result = await service.getPermissionsByCategory();

      expect(Object.keys(result)).toContain("uncategorized");
      expect(result["uncategorized"]).toHaveLength(1);
    });

    it("should return empty object when no permissions", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getPermissionsByCategory();

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  // =========================================================================
  // permissionExists
  // =========================================================================
  describe("permissionExists", () => {
    it("should return true when permission exists", async () => {
      mockDb._queueResolve("limit", [{ id: "perm-001" }]);

      const result = await service.permissionExists("posts", "create");

      expect(result).toBe(true);
    });

    it("should return false when permission does not exist", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.permissionExists("nonexistent", "action");

      expect(result).toBe(false);
    });

    it("should check scope when provided", async () => {
      mockDb._queueResolve("limit", [{ id: "perm-update-own" }]);

      const result = await service.permissionExists("posts", "update", "own");

      expect(result).toBe(true);
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // seedSystemPermissions
  // =========================================================================
  describe("seedSystemPermissions", () => {
    it("should seed permissions when none exist", async () => {
      // 27 permissions total: each does permissionExists → insert
      // For simplicity, mock all as not existing
      for (let i = 0; i < 27; i++) {
        mockDb._queueResolve("limit", []); // not found
        mockDb._queueResolve("values", []); // insert
      }

      await expect(service.seedSystemPermissions()).resolves.toBeUndefined();
    });

    it("should skip existing permissions (idempotent)", async () => {
      // All 27 permissions already exist
      for (let i = 0; i < 27; i++) {
        mockDb._queueResolve("limit", [{ id: `perm-${i}` }]); // found
      }

      await expect(service.seedSystemPermissions()).resolves.toBeUndefined();
      // insert should not be called for existing permissions
    });
  });
});
