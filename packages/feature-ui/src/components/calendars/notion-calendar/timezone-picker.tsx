import * as React from "react";
import { cn } from "../../../lib/utils";

export interface TimezoneInfo {
  id: string;
  label: string; // e.g. "GMT+09:00"
  name: string; // e.g. "한국 표준시"
  city: string; // e.g. "Seoul"
  offsetHours: number; // e.g. 9
}

// Common timezones list
export const TIMEZONE_LIST: TimezoneInfo[] = [
  { id: "pacific/midway", label: "GMT-11:00", name: "사모아 표준시", city: "Midway", offsetHours: -11 },
  { id: "pacific/honolulu", label: "GMT-10:00", name: "하와이 표준시", city: "Honolulu", offsetHours: -10 },
  { id: "america/anchorage", label: "GMT-09:00", name: "알래스카 표준시", city: "Anchorage", offsetHours: -9 },
  { id: "america/los_angeles", label: "GMT-08:00", name: "북미 태평양 표준시", city: "Los Angeles", offsetHours: -8 },
  { id: "america/denver", label: "GMT-07:00", name: "북미 산악 표준시", city: "Denver", offsetHours: -7 },
  { id: "america/chicago", label: "GMT-06:00", name: "북미 중부 표준시", city: "Chicago", offsetHours: -6 },
  { id: "america/new_york", label: "GMT-05:00", name: "북미 동부 표준시", city: "New York", offsetHours: -5 },
  { id: "america/caracas", label: "GMT-04:00", name: "베네수엘라 표준시", city: "Caracas", offsetHours: -4 },
  { id: "america/sao_paulo", label: "GMT-03:00", name: "브라질 표준시", city: "São Paulo", offsetHours: -3 },
  { id: "atlantic/south_georgia", label: "GMT-02:00", name: "남대서양 표준시", city: "South Georgia", offsetHours: -2 },
  { id: "atlantic/azores", label: "GMT-01:00", name: "아조레스 표준시", city: "Azores", offsetHours: -1 },
  { id: "europe/london", label: "GMT+00:00", name: "그리니치 표준시", city: "London", offsetHours: 0 },
  { id: "europe/brussels", label: "GMT+01:00", name: "중부유럽 표준시", city: "Brussels", offsetHours: 1 },
  { id: "europe/helsinki", label: "GMT+02:00", name: "동유럽 표준시", city: "Helsinki", offsetHours: 2 },
  { id: "europe/moscow", label: "GMT+03:00", name: "모스크바 표준시", city: "Moscow", offsetHours: 3 },
  { id: "asia/dubai", label: "GMT+04:00", name: "걸프 표준시", city: "Dubai", offsetHours: 4 },
  { id: "asia/kolkata", label: "GMT+05:30", name: "인도 표준시", city: "Kolkata", offsetHours: 5.5 },
  { id: "asia/dhaka", label: "GMT+06:00", name: "방글라데시 표준시", city: "Dhaka", offsetHours: 6 },
  { id: "asia/bangkok", label: "GMT+07:00", name: "인도차이나 표준시", city: "Bangkok", offsetHours: 7 },
  { id: "asia/shanghai", label: "GMT+08:00", name: "중국 표준시", city: "Shanghai", offsetHours: 8 },
  { id: "asia/seoul", label: "GMT+09:00", name: "한국 표준시", city: "Seoul", offsetHours: 9 },
  { id: "asia/tokyo", label: "GMT+09:00", name: "일본 표준시", city: "Tokyo", offsetHours: 9 },
  { id: "australia/sydney", label: "GMT+10:00", name: "호주 동부 표준시", city: "Sydney", offsetHours: 10 },
  { id: "pacific/noumea", label: "GMT+11:00", name: "뉴칼레도니아 표준시", city: "Noumea", offsetHours: 11 },
  { id: "pacific/auckland", label: "GMT+12:00", name: "뉴질랜드 표준시", city: "Auckland", offsetHours: 12 },
];

interface TimezonePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (tz: TimezoneInfo) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function TimezonePicker({ open, onClose, onSelect, anchorRef }: TimezonePickerProps) {
  const [search, setSearch] = React.useState("");
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Filter timezones by search
  const filtered = React.useMemo(() => {
    if (!search.trim()) return TIMEZONE_LIST;
    const q = search.toLowerCase();
    return TIMEZONE_LIST.filter(
      (tz) =>
        tz.label.toLowerCase().includes(q) ||
        tz.name.toLowerCase().includes(q) ||
        tz.city.toLowerCase().includes(q) ||
        tz.id.toLowerCase().includes(q)
    );
  }, [search]);

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        (!anchorRef?.current || !anchorRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={pickerRef}
      className="absolute z-[200] top-full left-0 mt-1 w-[340px] max-h-[360px] rounded-lg shadow-xl overflow-hidden flex flex-col"
      style={{
        backgroundColor: "rgba(30, 30, 30, 0.97)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Search Header */}
      <div className="px-3 py-2.5 border-b border-white/10">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="시간대"
          className="w-full bg-transparent text-white/90 text-[12px] placeholder:text-white/40 outline-none"
        />
      </div>

      {/* Timezone List */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-white/40 text-[11px]">
            검색 결과가 없습니다
          </div>
        ) : (
          filtered.map((tz) => (
            <button
              key={tz.id}
              onClick={() => {
                onSelect(tz);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-[11px] text-white/80 hover:bg-white/10 transition-colors flex items-baseline gap-1.5 cursor-pointer"
            >
              <span className="text-white/50 shrink-0 font-mono text-[10px]">{tz.label}</span>
              <span className="truncate">
                {tz.name} – {tz.city}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
