import * as React from "react";
import { cn } from "../../../lib/utils";

export interface TimelineEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  color?: string;
  location?: string;
  isAllDay?: boolean;
}

interface NotionCalendarTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  days: { date: string; isToday: boolean }[];
  events: TimelineEvent[];
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  timeColumnWidth?: number;
  currentTime?: Date | string; // Optional precise time or Date object
  timezones?: { label: string; offset: number }[];
  visibleDayCount?: number;
  sidebarWidth?: number;
  scrollToDayIndex?: number; // Index in days[] to scroll to
  renderEvent?: (event: TimelineEvent) => React.ReactNode;
  onEmptySlotDoubleClick?: (date: string, hour: number) => void;
  onEmptySlotClick?: (date: string, time: string, e: React.MouseEvent<HTMLDivElement>) => void;
  onEventChange?: (event: TimelineEvent) => void;
  renderSlotOverlay?: (date: string, time: string) => React.ReactNode;
  extraTzWidth?: number; // Extra width for "+" button in header
}

export const NotionCalendarTimeline = React.forwardRef<HTMLDivElement, NotionCalendarTimelineProps>(
  (
    {
      className,
      days = [],
      events = [],
      startHour = 0,
      endHour = 24,
      hourHeight = 48,
      timeColumnWidth = 52,
      currentTime,
      timezones = [{ label: "GMT+9", offset: 0 }],
      visibleDayCount = 7,
      sidebarWidth = 220,
      scrollToDayIndex,
      renderEvent,
      onEmptySlotDoubleClick,
      onEmptySlotClick,
      onEventChange,
      renderSlotOverlay,
      extraTzWidth = 0,
      ...props
    },
    ref
  ) => {
    const localRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

    // Column width: match header exactly
    const tzWidth = timeColumnWidth * timezones.length + extraTzWidth;
    const colWidth = `calc((100vw - ${sidebarWidth}px - ${tzWidth}px) / ${visibleDayCount})`;

    const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
    const totalHoursHeight = hours.length * hourHeight;

    // Group events by date
    const eventsByDate = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      if (e.isAllDay) continue; // Handle all day events separately if needed
      const arr = eventsByDate.get(e.date) ?? [];
      arr.push(e);
      eventsByDate.set(e.date, arr);
    }

    const getTimeY = (time: string): number => {
      const parts = time.split(":").map(Number);
      const h = parts[0] ?? 0;
      const m = parts[1] ?? 0;
      return (h - startHour + m / 60) * hourHeight;
    };

    const getTimeFromY = React.useCallback((y: number): string => {
      let totalHours = y / hourHeight + startHour;
      let h = Math.floor(totalHours);
      let m = Math.round((totalHours - h) * 60);
      if (m >= 60) {
        h += 1;
        m -= 60;
      }
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }, [hourHeight, startHour]);

    // Calculate current time position
    let now = new Date();
    if (typeof currentTime === "string") {
      // Mock string mode "14:30"
      const [h, m] = currentTime.split(":").map(Number);
      now.setHours(h ?? 0, m ?? 0, 0, 0);
    } else if (currentTime instanceof Date) {
      now = currentTime;
    }

    const isCurrentTimeVisible = now.getHours() >= startHour && now.getHours() < endHour;
    const currentTimeY = isCurrentTimeVisible 
      ? (now.getHours() - startHour + now.getMinutes() / 60) * hourHeight
      : null;

    // Auto-scroll to current time (vertical) and to visible window (horizontal) on mount
    React.useEffect(() => {
      const scrollParent = localRef.current?.closest('.overflow-auto') as HTMLElement | null;
      if (!scrollParent) return;
      
      // Vertical: scroll to current time
      if (currentTimeY !== null) {
        const containerHeight = scrollParent.clientHeight;
        scrollParent.scrollTop = Math.max(0, currentTimeY - containerHeight / 3);
      }

      // Horizontal: scroll to the visible window start
      if (scrollToDayIndex != null && scrollToDayIndex > 0) {
        // Calculate actual column width from the first rendered column element
        const firstCol = scrollParent.querySelector('[data-day-col]') as HTMLElement | null;
        if (firstCol) {
          const actualColWidth = firstCol.getBoundingClientRect().width;
          scrollParent.scrollLeft = scrollToDayIndex * actualColWidth;
        }
      }
    }, [currentTimeY, scrollToDayIndex]);

    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    // Drag and Drop State
    const columnsContainerRef = React.useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = React.useState<{
      eventId: string;
      type: 'move' | 'resize';
      initialY: number;
      initialX: number;
      initialTopY: number;
      initialBottomY: number;
      initialDate: string;
    } | null>(null);

    const [draggedData, setDraggedData] = React.useState<{ topY: number; bottomY: number; date: string } | null>(null);

    React.useEffect(() => {
      if (!dragState) return;

      const handlePointerMove = (e: PointerEvent) => {
        const deltaY = e.clientY - dragState.initialY;
        const deltaX = e.clientX - dragState.initialX;
        const step = hourHeight / 4; // 15 mins

        let newTopY = dragState.initialTopY;
        let newBottomY = dragState.initialBottomY;
        let newDate = dragState.initialDate;

        if (dragState.type === 'move') {
          // Snap movement
          const snappedDeltaY = Math.round(deltaY / step) * step;
          newTopY = Math.max(0, dragState.initialTopY + snappedDeltaY);
          newBottomY = newTopY + (dragState.initialBottomY - dragState.initialTopY);

          // Find date column using precise coordinates
          const targets = document.elementsFromPoint(e.clientX, e.clientY);
          const colEl = targets.find(el => el.hasAttribute('data-day-col'));
          if (colEl) {
            const dateStr = colEl.getAttribute('data-day-col');
            if (dateStr) newDate = dateStr;
          }
        } else if (dragState.type === 'resize') {
          // Resize duration
          const snappedDeltaY = Math.round(deltaY / step) * step;
          newBottomY = Math.max(newTopY + step, dragState.initialBottomY + snappedDeltaY);
          newBottomY = Math.min(newBottomY, totalHoursHeight);
        }

        setDraggedData({ topY: newTopY, bottomY: newBottomY, date: newDate });
      };

      const handlePointerUp = () => {
        if (dragState && draggedData && onEventChange) {
          const event = events.find(e => e.id === dragState.eventId);
          if (event) {
            onEventChange({
              ...event,
              date: draggedData.date,
              startTime: getTimeFromY(draggedData.topY),
              endTime: getTimeFromY(draggedData.bottomY),
            });
          }
        }
        setDragState(null);
        setDraggedData(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [dragState, draggedData, days, events, hourHeight, startHour, totalHoursHeight, onEventChange]);

    return (
      <div
        ref={localRef}
        className={cn("flex-1 relative select-none", className)}
        {...props}
      >
        <div
          className="flex min-w-full w-max"
          style={{ height: totalHoursHeight + 20 }} // Add bottom padding
        >
          {/* Time Columns (Sticky Left) */}
          <div
            className="sticky left-0 z-10 shrink-0 flex border-r border-border/40 bg-background"
            style={{ width: tzWidth }}
          >
            {extraTzWidth > 0 && (
              <div style={{ width: extraTzWidth }} className="shrink-0 border-r border-border/40 bg-muted/5 font-medium" />
            )}
            {timezones.map((tz, idx) => (
              <div 
                key={tz.label}
                className={cn(
                  "flex-1 relative",
                  idx < timezones.length - 1 && "border-r border-border/40 bg-muted/10" // subtle difference for secondary timezones
                )}
              >
                {/* Time Badge (Red Pill) matching original Notion layout */}
                {tz.offset === 0 && isCurrentTimeVisible && currentTimeY !== null && (
                  <div 
                    className="absolute left-1 right-1 -mt-[11px] z-20 flex flex-col items-center justify-center bg-[#eb5757] rounded-[3px] text-white text-[10px] font-medium py-0.5 leading-none shadow-sm" 
                    style={{ top: currentTimeY }}
                  >
                     <span>{now.getHours() % 12 || 12}:{String(now.getMinutes()).padStart(2, '0')}</span>
                     <span className="text-[9px] -mt-[1px] font-normal opacity-90">{now.getHours() >= 12 ? 'PM' : 'AM'}</span>
                  </div>
                )}
                {hours.map((hour) => {
                  let displayHour = hour + tz.offset;
                  if (displayHour < 0) displayHour += 24;
                  if (displayHour >= 24) displayHour -= 24;

                  return (
                    <div
                      key={hour}
                      className="relative border-b border-border/20"
                      style={{ height: hourHeight }}
                    >
                      {/* Only format specific hours or leave raw. Notion formats am/pm */}
                      <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground/60 w-full text-right pl-1 pr-1">
                        {displayHour === 0 ? "12 AM" : displayHour < 12 ? `${displayHour} AM` : displayHour === 12 ? "12 PM" : `${displayHour - 12} PM`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Grid Columns for Each Day */}
          <div className="flex flex-1 relative" ref={columnsContainerRef}>


            {days.map((day) => {
              const dayEvents = eventsByDate.get(day.date) ?? [];
              const isToday = day.isToday || day.date === todayStr;

              return (
                <div
                  key={day.date}
                  data-day-col={day.date}
                  className={cn(
                    "flex flex-col border-r border-border/30 relative shrink-0",
                  )}
                  style={{ width: colWidth, minWidth: "120px" }}
                >
                  {/* Today Highlight Background */}
                  {isToday && (
                    <div className="absolute inset-0 bg-primary/[0.03] pointer-events-none" />
                  )}

                  {/* Current Time Red Line (per-column) */}
                  {currentTimeY !== null && (() => {
                    const todayIdx = days.findIndex(d => d.isToday || d.date === todayStr);
                    const myIdx = days.indexOf(day);
                    if (todayIdx === -1) return null;

                    if (myIdx < todayIdx) {
                      // Before today: faint red line
                      return (
                        <div
                          className="absolute left-0 right-0 z-[10] pointer-events-none h-[1px] bg-[#eb5757]/30"
                          style={{ top: currentTimeY }}
                        />
                      );
                    }
                    if (isToday) {
                      // Today column: solid red line + red dot on left edge
                      return (
                        <>
                          <div
                            className="absolute left-0 right-0 z-[10] pointer-events-none h-[2px] bg-[#eb5757]"
                            style={{ top: currentTimeY }}
                          />
                          <div
                            className="absolute z-[11] pointer-events-none size-[9px] rounded-full bg-[#eb5757]"
                            style={{ top: currentTimeY - 4, left: -4.5 }}
                          />
                        </>
                      );
                    }
                    return null; // After today: no line
                  })()}

                  {/* Hour Rows */}
                  {hours.map((hour) => {
                    const timeStr = `${hour}:00`;
                    return (
                      <div
                        key={hour}
                        className={cn(
                          "w-full border-b border-border/30 group relative",
                          onEmptySlotClick && "cursor-pointer hover:bg-muted/30 transition-colors"
                        )}
                        style={{ height: hourHeight }}
                        onClick={(e) => onEmptySlotClick?.(day.date, timeStr, e)}
                        onDoubleClick={() => onEmptySlotDoubleClick?.(day.date, hour)}
                      >
                         {renderSlotOverlay?.(day.date, timeStr)}
                      </div>
                    );
                  })}

                  {/* Half-Hour lines (Notion often has very faint dashed or solid lines, or none depending on zoom) */}
                  {/* We omit them for a cleaner look matching the screenshot, or add very faint ones */}
                  {/*
                  {hours.map((hour) => (
                    <div
                      key={`${hour}-half`}
                      className="absolute w-full border-b border-border/10 pointer-events-none"
                      style={{ top: (hour - startHour) * hourHeight + hourHeight / 2 }}
                    />
                  ))}
                  */}



                  {/* Render Events */}
                  {dayEvents.map((event) => {
                    const isDragged = dragState?.eventId === event.id;
                    
                    // The time properties seem to vary in my earlier snippet vs what was actually saved, so let's fallback safely
                    const startT = (event as any).startTime;
                    const endT = (event as any).endTime || (event as any).startTime;

                    let topY = Math.max(0, getTimeY(startT));
                    let bottomY = (event as any).endTime ? Math.min(totalHoursHeight, getTimeY(endT)) : topY + hourHeight;
                    
                    let finalTopY = topY;
                    let finalBottomY = bottomY;
                    let colDiff = 0;

                    if (isDragged) {
                      if (dragState.type === 'move') {
                        // To preserve pointer capture, DO NOT unmount the event div from its origin column!
                        // Instead, use CSS to visually shift it to the target column.
                        if (day.date !== dragState.initialDate) return null;
                        
                        finalTopY = draggedData?.topY ?? topY;
                        finalBottomY = draggedData?.bottomY ?? bottomY;
                        
                        const initialIdx = days.findIndex(d => d.date === dragState.initialDate);
                        const targetIdx = days.findIndex(d => d.date === draggedData?.date);
                        colDiff = targetIdx >= 0 && initialIdx >= 0 ? targetIdx - initialIdx : 0;
                      } else if (dragState.type === 'resize') {
                        if (day.date !== (dragState.initialDate || event.date)) return null;
                        finalTopY = draggedData?.topY ?? topY;
                        finalBottomY = draggedData?.bottomY ?? bottomY;
                      }
                    }

                    const rawHeight = finalBottomY - finalTopY;
                    const height = Math.max(rawHeight, 22); // Min height is 22px
                    const isShort = rawHeight <= 30; // If event is 30 mins or less

                    if (renderEvent && !isDragged) {
                      return (
                        <div
                          key={event.id}
                          className="absolute left-[1px] right-2 z-[3] overflow-hidden"
                          style={{ top: finalTopY + 1, height: height - 1 }}
                        >
                          {renderEvent(event)}
                        </div>
                      );
                    }

                    // Default Event Render
                    return (
                      <div
                        key={event.id}
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).dataset.resize) return; // Ignore if resizing
                          e.stopPropagation();
                          if (e.button !== 0) return; // Only left click
                          
                          // Set capture to track pointers outside window boundary
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          
                          setDragState({
                            eventId: event.id,
                            type: 'move',
                            initialY: e.clientY,
                            initialX: e.clientX,
                            initialTopY: topY,
                            initialBottomY: bottomY,
                            initialDate: event.date
                          });
                          setDraggedData({ topY, bottomY, date: event.date });
                        }}
                        className={cn(
                          "absolute z-[3] rounded-sm overflow-hidden shadow-sm flex text-[11px] font-medium cursor-pointer transition-transform touch-none border border-transparent hover:opacity-90",
                          isShort ? "flex-row items-center px-1" : "flex-col p-1 pl-1.5",
                          isDragged && "opacity-90 shadow-lg cursor-grabbing z-[100]"
                        )}
                        style={{
                          top: finalTopY,
                          height: height - 1,
                          // Visually shift columns!
                          left: `calc(${colDiff * 100}% + 1px)`,
                          width: `calc(100% - 6px)`,
                          backgroundColor: event.color ? `${event.color}15` : "#2383e215",
                          borderLeft: `3px solid ${event.color || "#2383e2"}`,
                          borderColor: event.color ? `${event.color}30` : "#2383e230",
                          borderLeftColor: event.color || "#2383e2",
                        }}
                      >
                        <div className="truncate text-foreground text-[11px] leading-tight">{event.title}</div>
                        {!isShort && (
                          <div className="truncate text-muted-foreground text-[9px] leading-none mt-0.5">
                            {isDragged && draggedData ? `${getTimeFromY(finalTopY)} - ${getTimeFromY(finalBottomY)}` : `${startT} - ${endT}`}
                          </div>
                        )}
                        {isShort && (
                          <div className="truncate text-muted-foreground text-[9px] leading-none ml-1 shrink-0">
                            {isDragged && draggedData ? getTimeFromY(finalTopY) : startT}
                          </div>
                        )}
                        
                        {/* Resize handle */}
                        <div 
                          data-resize="true"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button !== 0) return;
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

                            setDragState({
                              eventId: event.id,
                              type: 'resize',
                              initialY: e.clientY,
                              initialX: e.clientX,
                              initialTopY: topY,
                              initialBottomY: bottomY,
                              initialDate: event.date
                            });
                            setDraggedData({ topY, bottomY, date: event.date });
                          }}
                          className={cn(
                            "absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 hover:bg-black/10 dark:hover:bg-white/10 touch-none",
                            isDragged && dragState?.type === 'resize' && "bg-black/10 dark:bg-white/10"
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);
NotionCalendarTimeline.displayName = "NotionCalendarTimeline";
