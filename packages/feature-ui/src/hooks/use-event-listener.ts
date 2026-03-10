import { useEffect } from "react";
import { isNil } from "es-toolkit";

export function useEventListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement | null,
  event: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): void;

export function useEventListener<K extends keyof DocumentEventMap>(
  element: Document | null,
  event: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): void;

export function useEventListener<
  T extends Document | HTMLElement,
  K extends keyof HTMLElementEventMap,
>(
  element: T | null,
  event: K,
  listener: (ev: Event) => void,
  options?: boolean | AddEventListenerOptions,
) {
  useEffect(() => {
    if (isNil(element)) return;
    element.addEventListener(event, listener, options);

    return () => {
      element.removeEventListener(event, listener, options);
    };
  }, [element, event, listener, options]);
}
