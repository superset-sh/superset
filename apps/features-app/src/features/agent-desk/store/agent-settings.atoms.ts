import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/** 토큰 사용량 표시 여부 (localStorage 기반 영속) */
export const showTokenUsageAtom = atomWithStorage("agent-desk:showTokenUsage", false);

/** 파이프라인 진행 중 실시간 토큰 사용량 */
export interface PipelineTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 마지막 파이프라인 단계의 토큰 사용량 */
export const lastTokenUsageAtom = atom<PipelineTokenUsage | null>(null);
