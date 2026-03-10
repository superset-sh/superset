import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { TEST_DATES, TEST_IDS, TEST_USER, createMockDb } from "../../__test-utils__";
import type { RemoveVoteDto, VoteDto } from "../dto";
import { CommunityVoteService } from "./community-vote.service";

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  sql: jest.fn((strings: any, ...values: any[]) => ({
    strings,
    values,
    type: "sql",
  })),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = require("@nestjs/common");
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    communityVotes: {
      id: { name: "id" },
      userId: { name: "user_id" },
      targetType: { name: "target_type" },
      targetId: { name: "target_id" },
      vote: { name: "vote" },
      createdAt: { name: "created_at" },
      updatedAt: { name: "updated_at" },
    },
    communityPosts: {
      id: { name: "id" },
      communityId: { name: "community_id" },
      authorId: { name: "author_id" },
      title: { name: "title" },
      content: { name: "content" },
      type: { name: "type" },
      status: { name: "status" },
      upvoteCount: { name: "upvote_count" },
      downvoteCount: { name: "downvote_count" },
      voteScore: { name: "vote_score" },
      hotScore: { name: "hot_score" },
      createdAt: { name: "created_at" },
    },
    communityComments: {
      id: { name: "id" },
      postId: { name: "post_id" },
      authorId: { name: "author_id" },
      content: { name: "content" },
      upvoteCount: { name: "upvote_count" },
      downvoteCount: { name: "downvote_count" },
      voteScore: { name: "vote_score" },
      createdAt: { name: "created_at" },
    },
    userKarma: {
      userId: { name: "user_id" },
      postKarma: { name: "post_karma" },
      commentKarma: { name: "comment_karma" },
      totalKarma: { name: "total_karma" },
      updatedAt: { name: "updated_at" },
    },
  };
});

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ============================================================================
// Test Constants
// ============================================================================

const AUTHOR_ID = TEST_IDS.UUID_2;
const POST_ID = TEST_IDS.UUID_1;
const COMMENT_ID = TEST_IDS.UUID_3;
const VOTE_ID = TEST_IDS.UUID_4;
const COMMUNITY_ID = TEST_IDS.UUID_5;

const MOCK_POST = {
  id: POST_ID,
  communityId: COMMUNITY_ID,
  authorId: AUTHOR_ID,
  title: "Test Post",
  content: "Test content",
  voteScore: 5,
  upvoteCount: 7,
  downvoteCount: 2,
  hotScore: 100,
  createdAt: TEST_DATES.CREATED,
};

const MOCK_COMMENT = {
  id: COMMENT_ID,
  postId: POST_ID,
  authorId: AUTHOR_ID,
  content: "Test comment",
  voteScore: 3,
  upvoteCount: 4,
  downvoteCount: 1,
  createdAt: TEST_DATES.CREATED,
};

const MOCK_UPVOTE = {
  id: VOTE_ID,
  userId: TEST_USER.id,
  targetType: "post" as const,
  targetId: POST_ID,
  vote: 1,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.CREATED,
};

const MOCK_DOWNVOTE = {
  id: VOTE_ID,
  userId: TEST_USER.id,
  targetType: "post" as const,
  targetId: POST_ID,
  vote: -1,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.CREATED,
};

const MOCK_COMMENT_UPVOTE = {
  id: VOTE_ID,
  userId: TEST_USER.id,
  targetType: "comment" as const,
  targetId: COMMENT_ID,
  vote: 1,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.CREATED,
};

