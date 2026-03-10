/**
 * useDragClickGuard - 드래그 직후 의도하지 않은 클릭 방지
 *
 * @dnd-kit 드래그 종료 시 발생하는 pointer-up 이벤트가
 * Link 클릭으로 전파되는 것을 300ms 임계값으로 방지한다.
 */
import { useEffect, useRef } from "react";

export function useDragClickGuard(isDragging: boolean) {
  const dragEndTime = useRef(0);
  const wasDragging = useRef(false);

  useEffect(() => {
    if (isDragging) {
      wasDragging.current = true;
    } else if (wasDragging.current) {
      wasDragging.current = false;
      dragEndTime.current = Date.now();
    }
  }, [isDragging]);

  const guardClick = (e: React.MouseEvent) => {
    if (dragEndTime.current > 0 && Date.now() - dragEndTime.current < 300) {
      e.preventDefault();
    }
  };

  return { guardClick };
}
