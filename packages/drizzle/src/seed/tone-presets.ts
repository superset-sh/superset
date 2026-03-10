/**
 * 시스템 톤 프리셋 시드 데이터
 *
 * 사용법:
 *   npx tsx packages/drizzle/src/seed/tone-presets.ts
 *
 * 또는 서버 초기화 시 수동 삽입:
 *   import { SYSTEM_TONE_PRESETS } from "@superbuilder/drizzle/seed/tone-presets";
 */
import type { NewStudioTonePreset } from "../schema/features/content-studio";

/** 시스템 기본 톤 프리셋 (isSystem=true, studioId=null) */
export const SYSTEM_TONE_PRESETS: Omit<
  NewStudioTonePreset,
  "id" | "createdAt" | "updatedAt"
>[] = [
  {
    name: "전문 블로그",
    description:
      "전문적이고 신뢰감 있는 블로그 톤. 정보 전달에 집중하며 객관적인 어조를 유지합니다.",
    formality: 4,
    friendliness: 3,
    humor: 1,
    sentenceLength: "long",
    systemPromptSuffix:
      "전문가 관점에서 근거 기반으로 서술하세요. 주관적 표현을 최소화하고, 데이터나 사례를 활용하세요.",
    isSystem: true,
    studioId: null,
  },
  {
    name: "캐주얼 SNS",
    description:
      "친근하고 가벼운 SNS 포스팅 톤. 이모지와 구어체를 활용하여 공감을 이끌어냅니다.",
    formality: 1,
    friendliness: 5,
    humor: 4,
    sentenceLength: "short",
    systemPromptSuffix:
      "짧고 임팩트 있는 문장을 사용하세요. 구어체와 감탄사를 적극 활용하고, 독자와 대화하듯 작성하세요.",
    isSystem: true,
    studioId: null,
  },
  {
    name: "포멀 보도자료",
    description:
      "격식 있는 보도자료/공식 문서 톤. 정확한 사실 전달과 객관적 서술을 지향합니다.",
    formality: 5,
    friendliness: 2,
    humor: 1,
    sentenceLength: "medium",
    systemPromptSuffix:
      "보도자료 형식을 따르세요. 육하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)을 포함하고, 인용문 형식을 활용하세요.",
    isSystem: true,
    studioId: null,
  },
  {
    name: "친근한 뉴스레터",
    description:
      "구독자와 친밀한 관계를 형성하는 뉴스레터 톤. 개인적이면서도 유익한 정보를 전달합니다.",
    formality: 2,
    friendliness: 5,
    humor: 3,
    sentenceLength: "medium",
    systemPromptSuffix:
      "독자에게 편지를 쓰듯 작성하세요. '여러분', '우리' 같은 표현을 사용하고, 개인적 경험이나 인사이트를 공유하세요.",
    isSystem: true,
    studioId: null,
  },
  {
    name: "기술 문서",
    description:
      "정확하고 체계적인 기술 문서 톤. 코드 예시, 단계별 가이드 등 실용적인 정보를 전달합니다.",
    formality: 4,
    friendliness: 2,
    humor: 1,
    sentenceLength: "medium",
    systemPromptSuffix:
      "기술 문서 형식을 따르세요. 코드 블록, 번호 매기기, 주의사항(Note/Warning) 등을 활용하고, 모호한 표현을 피하세요.",
    isSystem: true,
    studioId: null,
  },
];