describe("CommunityVoteService", () => {
  let service: CommunityVoteService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityVoteService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<CommunityVoteService>(CommunityVoteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // vote — New upvote on post
  // ============================================================================
  describe("vote — new upvote on post", () => {
    it("기존 투표 없이 upvote하면 새 투표를 생성하고 점수를 +1 증가시킨다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote — returns chain (no returning)
      // updateVoteScore for post — update chain
      // hot score recalculation — select post after update
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 6 }]);
      // hot score update — update chain

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum: select({}).from().where() — resolves at "where"
      mockDb._queueResolve("where", [{ total: 6 }]);
      // comment karma sum: select({}).from().where() — resolves at "where"
      mockDb._queueResolve("where", [{ total: 0 }]);
      // upsert karma — onConflictDoUpdate chain

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [{ ...MOCK_UPVOTE }]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 6, upvoteCount: 8 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(6);
      expect(result.upvoteCount).toBe(8);
      expect(result.userVote).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // vote — New downvote on post
  // ============================================================================
  describe("vote — new downvote on post", () => {
    it("기존 투표 없이 downvote하면 새 투표를 생성하고 점수를 -1 감소시킨다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: -1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore for post — update chain
      // hot score recalculation — select post after update
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 4 }]);
      // hot score update

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 4 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [{ ...MOCK_UPVOTE, vote: -1 }]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 4, downvoteCount: 3 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(4);
      expect(result.downvoteCount).toBe(3);
      expect(result.userVote).toBe(-1);
    });
  });

  // ============================================================================
  // vote — Same vote (no-op)
  // ============================================================================
  describe("vote — same vote (no-op)", () => {
    it("같은 방향의 투표가 이미 존재하면 업데이트하지 않고 현재 결과를 반환한다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: 1 };

      // findVote — existing upvote found
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);

      // getVoteResult (called because same vote) — findVote
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(MOCK_POST.voteScore);
      expect(result.userVote).toBe(1);
      // update should NOT have been called for the vote itself
      // (only select & return)
    });

    it("같은 방향의 downvote가 이미 존재하면 그대로 반환한다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: -1 };

      // findVote — existing downvote found
      mockDb._queueResolve("limit", [MOCK_DOWNVOTE]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_DOWNVOTE]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(MOCK_POST.voteScore);
      expect(result.userVote).toBe(-1);
    });
  });

  // ============================================================================
  // vote — Flip upvote to downvote
  // ============================================================================
  describe("vote — flip upvote to downvote", () => {
    it("upvote에서 downvote로 전환하면 점수가 -2 변경된다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: -1 };

      // findVote — existing upvote
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);

      // update vote value — chain

      // updateVoteScore: scoreDelta = -1 * 2 = -2, flipUp = -1, flipDown = 1
      // hot score recalculation — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 3 }]);
      // hot score update

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 3 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [{ ...MOCK_UPVOTE, vote: -1 }]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [
        { ...MOCK_POST, voteScore: 3, upvoteCount: 6, downvoteCount: 3 },
      ]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(3);
      expect(result.upvoteCount).toBe(6);
      expect(result.downvoteCount).toBe(3);
      expect(result.userVote).toBe(-1);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // vote — Flip downvote to upvote
  // ============================================================================
  describe("vote — flip downvote to upvote", () => {
    it("downvote에서 upvote로 전환하면 점수가 +2 변경된다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: 1 };

      // findVote — existing downvote
      mockDb._queueResolve("limit", [MOCK_DOWNVOTE]);

      // update vote value — chain

      // updateVoteScore: scoreDelta = 1 * 2 = 2, flipUp = 1, flipDown = -1
      // hot score recalculation — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 7 }]);
      // hot score update

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 7 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [{ ...MOCK_DOWNVOTE, vote: 1 }]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [
        { ...MOCK_POST, voteScore: 7, upvoteCount: 8, downvoteCount: 1 },
      ]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(7);
      expect(result.upvoteCount).toBe(8);
      expect(result.downvoteCount).toBe(1);
      expect(result.userVote).toBe(1);
    });
  });

  // ============================================================================
  // vote — New upvote on comment
  // ============================================================================
  describe("vote — new upvote on comment", () => {
    it("댓글에 upvote하면 댓글 점수가 업데이트된다", async () => {
      const dto: VoteDto = { targetType: "comment", targetId: COMMENT_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote
      // updateVoteScore for comment — update chain (no hot score for comments)

      // updateKarma — find comment author
      mockDb._queueResolve("limit", [MOCK_COMMENT]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 4 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_COMMENT_UPVOTE]);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [{ ...MOCK_COMMENT, voteScore: 4, upvoteCount: 5 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(4);
      expect(result.upvoteCount).toBe(5);
      expect(result.userVote).toBe(1);
    });
  });

  // ============================================================================
  // vote — New downvote on comment
  // ============================================================================
  describe("vote — new downvote on comment", () => {
    it("댓글에 downvote하면 댓글 점수가 감소한다", async () => {
      const dto: VoteDto = { targetType: "comment", targetId: COMMENT_ID, vote: -1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote
      // updateVoteScore for comment — update chain

      // updateKarma — find comment author
      mockDb._queueResolve("limit", [MOCK_COMMENT]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 2 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [{ ...MOCK_COMMENT_UPVOTE, vote: -1 }]);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [{ ...MOCK_COMMENT, voteScore: 2, downvoteCount: 2 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(2);
      expect(result.downvoteCount).toBe(2);
      expect(result.userVote).toBe(-1);
    });
  });

  // ============================================================================
  // vote — Flip vote on comment
  // ============================================================================
  describe("vote — flip vote on comment", () => {
    it("댓글 upvote를 downvote로 전환하면 점수가 -2 변경된다", async () => {
      const dto: VoteDto = { targetType: "comment", targetId: COMMENT_ID, vote: -1 };

      // findVote — existing upvote on comment
      mockDb._queueResolve("limit", [MOCK_COMMENT_UPVOTE]);

      // update vote value

      // updateVoteScore for comment — update chain (no hot score recalc)

      // updateKarma — find comment author
      mockDb._queueResolve("limit", [MOCK_COMMENT]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 1 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [{ ...MOCK_COMMENT_UPVOTE, vote: -1 }]);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [
        { ...MOCK_COMMENT, voteScore: 1, upvoteCount: 3, downvoteCount: 2 },
      ]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(1);
      expect(result.userVote).toBe(-1);
    });
  });

  // ============================================================================
  // removeVote — Remove existing upvote from post
  // ============================================================================
  describe("removeVote — remove existing upvote from post", () => {
    it("기존 upvote를 삭제하면 점수가 -1 감소하고 userVote가 null이 된다", async () => {
      const dto: RemoveVoteDto = { targetType: "post", targetId: POST_ID };

      // findVote — existing upvote
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);

      // delete vote — chain

      // updateVoteScore: scoreDelta = -1, removeUp = -1, removeDown = 0
      // hot score recalculation — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 4 }]);
      // hot score update

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 4 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);

      // getVoteResult — findVote (no vote anymore)
      mockDb._queueResolve("limit", []);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 4, upvoteCount: 6 }]);

      const result = await service.removeVote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(4);
      expect(result.upvoteCount).toBe(6);
      expect(result.userVote).toBeNull();
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // removeVote — Remove existing downvote from post
  // ============================================================================
  describe("removeVote — remove existing downvote from post", () => {
    it("기존 downvote를 삭제하면 점수가 +1 증가한다", async () => {
      const dto: RemoveVoteDto = { targetType: "post", targetId: POST_ID };

      // findVote — existing downvote
      mockDb._queueResolve("limit", [MOCK_DOWNVOTE]);

      // delete vote

      // updateVoteScore: scoreDelta = 1, removeUp = 0, removeDown = -1
      // hot score recalculation — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 6 }]);
      // hot score update

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 6 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", []);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 6, downvoteCount: 1 }]);

      const result = await service.removeVote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(6);
      expect(result.downvoteCount).toBe(1);
      expect(result.userVote).toBeNull();
    });
  });

  // ============================================================================
  // removeVote — Remove upvote from comment
  // ============================================================================
  describe("removeVote — remove upvote from comment", () => {
    it("댓글의 기존 upvote를 삭제하면 점수가 감소한다", async () => {
      const dto: RemoveVoteDto = { targetType: "comment", targetId: COMMENT_ID };

      // findVote — existing upvote on comment
      mockDb._queueResolve("limit", [MOCK_COMMENT_UPVOTE]);

      // delete vote

      // updateVoteScore for comment — update chain (no hot score)

      // updateKarma — find comment author
      mockDb._queueResolve("limit", [MOCK_COMMENT]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 2 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", []);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [{ ...MOCK_COMMENT, voteScore: 2, upvoteCount: 3 }]);

      const result = await service.removeVote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(2);
      expect(result.upvoteCount).toBe(3);
      expect(result.userVote).toBeNull();
    });
  });

  // ============================================================================
  // removeVote — No existing vote
  // ============================================================================
  describe("removeVote — no existing vote", () => {
    it("기존 투표가 없으면 삭제 없이 현재 상태를 반환한다", async () => {
      const dto: RemoveVoteDto = { targetType: "post", targetId: POST_ID };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // getVoteResult — findVote (still no vote)
      mockDb._queueResolve("limit", []);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [MOCK_POST]);

      const result = await service.removeVote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(MOCK_POST.voteScore);
      expect(result.userVote).toBeNull();
      // delete should not have been called
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // vote — Karma update when author not found
  // ============================================================================
  describe("vote — karma update when author not found", () => {
    it("대상 게시물/댓글의 작성자를 찾을 수 없으면 karma 업데이트를 건너뛴다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore — hot score recalculation select
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 6, authorId: undefined }]);

      // updateKarma — find post author (not found / no authorId)
      mockDb._queueResolve("limit", []);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 6, upvoteCount: 8 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(6);
      expect(result.userVote).toBe(1);
    });
  });

  // ============================================================================
  // vote — VoteResult with no post found in getVoteResult
  // ============================================================================
  describe("vote — getVoteResult when target not found", () => {
    it("getVoteResult에서 대상을 찾을 수 없으면 기본값 0을 반환한다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore — hot score recalculation select
      mockDb._queueResolve("limit", []);

      // updateKarma — find post author (not found)
      mockDb._queueResolve("limit", []);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);
      // getVoteResult — select post (not found)
      mockDb._queueResolve("limit", []);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(0);
      expect(result.upvoteCount).toBe(0);
      expect(result.downvoteCount).toBe(0);
      expect(result.userVote).toBe(1);
    });
  });

  // ============================================================================
  // vote — Comment getVoteResult returns comment scores
  // ============================================================================
  describe("vote — getVoteResult for comment", () => {
    it("댓글에 대한 결과 조회 시 댓글 점수를 반환한다", async () => {
      const dto: VoteDto = { targetType: "comment", targetId: COMMENT_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore for comment (no hot score)

      // updateKarma — find comment author
      mockDb._queueResolve("limit", [MOCK_COMMENT]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 4 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_COMMENT_UPVOTE]);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [MOCK_COMMENT]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(MOCK_COMMENT.voteScore);
      expect(result.upvoteCount).toBe(MOCK_COMMENT.upvoteCount);
      expect(result.downvoteCount).toBe(MOCK_COMMENT.downvoteCount);
      expect(result.userVote).toBe(1);
    });
  });

  // ============================================================================
  // vote — getVoteResult for comment when comment not found
  // ============================================================================
  describe("vote — getVoteResult for comment not found", () => {
    it("댓글을 찾을 수 없으면 기본값 0을 반환한다", async () => {
      const dto: VoteDto = { targetType: "comment", targetId: COMMENT_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore for comment

      // updateKarma — find comment author (not found)
      mockDb._queueResolve("limit", []);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_COMMENT_UPVOTE]);
      // getVoteResult — select comment (not found)
      mockDb._queueResolve("limit", []);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(0);
      expect(result.upvoteCount).toBe(0);
      expect(result.downvoteCount).toBe(0);
      expect(result.userVote).toBe(1);
    });
  });

  // ============================================================================
  // removeVote — Comment with no existing vote
  // ============================================================================
  describe("removeVote — comment with no existing vote", () => {
    it("댓글에 기존 투표가 없으면 삭제 없이 현재 상태를 반환한다", async () => {
      const dto: RemoveVoteDto = { targetType: "comment", targetId: COMMENT_ID };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", []);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [MOCK_COMMENT]);

      const result = await service.removeVote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(MOCK_COMMENT.voteScore);
      expect(result.userVote).toBeNull();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // vote — Karma upsert uses correct values
  // ============================================================================
  describe("vote — karma upsert", () => {
    it("karma 업데이트 시 postKarma와 commentKarma를 합산하여 totalKarma를 계산한다", async () => {
      const dto: VoteDto = { targetType: "post", targetId: POST_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore — hot score recalculation select
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 10 }]);

      // updateKarma — find post author
      mockDb._queueResolve("limit", [MOCK_POST]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 10 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 5 }]);
      // upsert karma — onConflictDoUpdate

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_UPVOTE]);
      // getVoteResult — select post
      mockDb._queueResolve("limit", [{ ...MOCK_POST, voteScore: 10 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(10);
      // Verify insert was called for karma upsert
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // vote — Hot score not calculated for comments
  // ============================================================================
  describe("vote — hot score not calculated for comments", () => {
    it("댓글에 투표해도 hot score 재계산이 실행되지 않는다", async () => {
      const dto: VoteDto = { targetType: "comment", targetId: COMMENT_ID, vote: 1 };

      // findVote — no existing vote
      mockDb._queueResolve("limit", []);

      // insert new vote

      // updateVoteScore for comment — no hot score select/update

      // updateKarma — find comment author
      mockDb._queueResolve("limit", [MOCK_COMMENT]);
      // post karma sum
      mockDb._queueResolve("where", [{ total: 0 }]);
      // comment karma sum
      mockDb._queueResolve("where", [{ total: 4 }]);

      // getVoteResult — findVote
      mockDb._queueResolve("limit", [MOCK_COMMENT_UPVOTE]);
      // getVoteResult — select comment
      mockDb._queueResolve("limit", [{ ...MOCK_COMMENT, voteScore: 4 }]);

      const result = await service.vote(dto, TEST_USER.id);

      expect(result.voteScore).toBe(4);
      // For comment votes, the db.select from communityPosts for hot score
      // should not be called in the updateVoteScore path
    });
  });
});
