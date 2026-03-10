/**
 * Content Studio 에이전트 도구
 *
 * 콘텐츠 스튜디오의 스튜디오/토픽/콘텐츠/엣지/SEO/브랜드보이스를
 * AI 에이전트가 조회·생성·수정할 수 있도록 제공합니다.
 *
 * LLM 의존 기능(키워드 추천, 리퍼포징 등)은 에이전트 자체가 수행하므로
 * 여기서는 데이터 읽기/쓰기 도구만 노출합니다.
 */
import { tool } from "ai";
import { z } from "zod";
import { eq, and, desc, ilike } from "drizzle-orm";
import {
  studioStudios,
  studioTopics,
  studioContents,
  studioContentSeo,
  studioEdges,
  studioBrandProfiles,
  studioTonePresets,
} from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const contentStudioTools = {
  // ========================================================================
  // Studio — 조회
  // ========================================================================

  "studio.list": tool({
    description:
      "콘텐츠 스튜디오 목록을 조회합니다. 사용자의 모든 스튜디오를 반환합니다.",
    parameters: z.object({
      ownerId: z.string().uuid().describe("스튜디오 소유자(사용자) ID"),
    }),
    execute: async ({ ownerId }) => {
      const studios = await db.query.studioStudios.findMany({
        where: and(
          eq(studioStudios.ownerId, ownerId),
          eq(studioStudios.isDeleted, false),
        ),
        orderBy: [desc(studioStudios.updatedAt)],
        columns: {
          id: true,
          title: true,
          description: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return studios;
    },
  }),

  "studio.getCanvas": tool({
    description:
      "스튜디오의 캔버스 데이터를 조회합니다. 모든 토픽, 콘텐츠, 엣지를 포함하여 전체 구조를 파악할 수 있습니다.",
    parameters: z.object({
      studioId: z.string().uuid().describe("스튜디오 ID"),
    }),
    execute: async ({ studioId }) => {
      const [topics, contents, edges] = await Promise.all([
        db.query.studioTopics.findMany({
          where: eq(studioTopics.studioId, studioId),
          columns: {
            id: true,
            label: true,
            color: true,
            positionX: true,
            positionY: true,
          },
        }),
        db.query.studioContents.findMany({
          where: and(
            eq(studioContents.studioId, studioId),
            eq(studioContents.isDeleted, false),
          ),
          columns: {
            id: true,
            title: true,
            status: true,
            topicId: true,
            summary: true,
            label: true,
            positionX: true,
            positionY: true,
            createdAt: true,
          },
        }),
        db.query.studioEdges.findMany({
          where: eq(studioEdges.studioId, studioId),
          columns: {
            id: true,
            sourceId: true,
            sourceType: true,
            targetId: true,
            targetType: true,
          },
        }),
      ]);

      return { topics, contents, edges };
    },
  }),

  // ========================================================================
  // Content — 조회
  // ========================================================================

  "content.get": tool({
    description:
      "콘텐츠 상세 정보를 조회합니다. 본문, SEO 메타데이터, 상태 등 전체 데이터를 반환합니다.",
    parameters: z.object({
      contentId: z.string().uuid().describe("콘텐츠 ID"),
    }),
    execute: async ({ contentId }) => {
      const content = await db.query.studioContents.findFirst({
        where: and(
          eq(studioContents.id, contentId),
          eq(studioContents.isDeleted, false),
        ),
        with: {
          topic: { columns: { id: true, label: true } },
          seoHistory: {
            orderBy: [desc(studioContentSeo.snapshotAt)],
            limit: 1,
            columns: {
              seoTitle: true,
              seoDescription: true,
              seoKeywords: true,
              seoScore: true,
            },
          },
        },
      });
      if (!content) return { error: "콘텐츠를 찾을 수 없습니다." };
      return content;
    },
  }),

  "content.search": tool({
    description:
      "스튜디오 내 콘텐츠를 제목으로 검색합니다. 상태 필터도 가능합니다.",
    parameters: z.object({
      studioId: z.string().uuid().describe("스튜디오 ID"),
      query: z.string().optional().describe("제목 검색어 (선택)"),
      status: z
        .enum(["draft", "writing", "review", "published", "canceled"])
        .optional()
        .describe("상태 필터 (선택)"),
      limit: z.number().max(30).default(15),
    }),
    execute: async ({ studioId, query, status, limit }) => {
      const conditions = [
        eq(studioContents.studioId, studioId),
        eq(studioContents.isDeleted, false),
      ];
      if (query) conditions.push(ilike(studioContents.title, `%${query}%`));
      if (status) conditions.push(eq(studioContents.status, status));

      const contents = await db.query.studioContents.findMany({
        where: and(...conditions),
        limit,
        orderBy: [desc(studioContents.createdAt)],
        columns: {
          id: true,
          title: true,
          status: true,
          summary: true,
          topicId: true,
          label: true,
          scheduledAt: true,
          createdAt: true,
        },
      });
      return contents;
    },
  }),

  // ========================================================================
  // Content — 쓰기
  // ========================================================================

  "content.create": tool({
    description:
      "새 콘텐츠를 생성합니다. 스튜디오 ID와 제목은 필수이며, 본문·토픽·위치를 지정할 수 있습니다.",
    parameters: z.object({
      studioId: z.string().uuid().describe("스튜디오 ID"),
      authorId: z.string().uuid().describe("작성자(사용자) ID"),
      title: z.string().min(1).max(300).describe("콘텐츠 제목"),
      content: z.string().optional().describe("본문 (마크다운)"),
      summary: z.string().optional().describe("요약"),
      topicId: z.string().uuid().optional().describe("연결할 토픽 ID"),
      status: z
        .enum(["draft", "writing", "review", "published"])
        .default("draft")
        .describe("상태"),
      label: z.string().max(50).optional().describe("라벨 (선택)"),
      positionX: z.number().default(0).describe("캔버스 X 좌표"),
      positionY: z.number().default(0).describe("캔버스 Y 좌표"),
    }),
    execute: async (input) => {
      const [created] = await db
        .insert(studioContents)
        .values({
          studioId: input.studioId,
          authorId: input.authorId,
          title: input.title,
          content: input.content,
          summary: input.summary,
          topicId: input.topicId,
          status: input.status,
          label: input.label,
          positionX: input.positionX,
          positionY: input.positionY,
        })
        .returning({
          id: studioContents.id,
          title: studioContents.title,
          status: studioContents.status,
        });
      return created;
    },
  }),

  "content.update": tool({
    description:
      "콘텐츠를 수정합니다. 제목, 본문, 요약, 상태, SEO 슬러그 등을 업데이트할 수 있습니다.",
    parameters: z.object({
      contentId: z.string().uuid().describe("콘텐츠 ID"),
      title: z.string().min(1).max(300).optional().describe("제목"),
      content: z.string().optional().describe("본문 (마크다운)"),
      summary: z.string().optional().describe("요약"),
      status: z
        .enum(["draft", "writing", "review", "published", "canceled"])
        .optional()
        .describe("상태"),
      topicId: z.string().uuid().nullable().optional().describe("토픽 ID"),
      label: z.string().max(50).nullable().optional().describe("라벨"),
      slug: z.string().max(300).nullable().optional().describe("SEO 슬러그"),
      thumbnailUrl: z.string().nullable().optional().describe("썸네일 URL"),
    }),
    execute: async ({ contentId, ...data }) => {
      // undefined 값 제거
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );

      if (Object.keys(updateData).length === 0) {
        return { error: "수정할 항목이 없습니다." };
      }

      const [updated] = await db
        .update(studioContents)
        .set(updateData)
        .where(eq(studioContents.id, contentId))
        .returning({
          id: studioContents.id,
          title: studioContents.title,
          status: studioContents.status,
        });

      if (!updated) return { error: "콘텐츠를 찾을 수 없습니다." };
      return updated;
    },
  }),

  // ========================================================================
  // Topic — 쓰기
  // ========================================================================

  "topic.create": tool({
    description:
      "새 토픽(주제 노드)을 생성합니다. 캔버스에 주제를 추가합니다.",
    parameters: z.object({
      studioId: z.string().uuid().describe("스튜디오 ID"),
      label: z.string().min(1).max(100).describe("토픽 이름"),
      color: z.string().max(20).optional().describe("색상 코드 (선택)"),
      positionX: z.number().default(0).describe("캔버스 X 좌표"),
      positionY: z.number().default(0).describe("캔버스 Y 좌표"),
    }),
    execute: async (input) => {
      const [created] = await db
        .insert(studioTopics)
        .values(input)
        .returning({
          id: studioTopics.id,
          label: studioTopics.label,
        });
      return created;
    },
  }),

  // ========================================================================
  // Edge — 쓰기
  // ========================================================================

  "edge.create": tool({
    description:
      "노드 간 연결(엣지)을 생성합니다. 토픽↔콘텐츠, 콘텐츠↔콘텐츠 등 관계를 설정합니다.",
    parameters: z.object({
      studioId: z.string().uuid().describe("스튜디오 ID"),
      sourceId: z.string().uuid().describe("출발 노드 ID"),
      sourceType: z.enum(["topic", "content"]).describe("출발 노드 타입"),
      targetId: z.string().uuid().describe("도착 노드 ID"),
      targetType: z.enum(["topic", "content"]).describe("도착 노드 타입"),
    }),
    execute: async (input) => {
      const [created] = await db
        .insert(studioEdges)
        .values(input)
        .returning({
          id: studioEdges.id,
          sourceId: studioEdges.sourceId,
          targetId: studioEdges.targetId,
        });
      return created;
    },
  }),

  // ========================================================================
  // SEO — 읽기/쓰기
  // ========================================================================

  "seo.getHistory": tool({
    description:
      "콘텐츠의 SEO 이력(스냅샷)을 조회합니다. 키워드, 점수, 트래픽 등을 확인합니다.",
    parameters: z.object({
      contentId: z.string().uuid().describe("콘텐츠 ID"),
      limit: z.number().max(20).default(5),
    }),
    execute: async ({ contentId, limit }) => {
      const history = await db.query.studioContentSeo.findMany({
        where: eq(studioContentSeo.contentId, contentId),
        orderBy: [desc(studioContentSeo.snapshotAt)],
        limit,
        columns: {
          id: true,
          seoTitle: true,
          seoDescription: true,
          seoKeywords: true,
          seoScore: true,
          pageViews: true,
          uniqueVisitors: true,
          avgTimeOnPage: true,
          bounceRate: true,
          snapshotAt: true,
        },
      });
      return history;
    },
  }),

  "seo.addSnapshot": tool({
    description:
      "콘텐츠에 SEO 메타데이터 스냅샷을 추가합니다. 키워드, 제목, 설명, OG 이미지 등을 저장합니다.",
    parameters: z.object({
      contentId: z.string().uuid().describe("콘텐츠 ID"),
      seoTitle: z.string().max(200).optional().describe("SEO 제목"),
      seoDescription: z.string().max(500).optional().describe("SEO 설명"),
      seoKeywords: z.array(z.string()).optional().describe("SEO 키워드 배열"),
      ogImageUrl: z.string().optional().describe("OG 이미지 URL"),
    }),
    execute: async ({ contentId, ...data }) => {
      const [created] = await db
        .insert(studioContentSeo)
        .values({ contentId, ...data })
        .returning({
          id: studioContentSeo.id,
          seoTitle: studioContentSeo.seoTitle,
          seoKeywords: studioContentSeo.seoKeywords,
          snapshotAt: studioContentSeo.snapshotAt,
        });
      return created;
    },
  }),

  // ========================================================================
  // Brand Voice — 조회
  // ========================================================================

  "brandVoice.getProfile": tool({
    description:
      "스튜디오의 브랜드 보이스 프로필을 조회합니다. 톤, 금지어, 필수어 등을 확인하여 콘텐츠 작성에 반영합니다.",
    parameters: z.object({
      studioId: z.string().uuid().describe("스튜디오 ID"),
    }),
    execute: async ({ studioId }) => {
      const profile = await db.query.studioBrandProfiles.findFirst({
        where: eq(studioBrandProfiles.studioId, studioId),
        columns: {
          brandName: true,
          industry: true,
          targetAudience: true,
          formality: true,
          friendliness: true,
          humor: true,
          sentenceLength: true,
          forbiddenWords: true,
          requiredWords: true,
          additionalGuidelines: true,
          activePresetId: true,
        },
      });

      if (!profile) return { exists: false, message: "브랜드 보이스가 설정되지 않았습니다." };

      // 활성 프리셋이 있으면 함께 반환
      let activePreset = null;
      if (profile.activePresetId) {
        activePreset = await db.query.studioTonePresets.findFirst({
          where: eq(studioTonePresets.id, profile.activePresetId),
          columns: {
            name: true,
            description: true,
            formality: true,
            friendliness: true,
            humor: true,
            sentenceLength: true,
            systemPromptSuffix: true,
          },
        });
      }

      return { exists: true, profile, activePreset };
    },
  }),

  // ========================================================================
  // Schedule — 쓰기
  // ========================================================================

  "content.schedule": tool({
    description:
      "콘텐츠 발행을 예약합니다. ISO 8601 형식의 날짜/시간을 지정합니다.",
    parameters: z.object({
      contentId: z.string().uuid().describe("콘텐츠 ID"),
      scheduledAt: z
        .string()
        .describe("발행 예약 일시 (ISO 8601, 예: 2026-03-01T09:00:00Z)"),
    }),
    execute: async ({ contentId, scheduledAt }) => {
      const [updated] = await db
        .update(studioContents)
        .set({ scheduledAt: new Date(scheduledAt) })
        .where(eq(studioContents.id, contentId))
        .returning({
          id: studioContents.id,
          title: studioContents.title,
          scheduledAt: studioContents.scheduledAt,
        });

      if (!updated) return { error: "콘텐츠를 찾을 수 없습니다." };
      return updated;
    },
  }),
};
