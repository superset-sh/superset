/**
 * App Layout - 인증된 일반 유저용 레이아웃
 *
 * layoutConfig.appShellVariant 로 Application Shell 스타일 변경 가능
 */
import type React from "react";
import { layoutConfig, type AppShellVariant } from "./config";
import { AppShell01 } from "./blocks/app-shell-01";
import { AppShell02 } from "./blocks/app-shell-02";
import { AppShell07 } from "./blocks/app-shell-07";
import { AppShellAgent } from "./blocks/app-shell-agent";

const variantMap: Record<AppShellVariant, React.ComponentType> = {
  1: AppShell01,
  2: AppShell02,
  7: AppShell07,
  agent: AppShellAgent,
};

export function AppLayout() {
  const Component = variantMap[layoutConfig.appShellVariant] ?? AppShell01;
  return <Component />;
}
