/**
 * 기본 플랜 시드 데이터
 *
 * 사용법:
 *   npx tsx packages/drizzle/src/seed/plans.ts
 */
import type { NewPaymentPlan } from "../schema/features/payment/plans";

/** 기본 플랜 시드 데이터 */
export const DEFAULT_PLANS: Omit<
  NewPaymentPlan,
  "id" | "createdAt" | "updatedAt"
>[] = [
  {
    name: "Free",
    slug: "free",
    description: "무료로 시작하세요",
    tier: "free",
    monthlyCredits: 100,
    price: 0,
    currency: "USD",
    interval: "month",
    features: [
      "월 100 크레딧",
      "기본 AI 기능",
      "커뮤니티 접근",
    ],
    isActive: true,
    sortOrder: 0,
  },
  {
    name: "Pro",
    slug: "pro",
    description: "개인 사용자를 위한 프로 플랜",
    tier: "pro",
    monthlyCredits: 5000,
    price: 19,
    currency: "USD",
    interval: "month",
    features: [
      "월 5,000 크레딧",
      "모든 AI 모델 접근",
      "콘텐츠 스튜디오",
      "우선 지원",
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Team",
    slug: "team",
    description: "팀을 위한 협업 플랜",
    tier: "team",
    monthlyCredits: 20000,
    price: 29,
    currency: "USD",
    interval: "month",
    features: [
      "월 20,000 크레딧",
      "모든 AI 모델 접근",
      "콘텐츠 스튜디오",
      "팀 협업 기능",
      "우선 지원",
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "대규모 조직을 위한 맞춤 플랜",
    tier: "enterprise",
    monthlyCredits: 100000,
    price: 0,
    currency: "USD",
    interval: "month",
    features: [
      "무제한 크레딧",
      "모든 AI 모델 접근",
      "콘텐츠 스튜디오",
      "팀 협업 기능",
      "전담 지원",
      "맞춤 SLA",
    ],
    isActive: true,
    sortOrder: 3,
  },
];

// ============================================================================
// CLI Runner
// ============================================================================

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: "../../.env" });

  const pg = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { paymentPlans } = await import("../schema/features/payment/plans");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  const client = pg.default(connectionString);
  const db = drizzle(client);

  console.log("플랜 시드 데이터 삽입 중...");

  for (const plan of DEFAULT_PLANS) {
    await db
      .insert(paymentPlans)
      .values(plan)
      .onConflictDoUpdate({
        target: paymentPlans.slug,
        set: {
          name: plan.name,
          description: plan.description,
          tier: plan.tier,
          monthlyCredits: plan.monthlyCredits,
          price: plan.price,
          currency: plan.currency,
          interval: plan.interval,
          features: plan.features,
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
        },
      });
    console.log(`  ✓ ${plan.name} (${plan.tier})`);
  }

  console.log("플랜 시드 완료!");
  await client.end();
}

main().catch((err) => {
  console.error("시드 실패:", err);
  process.exit(1);
});
