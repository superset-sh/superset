import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui cn 유틸리티
 * Tailwind CSS 클래스를 병합하는 함수
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 클릭보드 복사
 * 모바일에러 대응가능한 fallback
 * @param text 복사할 텍스트
 */
export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e: unknown) {
    console.log("Failed to copy to clipboard:", e);
    /**
     * Fallback for non-secure context
     */
    const element = document.createElement("input");
    element.value = text;
    element.setAttribute("readonly", "");
    element.style.position = "absolute";
    element.style.left = "-9999px";
    document.body.appendChild(element);
    element.select();
    document.execCommand("copy");
    document.body.removeChild(element);
  }
};
