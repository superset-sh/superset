/**
 * Graph Jotai Atoms - 선택지 그래프 상태 관리
 */
import { atom } from "jotai";

/** 현재 선택된 노드 ID */
export const selectedNodeIdAtom = atom<string | null>(null);

/** 캐릭터 동선 추적 대상 캐릭터 ID */
export const trackedCharacterIdAtom = atom<string | null>(null);

/** 노드 검색 쿼리 */
export const nodeSearchQueryAtom = atom<string>("");
