import { Injectable, Inject } from "@nestjs/common";
import { eq, and, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  communityVotes,
  communityPosts,
  communityComments,
  userKarma,
  type CommunityVote,
} from "@superbuilder/drizzle";
import type { VoteDto, RemoveVoteDto } from "../dto";

export interface VoteResult {
  voteScore: number;
  upvoteCount: number;
  downvoteCount: number;
  userVote: number | null;
}

@Injectable()
export class CommunityVoteService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>) {}

  /**
   * 투표하기
   */
  async vote(dto: VoteDto, userId: string): Promise<VoteResult> {
    // 기존 투표 확인
    const existingVote = await this.findVote(userId, dto.targetType, dto.targetId);

    if (existingVote) {
      // 같은 투표면 무시
      if (existingVote.vote === dto.vote) {
        return this.getVoteResult(dto.targetType, dto.targetId, userId);
      }

      // 다른 투표면 업데이트
      await this.db
        .update(communityVotes)
        .set({
          vote: dto.vote,
          updatedAt: new Date(),
        })
        .where(eq(communityVotes.id, existingVote.id));

      // 투표 점수 업데이트 (flip: up↔down)
      const flipUp = dto.vote === 1 ? 1 : -1;
      const flipDown = dto.vote === -1 ? 1 : -1;
      await this.updateVoteScore(dto.targetType, dto.targetId, dto.vote * 2, flipUp, flipDown);
    } else {
      // 새로운 투표
      await this.db.insert(communityVotes).values({
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        vote: dto.vote,
      });

      // 투표 점수 업데이트 (new: only increment the relevant count)
      const newUp = dto.vote === 1 ? 1 : 0;
      const newDown = dto.vote === -1 ? 1 : 0;
      await this.updateVoteScore(dto.targetType, dto.targetId, dto.vote, newUp, newDown);
    }

    // Karma 업데이트
    await this.updateKarma(dto.targetType, dto.targetId, userId);

    return this.getVoteResult(dto.targetType, dto.targetId, userId);
  }

  /**
   * 투표 취소
   */
  async removeVote(dto: RemoveVoteDto, userId: string): Promise<VoteResult> {
    const existingVote = await this.findVote(userId, dto.targetType, dto.targetId);

    if (existingVote) {
      await this.db
        .delete(communityVotes)
        .where(
          and(
            eq(communityVotes.userId, userId),
            eq(communityVotes.targetType, dto.targetType),
            eq(communityVotes.targetId, dto.targetId)
          )
        );

      // 투표 점수 복원
      const removeUp = existingVote.vote === 1 ? -1 : 0;
      const removeDown = existingVote.vote === -1 ? -1 : 0;
      await this.updateVoteScore(dto.targetType, dto.targetId, -existingVote.vote, removeUp, removeDown);

      // Karma 업데이트
      await this.updateKarma(dto.targetType, dto.targetId, userId);
    }

    return this.getVoteResult(dto.targetType, dto.targetId, userId);
  }

  /**
   * 기존 투표 조회
   */
  private async findVote(
    userId: string,
    targetType: "post" | "comment",
    targetId: string
  ): Promise<CommunityVote | null> {
    const [result] = await this.db
      .select()
      .from(communityVotes)
      .where(
        and(
          eq(communityVotes.userId, userId),
          eq(communityVotes.targetType, targetType),
          eq(communityVotes.targetId, targetId)
        )
      )
      .limit(1);

    return (result as CommunityVote) ?? null;
  }

  /**
   * 투표 점수 업데이트
   * @param scoreDelta - voteScore 변경량
   * @param upDelta - upvoteCount 변경량
   * @param downDelta - downvoteCount 변경량
   */
  private async updateVoteScore(
    targetType: "post" | "comment",
    targetId: string,
    scoreDelta: number,
    upDelta: number,
    downDelta: number,
  ): Promise<void> {
    if (targetType === "post") {
      await this.db
        .update(communityPosts)
        .set({
          upvoteCount: sql`GREATEST(0, ${communityPosts.upvoteCount} + ${upDelta})`,
          downvoteCount: sql`GREATEST(0, ${communityPosts.downvoteCount} + ${downDelta})`,
          voteScore: sql`${communityPosts.voteScore} + ${scoreDelta}`,
        })
        .where(eq(communityPosts.id, targetId));

      // Hot score 재계산
      const [post] = await this.db
        .select()
        .from(communityPosts)
        .where(eq(communityPosts.id, targetId))
        .limit(1);

      if (post) {
        const hotScore = this.calculateHotScore(post.voteScore, post.createdAt);
        await this.db
          .update(communityPosts)
          .set({ hotScore })
          .where(eq(communityPosts.id, targetId));
      }
    } else {
      await this.db
        .update(communityComments)
        .set({
          upvoteCount: sql`GREATEST(0, ${communityComments.upvoteCount} + ${upDelta})`,
          downvoteCount: sql`GREATEST(0, ${communityComments.downvoteCount} + ${downDelta})`,
          voteScore: sql`${communityComments.voteScore} + ${scoreDelta}`,
        })
        .where(eq(communityComments.id, targetId));
    }
  }

  /**
   * Karma 업데이트
   */
  private async updateKarma(
    targetType: "post" | "comment",
    targetId: string,
    _voterId: string
  ): Promise<void> {
    // 대상 작성자 찾기
    let authorId: string | undefined;

    if (targetType === "post") {
      const [post] = await this.db
        .select()
        .from(communityPosts)
        .where(eq(communityPosts.id, targetId))
        .limit(1);
      authorId = post?.authorId;
    } else {
      const [comment] = await this.db
        .select()
        .from(communityComments)
        .where(eq(communityComments.id, targetId))
        .limit(1);
      authorId = comment?.authorId;
    }

    if (!authorId) return;

    // 작성자의 모든 게시물/댓글 karma 재계산
    const [posts] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${communityPosts.voteScore}), 0)`,
      })
      .from(communityPosts)
      .where(eq(communityPosts.authorId, authorId));

    const [comments] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${communityComments.voteScore}), 0)`,
      })
      .from(communityComments)
      .where(eq(communityComments.authorId, authorId));

    const postKarma = Number(posts?.total ?? 0);
    const commentKarma = Number(comments?.total ?? 0);
    const totalKarma = postKarma + commentKarma;

    // Upsert karma
    await this.db
      .insert(userKarma)
      .values({
        userId: authorId,
        postKarma,
        commentKarma,
        totalKarma,
      })
      .onConflictDoUpdate({
        target: userKarma.userId,
        set: {
          postKarma,
          commentKarma,
          totalKarma,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * 투표 결과 조회
   */
  private async getVoteResult(
    targetType: "post" | "comment",
    targetId: string,
    userId: string
  ): Promise<VoteResult> {
    const userVote = await this.findVote(userId, targetType, targetId);

    if (targetType === "post") {
      const [post] = await this.db
        .select()
        .from(communityPosts)
        .where(eq(communityPosts.id, targetId))
        .limit(1);

      return {
        voteScore: post?.voteScore ?? 0,
        upvoteCount: post?.upvoteCount ?? 0,
        downvoteCount: post?.downvoteCount ?? 0,
        userVote: userVote?.vote ?? null,
      };
    } else {
      const [comment] = await this.db
        .select()
        .from(communityComments)
        .where(eq(communityComments.id, targetId))
        .limit(1);

      return {
        voteScore: comment?.voteScore ?? 0,
        upvoteCount: comment?.upvoteCount ?? 0,
        downvoteCount: comment?.downvoteCount ?? 0,
        userVote: userVote?.vote ?? null,
      };
    }
  }

  /**
   * Hot Score 계산 (Reddit 알고리즘)
   */
  private calculateHotScore(voteScore: number, createdAt: Date): number {
    const score = voteScore;
    const order = Math.log10(Math.max(Math.abs(score), 1));
    const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
    const seconds = (createdAt.getTime() - new Date("2005-12-08").getTime()) / 1000;

    return sign * order + seconds / 45000;
  }
}
