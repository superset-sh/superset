/**
 * TipTap 에디터 공용 타입 정의
 */

/** TipTap JSON 콘텐츠 구조 */
export interface TipTapContent {
  type: string;
  content?: TipTapContent[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
  text?: string;
}

/** 에디터 툴바 variant */
export type ToolbarVariant = "full" | "compact" | "none";

/** 에디터 확장 옵션 */
export interface EditorExtensionOptions {
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 이미지 삽입 허용 여부 */
  enableImage?: boolean;
  /** 코드블록 구문 강조 허용 여부 */
  enableCodeHighlight?: boolean;
  /** 글자수 제한 (0이면 무제한) */
  characterLimit?: number;
}
