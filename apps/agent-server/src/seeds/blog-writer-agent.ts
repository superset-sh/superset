/**
 * blog-writer 에이전트 시드 데이터
 *
 * 실행: npx tsx apps/agent-server/src/seeds/blog-writer-agent.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@superbuilder/drizzle/schema";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seed() {
  const slug = "blog-writer";

  // 이미 존재하면 업데이트
  const existing = await db.query.agentAgents.findFirst({
    where: eq(schema.agentAgents.slug, slug),
  });

  const data = {
    name: "블로그 작성 에이전트",
    slug,
    description:
      "콘텐츠 스튜디오 블로그 자동 작성 에이전트. 주제를 기반으로 블로그 콘텐츠를 생성하고, SEO 키워드를 도출하여 메타데이터를 설정합니다.",
    systemPrompt: `당신은 전문 블로그 작성 에이전트입니다.

## 역할
- 콘텐츠 스튜디오에서 주어진 주제에 대해 고품질 블로그 콘텐츠를 작성합니다.
- 마크다운 형식으로 작성하며, 제목(##), 소제목(###), 본문, 목록, 코드 블록 등을 활용합니다.
- 콘텐츠 작성 후 SEO 키워드를 도출하여 메타데이터를 저장합니다.
- 관련 콘텐츠를 엣지로 연결하여 콘텐츠 맵을 확장합니다.

## 작성 규칙
1. 제목은 독자의 관심을 끌 수 있도록 작성
2. 소제목으로 구조화하여 읽기 쉽게 구성
3. 구체적인 예시와 설명 포함
4. 500-2000자 내외로 작성
5. SEO를 고려한 키워드 자연스럽게 포함
6. 브랜드 보이스가 설정되어 있으면 해당 톤에 맞춰 작성

## 워크플로우
1. studio.list로 스튜디오 확인
2. studio.getCanvas로 기존 토픽/콘텐츠 구조 파악
3. brandVoice.getProfile로 브랜드 톤 확인
4. 콘텐츠 작성 (직접 생성)
5. content.create로 콘텐츠 저장
6. seo.addSnapshot로 SEO 메타데이터 저장
7. edge.create로 관련 콘텐츠 연결
8. 필요 시 image.generate로 썸네일 생성 후 content.update로 반영

## 사용 가능한 도구
- studio.list: 스튜디오 목록 조회
- studio.getCanvas: 캔버스 데이터 조회 (토픽/콘텐츠/엣지)
- content.get: 콘텐츠 상세 조회
- content.search: 콘텐츠 검색
- content.create: 새 콘텐츠 생성
- content.update: 콘텐츠 수정
- content.schedule: 발행 예약
- topic.create: 토픽 생성
- edge.create: 노드 간 연결
- seo.getHistory: SEO 이력 조회
- seo.addSnapshot: SEO 메타데이터 저장
- brandVoice.getProfile: 브랜드 보이스 조회
- image.generate: AI 이미지 생성 (썸네일)`,
    enabledTools: [
      "studio.list",
      "studio.getCanvas",
      "content.get",
      "content.search",
      "content.create",
      "content.update",
      "content.schedule",
      "topic.create",
      "edge.create",
      "seo.getHistory",
      "seo.addSnapshot",
      "brandVoice.getProfile",
      "image.generate",
    ],
    temperature: 0.7,
    maxSteps: 15,
    isActive: true,
    isDefault: false,
    modelPreference: {
      default: "anthropic:claude-sonnet-4-5-20250929",
    },
  };

  if (existing) {
    await db
      .update(schema.agentAgents)
      .set(data)
      .where(eq(schema.agentAgents.id, existing.id));
    console.log(`Updated blog-writer agent: ${existing.id}`);
  } else {
    // createdById는 첫 번째 owner 역할 유저 사용
    const ownerRole = await db.query.roles.findFirst({
      where: eq(schema.roles.slug, "owner"),
    });
    const ownerUserRole = ownerRole
      ? await db.query.userRoles.findFirst({
          where: eq(schema.userRoles.roleId, ownerRole.id),
        })
      : null;
    const admin = ownerUserRole
      ? await db.query.profiles.findFirst({
          where: eq(schema.profiles.id, ownerUserRole.userId),
        })
      : await db.query.profiles.findFirst();
    if (!admin) {
      console.error("No owner profile found. Create one first.");
      process.exit(1);
    }
    const [agent] = await db
      .insert(schema.agentAgents)
      .values({ ...data, createdById: admin.id })
      .returning();
    console.log(`Created blog-writer agent: ${agent.id}`);
  }

  await client.end();
}

seed().catch(console.error);
