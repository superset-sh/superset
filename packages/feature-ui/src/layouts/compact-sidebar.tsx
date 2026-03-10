/**
 * Compact Sidebar — Linear 스타일 래퍼
 *
 * shadcn sidebar 컴포넌트를 감싸서 compact 스타일을 적용합니다.
 * _shadcn 원본을 수정하지 않으므로 shadcn 업데이트에 안전합니다.
 */
import type { CSSProperties } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  SidebarProvider as _SidebarProvider,
  SidebarMenu as _SidebarMenu,
  SidebarMenuButton as _SidebarMenuButton,
  SidebarGroupLabel as _SidebarGroupLabel,
  SidebarGroupContent as _SidebarGroupContent,
} from "@superbuilder/feature-ui/shadcn/sidebar";

// 변경 없는 컴포넌트는 그대로 re-export
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@superbuilder/feature-ui/shadcn/sidebar";

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const COMPACT_SIDEBAR_WIDTH = "260px";

/* -------------------------------------------------------------------------------------------------
 * Compact Wrappers
 * -----------------------------------------------------------------------------------------------*/

/** SidebarProvider — 사이드바 너비 260px */
export function SidebarProvider(
  props: Parameters<typeof _SidebarProvider>[0],
) {
  return (
    <_SidebarProvider
      {...props}
      style={
        {
          "--sidebar-width": COMPACT_SIDEBAR_WIDTH,
          ...props.style,
        } as CSSProperties
      }
    />
  );
}

/** SidebarMenu — 아이템 간격 2px */
export function SidebarMenu(props: Parameters<typeof _SidebarMenu>[0]) {
  return (
    <_SidebarMenu {...props} className={cn("gap-0.5", props.className)} />
  );
}

/** SidebarMenuButton — 높이 28px, 폰트 13px, 기본 regular / 활성 medium (size="lg"는 원본 유지) */
export function SidebarMenuButton(
  props: Parameters<typeof _SidebarMenuButton>[0],
) {
  const isCompact = !props.size || props.size === "default";
  return (
    <_SidebarMenuButton
      {...props}
      className={cn(
        isCompact && "h-7 text-[13px] font-normal data-active:font-medium",
        props.className,
      )}
    />
  );
}

/** SidebarGroupLabel — 11px, uppercase, semibold */
export function SidebarGroupLabel(
  props: Parameters<typeof _SidebarGroupLabel>[0],
) {
  return (
    <_SidebarGroupLabel
      {...props}
      className={cn(
        "h-7 text-[11px] font-semibold uppercase tracking-wider opacity-50",
        props.className,
      )}
    />
  );
}

/** SidebarGroupContent — 폰트 13px */
export function SidebarGroupContent(
  props: Parameters<typeof _SidebarGroupContent>[0],
) {
  return (
    <_SidebarGroupContent
      {...props}
      className={cn("text-[13px]", props.className)}
    />
  );
}
