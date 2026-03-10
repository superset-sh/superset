/**
 * 캔버스 UI 상태 관리 (Jotai atoms)
 *
 * React Flow 자체 상태(nodes/edges)는 React Flow 내부 관리.
 * Jotai는 UI 상태만 담당 (선택 등).
 */
import { atom } from "jotai";

/** 현재 선택된 노드 */
export const selectedNodeAtom = atom<{
  id: string;
  type: "topic" | "content";
} | null>(null);

/** AI 추천 Side Panel 열림 여부 */
export const aiPanelOpenAtom = atom(false);

/** AI 패널에서 다루는 Topic 정보 */
export const aiPanelTopicAtom = atom<{
  id: string;
  label: string;
} | null>(null);
