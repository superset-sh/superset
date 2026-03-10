// ============================================================================
// Imports (after mocks)
// ============================================================================
import {
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { TEST_DATES, TEST_IDS, TEST_USER, createMockDb } from "../../__test-utils__";
import { CommunityModerationService } from "./community-moderation.service";
import { CommunityService } from "./community.service";

// ============================================================================
// Mocks (hoisted before imports — cannot reference module-level variables)
// ============================================================================

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  or: jest.fn((...conditions: any[]) => ({ conditions, type: "or" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  count: jest.fn(() => ({ type: "count" })),
  sql: jest.fn((strings: any, ...values: any[]) => ({ strings, values, type: "sql" })),
}));

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("../helpers/permission", () => ({
  assertCommunityPermission: jest.fn().mockResolvedValue(undefined),
  assertResourceOwner: jest.fn(),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const col = (name: string) => ({ name });
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    communityReports: {
      id: col("id"),
      communityId: col("community_id"),
      reporterId: col("reporter_id"),
      targetType: col("target_type"),
      targetId: col("target_id"),
      reason: col("reason"),
      ruleViolated: col("rule_violated"),
      description: col("description"),
      status: col("status"),
      resolvedBy: col("resolved_by"),
      resolvedAt: col("resolved_at"),
      resolution: col("resolution"),
      actionTaken: col("action_taken"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
    communityBans: {
      id: col("id"),
      communityId: col("community_id"),
      userId: col("user_id"),
      bannedBy: col("banned_by"),
      reason: col("reason"),
      note: col("note"),
      isPermanent: col("is_permanent"),
      expiresAt: col("expires_at"),
      createdAt: col("created_at"),
    },
    communityRules: {
      id: col("id"),
      communityId: col("community_id"),
      title: col("title"),
      description: col("description"),
      appliesTo: col("applies_to"),
      violationAction: col("violation_action"),
      displayOrder: col("display_order"),
      createdAt: col("created_at"),
    },
    communityFlairs: {
      id: col("id"),
      communityId: col("community_id"),
      type: col("type"),
      text: col("text"),
      color: col("color"),
      backgroundColor: col("background_color"),
      modOnly: col("mod_only"),
      displayOrder: col("display_order"),
      createdAt: col("created_at"),
    },
    communityModerators: {
      id: col("id"),
      communityId: col("community_id"),
      userId: col("user_id"),
      permissions: col("permissions"),
      appointedBy: col("appointed_by"),
      appointedAt: col("appointed_at"),
    },
    communityModLogs: {
      id: col("id"),
      communityId: col("community_id"),
      moderatorId: col("moderator_id"),
      action: col("action"),
      targetType: col("target_type"),
      targetId: col("target_id"),
      details: col("details"),
      reason: col("reason"),
      createdAt: col("created_at"),
    },
  };
});

// ============================================================================
// Test Data
// ============================================================================

const COMMUNITY_ID = TEST_IDS.UUID_1;
const MODERATOR_ID = TEST_USER.id;
const OTHER_USER_ID = TEST_IDS.UUID_5;
const REPORT_ID = TEST_IDS.UUID_2;
const RULE_ID = TEST_IDS.UUID_3;
const FLAIR_ID = TEST_IDS.UUID_4;

const MOCK_COMMUNITY = {
  id: COMMUNITY_ID,
  name: "Test Community",
  slug: "test-community",
  description: "A test community",
  ownerId: MODERATOR_ID,
  type: "public" as const,
  memberCount: 10,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_REPORT = {
  id: REPORT_ID,
  communityId: COMMUNITY_ID,
  reporterId: OTHER_USER_ID,
  targetType: "post" as const,
  targetId: TEST_IDS.UUID_3,
  reason: "spam" as const,
  ruleViolated: null,
  description: "This is spam",
  status: "pending" as const,
  resolvedBy: null,
  resolvedAt: null,
  resolution: null,
  actionTaken: null,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_RESOLVED_REPORT = {
  ...MOCK_REPORT,
  status: "resolved" as const,
  resolvedBy: MODERATOR_ID,
  resolvedAt: TEST_DATES.NOW,
  resolution: "Spam confirmed",
  actionTaken: "removed" as const,
};

const MOCK_BAN = {
  id: TEST_IDS.UUID_4,
  communityId: COMMUNITY_ID,
  userId: OTHER_USER_ID,
  bannedBy: MODERATOR_ID,
  reason: "Spamming",
  note: "Repeated offenses",
  isPermanent: true,
  expiresAt: null,
  createdAt: TEST_DATES.CREATED,
};

const MOCK_RULE = {
  id: RULE_ID,
  communityId: COMMUNITY_ID,
  title: "Be respectful",
  description: "Treat everyone with respect.",
  appliesTo: "both" as const,
  violationAction: "warn" as const,
  displayOrder: 0,
  createdAt: TEST_DATES.CREATED,
};

const MOCK_FLAIR = {
  id: FLAIR_ID,
  communityId: COMMUNITY_ID,
  type: "post" as const,
  text: "Discussion",
  color: "#ffffff",
  backgroundColor: "#0079d3",
  modOnly: false,
  displayOrder: 0,
  createdAt: TEST_DATES.CREATED,
};

const MOCK_MODERATOR = {
  id: TEST_IDS.UUID_5,
  communityId: COMMUNITY_ID,
  userId: OTHER_USER_ID,
  permissions: {
    managePosts: true,
    manageComments: true,
    manageUsers: true,
    manageFlairs: false,
    manageRules: false,
    manageSettings: false,
    manageModerators: false,
    viewModLog: true,
    viewReports: true,
  },
  appointedBy: MODERATOR_ID,
  appointedAt: TEST_DATES.CREATED,
};

const MOCK_MOD_LOG = {
  id: TEST_IDS.UUID_3,
  communityId: COMMUNITY_ID,
  moderatorId: MODERATOR_ID,
  action: "ban_user" as const,
  targetType: "user" as const,
  targetId: OTHER_USER_ID,
  details: {},
  reason: "Spamming",
  createdAt: TEST_DATES.CREATED,
};

const CREATE_REPORT_DTO = {
  communityId: COMMUNITY_ID,
  targetType: "post" as const,
  targetId: TEST_IDS.UUID_3,
  reason: "spam" as const,
  description: "This is spam",
};

const RESOLVE_REPORT_DTO = {
  reportId: REPORT_ID,
  action: "removed" as const,
  reason: "Spam confirmed",
};

const BAN_USER_DTO = {
  communityId: COMMUNITY_ID,
  userId: OTHER_USER_ID,
  reason: "Spamming",
  note: "Repeated offenses",
  isPermanent: true,
};

const CREATE_RULE_DTO = {
  communityId: COMMUNITY_ID,
  title: "Be respectful",
  description: "Treat everyone with respect.",
  appliesTo: "both" as const,
  violationAction: "warn" as const,
};

const CREATE_FLAIR_DTO = {
  communityId: COMMUNITY_ID,
  type: "post" as const,
  text: "Discussion",
  color: "#ffffff",
  backgroundColor: "#0079d3",
  modOnly: false,
};

const INVITE_MODERATOR_DTO = {
  communityId: COMMUNITY_ID,
  userId: OTHER_USER_ID,
  permissions: {
    managePosts: true,
    manageComments: true,
    manageUsers: true,
    manageFlairs: false,
    manageRules: false,
    manageSettings: false,
    manageModerators: false,
    viewModLog: true,
    viewReports: true,
  },
};

// ============================================================================
// Tests
// ============================================================================

describe("CommunityModerationService", () => {
  let service: CommunityModerationService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockCommunityService: Record<string, jest.Mock>;
  let mockAssertPermission: jest.Mock;

  beforeEach(async () => {
    mockDb = createMockDb();

    mockCommunityService = {
      findById: jest.fn().mockResolvedValue(MOCK_COMMUNITY),
      getMembership: jest.fn(),
      isMember: jest.fn(),
      isModerator: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityModerationService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CommunityService, useValue: mockCommunityService },
      ],
    }).compile();

    service = module.get<CommunityModerationService>(CommunityModerationService);

    // Get reference to the mocked permission helper
    const permissionModule = jest.requireMock("../helpers/permission");
    mockAssertPermission = permissionModule.assertCommunityPermission;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // createReport
  // ============================================================================
  describe("createReport", () => {
    it("신고 생성 성공", async () => {
      // insert report returning
      mockDb._queueResolve("returning", [MOCK_REPORT]);
      // logModAction insert (no returning needed — resolves via chain)
      mockDb._queueResolve("values", undefined);

      const result = await service.createReport(CREATE_REPORT_DTO, OTHER_USER_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(REPORT_ID);
      expect(result.reason).toBe("spam");
      expect(result.reporterId).toBe(OTHER_USER_ID);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("신고 생성 시 모드 로그가 기록됨", async () => {
      mockDb._queueResolve("returning", [MOCK_REPORT]);
      mockDb._queueResolve("values", undefined);

      await service.createReport(CREATE_REPORT_DTO, OTHER_USER_ID);

      // insert called twice: once for report, once for mod log
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it("설명 없이 신고 생성 가능", async () => {
      const dtoWithoutDesc = { ...CREATE_REPORT_DTO, description: undefined };
      const reportWithoutDesc = { ...MOCK_REPORT, description: null };

      mockDb._queueResolve("returning", [reportWithoutDesc]);
      mockDb._queueResolve("values", undefined);

      const result = await service.createReport(dtoWithoutDesc, OTHER_USER_ID);

      expect(result).toBeDefined();
      expect(result.description).toBeNull();
    });
  });

  // ============================================================================
  // resolveReport
  // ============================================================================
  describe("resolveReport", () => {
    it("신고 처리 성공", async () => {
      // findReportById query
      mockDb._queueResolve("limit", [MOCK_REPORT]);
      // assertCommunityPermission is mocked
      // update report returning
      mockDb._queueResolve("returning", [MOCK_RESOLVED_REPORT]);
      // logModAction insert
      mockDb._queueResolve("values", undefined);

      const result = await service.resolveReport(RESOLVE_REPORT_DTO, MODERATOR_ID);

      expect(result).toBeDefined();
      expect(result.status).toBe("resolved");
      expect(result.actionTaken).toBe("removed");
      expect(result.resolvedBy).toBe(MODERATOR_ID);
    });

    it("존재하지 않는 신고 시 NotFoundException 발생", async () => {
      // findReportById returns empty
      mockDb._queueResolve("limit", []);

      await expect(
        service.resolveReport(RESOLVE_REPORT_DTO, MODERATOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("존재하지 않는 신고 시 에러 메시지 확인", async () => {
      mockDb._queueResolve("limit", []);

      await expect(
        service.resolveReport(RESOLVE_REPORT_DTO, MODERATOR_ID),
      ).rejects.toThrow(/신고를 찾을 수 없습니다/);
    });

    it("권한 검증이 호출됨", async () => {
      mockDb._queueResolve("limit", [MOCK_REPORT]);
      mockDb._queueResolve("returning", [MOCK_RESOLVED_REPORT]);
      mockDb._queueResolve("values", undefined);

      await service.resolveReport(RESOLVE_REPORT_DTO, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("권한 없는 사용자가 처리 시도 시 ForbiddenException 발생", async () => {
      const { ForbiddenException } = jest.requireActual("@nestjs/common");
      mockAssertPermission.mockRejectedValueOnce(
        new ForbiddenException("이 작업을 수행할 권한이 없습니다."),
      );

      mockDb._queueResolve("limit", [MOCK_REPORT]);

      await expect(
        service.resolveReport(RESOLVE_REPORT_DTO, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================================
  // getReports
  // ============================================================================
  describe("getReports", () => {
    it("커뮤니티 신고 목록 조회 성공", async () => {
      mockDb._queueResolve("orderBy", [MOCK_REPORT]);

      const result = await service.getReports(COMMUNITY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(MOCK_REPORT);
    });

    it("status 필터 적용", async () => {
      mockDb._queueResolve("orderBy", [MOCK_REPORT]);

      const result = await service.getReports(COMMUNITY_ID, "pending");

      expect(result).toBeDefined();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("빈 결과 반환", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getReports(COMMUNITY_ID);

      expect(result).toEqual([]);
    });

    it("status 없이 전체 조회", async () => {
      mockDb._queueResolve("orderBy", [MOCK_REPORT, MOCK_RESOLVED_REPORT]);

      const result = await service.getReports(COMMUNITY_ID);

      expect(result).toHaveLength(2);
    });
  });

  // ============================================================================
  // findReportById
  // ============================================================================
  describe("findReportById", () => {
    it("신고 ID로 조회 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_REPORT]);

      const result = await service.findReportById(REPORT_ID);

      expect(result).toBeDefined();
      expect(result!.id).toBe(REPORT_ID);
    });

    it("존재하지 않는 신고 시 null 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findReportById("nonexistent-id");

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // getModQueue
  // ============================================================================
  describe("getModQueue", () => {
    it("모드 큐 조회 성공", async () => {
      mockDb._queueResolve("orderBy", [MOCK_REPORT]);

      const result = await service.getModQueue(COMMUNITY_ID);

      expect(result).toBeDefined();
      expect(result.reports).toHaveLength(1);
      expect(result.spam).toEqual([]);
      expect(result.removed).toEqual([]);
    });

    it("빈 모드 큐 반환", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getModQueue(COMMUNITY_ID);

      expect(result.reports).toEqual([]);
      expect(result.spam).toEqual([]);
      expect(result.removed).toEqual([]);
    });
  });

  // ============================================================================
  // banUser
  // ============================================================================
  describe("banUser", () => {
    it("사용자 영구 밴 성공", async () => {
      // assertCommunityPermission is mocked
      // findBan returns empty (not already banned)
      mockDb._queueResolve("limit", []);
      // insert ban returning
      mockDb._queueResolve("returning", [MOCK_BAN]);
      // logModAction insert
      mockDb._queueResolve("values", undefined);

      const result = await service.banUser(BAN_USER_DTO, MODERATOR_ID);

      expect(result).toBeDefined();
      expect(result.userId).toBe(OTHER_USER_ID);
      expect(result.isPermanent).toBe(true);
      expect(result.expiresAt).toBeNull();
    });

    it("이미 밴된 사용자 시 ConflictException 발생", async () => {
      // findBan returns existing ban
      mockDb._queueResolve("limit", [MOCK_BAN]);

      await expect(
        service.banUser(BAN_USER_DTO, MODERATOR_ID),
      ).rejects.toThrow(ConflictException);
    });

    it("이미 밴된 사용자 시 에러 메시지 확인", async () => {
      mockDb._queueResolve("limit", [MOCK_BAN]);

      await expect(
        service.banUser(BAN_USER_DTO, MODERATOR_ID),
      ).rejects.toThrow(/이미 차단된 사용자/);
    });

    it("임시 밴 성공 (durationDays 설정)", async () => {
      const tempBanDto = {
        ...BAN_USER_DTO,
        isPermanent: false,
        durationDays: 7,
      };
      const tempBan = {
        ...MOCK_BAN,
        isPermanent: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("returning", [tempBan]);
      mockDb._queueResolve("values", undefined);

      const result = await service.banUser(tempBanDto, MODERATOR_ID);

      expect(result.isPermanent).toBe(false);
      expect(result.expiresAt).toBeDefined();
    });

    it("권한 검증이 호출됨", async () => {
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("returning", [MOCK_BAN]);
      mockDb._queueResolve("values", undefined);

      await service.banUser(BAN_USER_DTO, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("모드 로그가 기록됨", async () => {
      mockDb._queueResolve("limit", []);
      mockDb._queueResolve("returning", [MOCK_BAN]);
      mockDb._queueResolve("values", undefined);

      await service.banUser(BAN_USER_DTO, MODERATOR_ID);

      // insert called twice: ban + mod log
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // unbanUser
  // ============================================================================
  describe("unbanUser", () => {
    it("밴 해제 성공", async () => {
      // assertCommunityPermission is mocked
      // delete ban
      mockDb._queueResolve("where", undefined);
      // logModAction insert
      mockDb._queueResolve("values", undefined);

      await expect(
        service.unbanUser(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID),
      ).resolves.toBeUndefined();

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("권한 검증이 호출됨", async () => {
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("values", undefined);

      await service.unbanUser(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("모드 로그가 기록됨", async () => {
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("values", undefined);

      await service.unbanUser(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // findBan
  // ============================================================================
  describe("findBan", () => {
    it("밴 조회 성공", async () => {
      mockDb._queueResolve("limit", [MOCK_BAN]);

      const result = await service.findBan(COMMUNITY_ID, OTHER_USER_ID);

      expect(result).toBeDefined();
      expect(result!.userId).toBe(OTHER_USER_ID);
      expect(result!.communityId).toBe(COMMUNITY_ID);
    });

    it("밴이 없으면 null 반환", async () => {
      mockDb._queueResolve("limit", []);

      const result = await service.findBan(COMMUNITY_ID, OTHER_USER_ID);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // getBannedUsers
  // ============================================================================
  describe("getBannedUsers", () => {
    it("밴된 사용자 목록 조회 성공", async () => {
      mockDb._queueResolve("orderBy", [MOCK_BAN]);

      const result = await service.getBannedUsers(COMMUNITY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(MOCK_BAN);
    });

    it("밴된 사용자가 없으면 빈 배열 반환", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getBannedUsers(COMMUNITY_ID);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // createRule
  // ============================================================================
  describe("createRule", () => {
    it("규칙 생성 성공", async () => {
      // assertCommunityPermission is mocked
      // insert rule returning
      mockDb._queueResolve("returning", [MOCK_RULE]);
      // logModAction insert
      mockDb._queueResolve("values", undefined);

      const result = await service.createRule(CREATE_RULE_DTO, MODERATOR_ID);

      expect(result).toBeDefined();
      expect(result.title).toBe("Be respectful");
      expect(result.communityId).toBe(COMMUNITY_ID);
    });

    it("권한 검증이 호출됨", async () => {
      mockDb._queueResolve("returning", [MOCK_RULE]);
      mockDb._queueResolve("values", undefined);

      await service.createRule(CREATE_RULE_DTO, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("모드 로그가 기록됨", async () => {
      mockDb._queueResolve("returning", [MOCK_RULE]);
      mockDb._queueResolve("values", undefined);

      await service.createRule(CREATE_RULE_DTO, MODERATOR_ID);

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // getRules
  // ============================================================================
  describe("getRules", () => {
    it("규칙 목록 조회 성공", async () => {
      mockDb._queueResolve("orderBy", [MOCK_RULE]);

      const result = await service.getRules(COMMUNITY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(MOCK_RULE);
    });

    it("규칙이 없으면 빈 배열 반환", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getRules(COMMUNITY_ID);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // createFlair
  // ============================================================================
  describe("createFlair", () => {
    it("플레어 생성 성공", async () => {
      // assertCommunityPermission is mocked
      mockDb._queueResolve("returning", [MOCK_FLAIR]);
      mockDb._queueResolve("values", undefined);

      const result = await service.createFlair(CREATE_FLAIR_DTO, MODERATOR_ID);

      expect(result).toBeDefined();
      expect(result.text).toBe("Discussion");
      expect(result.type).toBe("post");
    });

    it("권한 검증이 호출됨", async () => {
      mockDb._queueResolve("returning", [MOCK_FLAIR]);
      mockDb._queueResolve("values", undefined);

      await service.createFlair(CREATE_FLAIR_DTO, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner", "admin", "moderator"],
      );
    });

    it("모드 로그가 기록됨", async () => {
      mockDb._queueResolve("returning", [MOCK_FLAIR]);
      mockDb._queueResolve("values", undefined);

      await service.createFlair(CREATE_FLAIR_DTO, MODERATOR_ID);

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // getFlairs
  // ============================================================================
  describe("getFlairs", () => {
    it("플레어 목록 조회 성공", async () => {
      mockDb._queueResolve("orderBy", [MOCK_FLAIR]);

      const result = await service.getFlairs(COMMUNITY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(MOCK_FLAIR);
    });

    it("type 필터 적용 (post)", async () => {
      mockDb._queueResolve("orderBy", [MOCK_FLAIR]);

      const result = await service.getFlairs(COMMUNITY_ID, "post");

      expect(result).toBeDefined();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("type 필터 적용 (user)", async () => {
      const userFlair = { ...MOCK_FLAIR, type: "user" as const };
      mockDb._queueResolve("orderBy", [userFlair]);

      const result = await service.getFlairs(COMMUNITY_ID, "user");

      expect(result).toBeDefined();
      expect(result[0]!.type).toBe("user");
    });

    it("플레어가 없으면 빈 배열 반환", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.getFlairs(COMMUNITY_ID);

      expect(result).toEqual([]);
    });

    it("type 없이 전체 조회", async () => {
      mockDb._queueResolve("orderBy", [MOCK_FLAIR]);

      const result = await service.getFlairs(COMMUNITY_ID);

      expect(result).toHaveLength(1);
    });
  });

  // ============================================================================
  // inviteModerator
  // ============================================================================
  describe("inviteModerator", () => {
    it("모더레이터 초대 성공", async () => {
      // communityService.findById is mocked to return MOCK_COMMUNITY
      // assertCommunityPermission is mocked
      mockDb._queueResolve("returning", [MOCK_MODERATOR]);
      mockDb._queueResolve("values", undefined);

      const result = await service.inviteModerator(INVITE_MODERATOR_DTO, MODERATOR_ID);

      expect(result).toBeDefined();
      expect(result.userId).toBe(OTHER_USER_ID);
      expect(result.communityId).toBe(COMMUNITY_ID);
      expect(result.appointedBy).toBe(MODERATOR_ID);
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockCommunityService.findById.mockResolvedValueOnce(null);

      await expect(
        service.inviteModerator(INVITE_MODERATOR_DTO, MODERATOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("존재하지 않는 커뮤니티 시 에러 메시지 확인", async () => {
      mockCommunityService.findById.mockResolvedValueOnce(null);

      await expect(
        service.inviteModerator(INVITE_MODERATOR_DTO, MODERATOR_ID),
      ).rejects.toThrow(/커뮤니티를 찾을 수 없습니다/);
    });

    it("권한 검증이 owner 전용으로 호출됨", async () => {
      mockDb._queueResolve("returning", [MOCK_MODERATOR]);
      mockDb._queueResolve("values", undefined);

      await service.inviteModerator(INVITE_MODERATOR_DTO, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner"],
      );
    });

    it("모드 로그가 기록됨", async () => {
      mockDb._queueResolve("returning", [MOCK_MODERATOR]);
      mockDb._queueResolve("values", undefined);

      await service.inviteModerator(INVITE_MODERATOR_DTO, MODERATOR_ID);

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // removeModerator
  // ============================================================================
  describe("removeModerator", () => {
    it("모더레이터 제거 성공", async () => {
      // communityService.findById is mocked
      // assertCommunityPermission is mocked
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("values", undefined);

      await expect(
        service.removeModerator(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID),
      ).resolves.toBeUndefined();

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("존재하지 않는 커뮤니티 시 NotFoundException 발생", async () => {
      mockCommunityService.findById.mockResolvedValueOnce(null);

      await expect(
        service.removeModerator(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("권한 검증이 owner 전용으로 호출됨", async () => {
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("values", undefined);

      await service.removeModerator(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID);

      expect(mockAssertPermission).toHaveBeenCalledWith(
        expect.anything(),
        MODERATOR_ID,
        COMMUNITY_ID,
        ["owner"],
      );
    });

    it("모드 로그가 기록됨", async () => {
      mockDb._queueResolve("where", undefined);
      mockDb._queueResolve("values", undefined);

      await service.removeModerator(COMMUNITY_ID, OTHER_USER_ID, MODERATOR_ID);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // logModAction
  // ============================================================================
  describe("logModAction", () => {
    it("모드 로그 기록 성공", async () => {
      mockDb._queueResolve("values", undefined);

      await expect(
        service.logModAction({
          communityId: COMMUNITY_ID,
          moderatorId: MODERATOR_ID,
          action: "ban_user",
          targetType: "user",
          targetId: OTHER_USER_ID,
          reason: "Spamming",
        }),
      ).resolves.toBeUndefined();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it("targetType 없이 로그 기록 가능", async () => {
      mockDb._queueResolve("values", undefined);

      await expect(
        service.logModAction({
          communityId: COMMUNITY_ID,
          moderatorId: MODERATOR_ID,
          action: "other",
          reason: "General action",
        }),
      ).resolves.toBeUndefined();
    });

    it("reason 없이 로그 기록 가능", async () => {
      mockDb._queueResolve("values", undefined);

      await expect(
        service.logModAction({
          communityId: COMMUNITY_ID,
          moderatorId: MODERATOR_ID,
          action: "pin_post",
          targetType: "post",
          targetId: TEST_IDS.UUID_3,
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // getModLogs
  // ============================================================================
  describe("getModLogs", () => {
    it("모드 로그 목록 조회 성공", async () => {
      // Promise.all: [items, totalResult]
      mockDb._queueResolve("offset", [MOCK_MOD_LOG]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.getModLogs(COMMUNITY_ID);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it("커스텀 페이지와 limit 적용", async () => {
      mockDb._queueResolve("offset", [MOCK_MOD_LOG]);
      mockDb._queueResolve("where", [{ count: 100 }]);

      const result = await service.getModLogs(COMMUNITY_ID, 2, 10);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it("빈 결과 반환", async () => {
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", [{ count: 0 }]);

      const result = await service.getModLogs(COMMUNITY_ID);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it("hasMore가 올바르게 계산됨 (더 있음)", async () => {
      mockDb._queueResolve("offset", [MOCK_MOD_LOG]);
      mockDb._queueResolve("where", [{ count: 100 }]);

      const result = await service.getModLogs(COMMUNITY_ID, 1, 50);

      expect(result.hasMore).toBe(true);
    });

    it("hasMore가 올바르게 계산됨 (더 없음)", async () => {
      mockDb._queueResolve("offset", [MOCK_MOD_LOG]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.getModLogs(COMMUNITY_ID, 1, 50);

      expect(result.hasMore).toBe(false);
    });

    it("totalResult가 비어있으면 total은 0", async () => {
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", []);

      const result = await service.getModLogs(COMMUNITY_ID);

      expect(result.total).toBe(0);
    });
  });

  // ============================================================================
  // getAllReports (Admin)
  // ============================================================================
  describe("getAllReports", () => {
    it("전체 신고 목록 조회 성공 (status 필터 없음)", async () => {
      mockDb._queueResolve("offset", [MOCK_REPORT]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.getAllReports({ page: 1, limit: 10 });

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it("status 필터 적용", async () => {
      mockDb._queueResolve("offset", [MOCK_REPORT]);
      mockDb._queueResolve("where", [{ count: 1 }]);

      const result = await service.getAllReports({ status: "pending", page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
    });

    it("빈 결과 반환", async () => {
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", [{ count: 0 }]);

      const result = await service.getAllReports({ page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("totalPages 올바르게 계산 (다수 페이지)", async () => {
      mockDb._queueResolve("offset", [MOCK_REPORT]);
      mockDb._queueResolve("where", [{ count: 25 }]);

      const result = await service.getAllReports({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });

    it("totalResult가 비어있으면 total은 0", async () => {
      mockDb._queueResolve("offset", []);
      mockDb._queueResolve("where", []);

      const result = await service.getAllReports({ page: 1, limit: 10 });

      expect(result.total).toBe(0);
    });
  });

  // ============================================================================
  // getReportStats (Admin)
  // ============================================================================
  describe("getReportStats", () => {
    it("신고 통계 조회 성공", async () => {
      mockDb._queueResolve("groupBy", [
        { status: "pending", count: 5 },
        { status: "resolved", count: 10 },
        { status: "dismissed", count: 3 },
      ]);

      const result = await service.getReportStats();

      expect(result).toEqual({
        pending: 5,
        reviewing: 0,
        resolved: 10,
        dismissed: 3,
      });
    });

    it("신고가 없으면 모든 값 0 반환", async () => {
      mockDb._queueResolve("groupBy", []);

      const result = await service.getReportStats();

      expect(result).toEqual({
        pending: 0,
        reviewing: 0,
        resolved: 0,
        dismissed: 0,
      });
    });

    it("reviewing 통계 포함", async () => {
      mockDb._queueResolve("groupBy", [
        { status: "reviewing", count: 7 },
      ]);

      const result = await service.getReportStats();

      expect(result.reviewing).toBe(7);
      expect(result.pending).toBe(0);
    });

    it("알 수 없는 status는 무시", async () => {
      mockDb._queueResolve("groupBy", [
        { status: "pending", count: 5 },
        { status: "unknown_status", count: 99 },
      ]);

      const result = await service.getReportStats();

      expect(result.pending).toBe(5);
      expect(result).not.toHaveProperty("unknown_status");
    });
  });
});
