<div align="center">

<img width="full" alt="병렬 Superset 워크스페이스에서 실시간 차이를 보여주며 작업 중인 Claude와 OpenCode" src="../apps/marketing/public/images/readme-hero.gif" />

### 100개 이상의 코딩 에이전트를 병렬로 실행

<details>
<summary>🌐 다른 언어로 보기</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*이 문서는 영어 README의 번역본이며, 영어 원문이 우선합니다.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex를 비롯한 모든 CLI 에이전트를 각각 격리된 worktree에서 실행하세요.<br />
기다리는 대신 출시하는 데 시간을 쓰세요.

<br />

[**macOS용 다운로드**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [문서](https://docs.superset.sh) &nbsp;&bull;&nbsp; [변경 로그](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 전환 비용 없이 10배 빠른 코딩

Superset은 CLI 기반 코딩 에이전트를 격리된 git worktree에서 병렬로 실행하며, 터미널, 리뷰, 에디터로 열기 워크플로를 기본 제공합니다.

- **여러 에이전트를 동시에 실행** — 컨텍스트 전환 부담이 없습니다
- **각 작업을 격리된 git worktree에 분리** — 에이전트끼리 서로 간섭하지 않습니다
- **모든 에이전트를 한곳에서 모니터링** — 개입이 필요하면 알림을 받습니다
- **변경 사항을 빠르게 리뷰하고 편집** — 내장 차이 뷰어와 에디터로
- **필요한 곳 어디서든 워크스페이스 열기** — 클릭 한 번으로 에디터나 터미널에 인계
- **어디서나 워크스페이스에 접근** — 원격 호스트, CLI, SDK, MCP를 통해

덜 기다리고, 더 많이 출시하세요.

## 기능

<table>
<tr>
<td width="50%" valign="middle">

### 병렬 워크스페이스

100개 이상의 코딩 에이전트를 한 번에 실행하세요. 각자 자기만의 브랜치, 터미널, 환경을 갖춘 git worktree에서 동작합니다. 결과를 비교하고 가장 좋은 것을 머지하세요.

[문서 →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="다른 에이전트들이 병렬 워크스페이스에서 실행되는 동안 결제 마이그레이션을 스트리밍하는 Claude" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 에이전트 모니터링

사이드바에서 모든 에이전트를 추적하세요. 작업 중 표시, 완료 알림음, 그리고 개입이 필요할 때의 Dock 배지를 제공합니다.

[문서 →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="에이전트가 작업을 마치고 사이드바 상태가 작업 중에서 완료로 바뀌는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 내장 터미널

탭, 무제한 분할, 프리셋, 재시작 후에도 유지되는 지속 세션. ⌘I를 누르면 여러 줄 편집과 @ 파일 멘션을 지원하는 리치 프롬프트 에디터가 열립니다.

[문서 →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="분할 터미널 옆의 리치 프롬프트 에디터에서 @ 파일 멘션과 함께 후속 지시를 입력하는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 내장 차이 뷰어

앱을 벗어나지 않고 에이전트의 변경 사항을 검토하고, 코멘트를 달고, 편집한 다음, 준비되면 커밋하고 푸시하세요.

[문서 →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="차이 뷰어에서 에이전트의 변경 사항을 리뷰하는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 앱 내 브라우저와 포트

실행 중인 개발 서버를 브라우저 패널에서 미리 보세요. 포트는 워크스페이스별로 감지되므로 모든 worktree가 자기만의 미리보기를 갖습니다.

[문서 →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="감지된 포트로 개발 서버를 미리 보는 앱 내 브라우저" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 자동화

에이전트 세션을 일정에 따라 실행하세요: 밤사이 이슈 분류, 주간 변경 로그 초안 작성, 의존성 최신 상태 유지.

[문서 →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="일정에 따라 실행되는 에이전트 자동화" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 원격 액세스

다른 컴퓨터를 연결하고 그 워크스페이스에 어디서든 접근하세요: 데스크톱 앱, CLI, 휴대폰으로. 오프라인 호스트는 사용자 지정 명령으로 깨울 수 있습니다.

[문서 →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="조직 설정의 호스트와 멤버" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

어떤 셸에서든 스크립트로 제어하세요: 단일 바이너리로 워크스페이스 생성, 에이전트 실행, 터미널 읽기, 자동화 관리까지. 명령을 실행할 수 있는 에이전트라면 Superset을 조종할 수 있습니다.

[문서 →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Superset CLI에서 워크스페이스를 만들고 에이전트를 실행하는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 명령 팔레트

하나의 검색창에서 어떤 워크스페이스, 동작, 설정으로든 이동하세요.

[문서 →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="명령 팔레트에 입력하며 워크스페이스 동작을 실시간으로 필터링하는 모습" width="100%" /></a>
</td>
</tr>
</table>

**이 밖에도 기본 제공:**

- **[내장 스킬](https://docs.superset.sh/skills)**: 에이전트에는 `superset:*` 스킬(병렬 에이전트 오케스트레이션, 자동화 예약, 피드백 제출, 문제 진단)이 실행 시 자동으로 프로비저닝됩니다
- **[모델 선택기와 커스텀 에이전트](https://docs.superset.sh/agent-integration)**: 실행 시 모델과 추론 강도를 선택하고, 어떤 터미널 에이전트든 전용 아이콘과 함께 추가할 수 있습니다
- **[워크스페이스 설정 스크립트](https://docs.superset.sh/setup-teardown-scripts)**: 환경 설정, 의존성 설치, 개발 서버를 워크스페이스별로 자동화
- **[터미널 프리셋](https://docs.superset.sh/terminal-presets)**: 에이전트와 셸 레이아웃을 저장하고 키 하나로 열기
- **[Slack & Linear](https://docs.superset.sh/use-with-linear)**: Slack 메시지나 Linear 이슈에서 곧바로 워크스페이스 생성
- **[IDE에서 열기](https://docs.superset.sh/use-with-ide)**: Cursor, VS Code 등 어떤 에디터로든 클릭 한 번에 인계
- **[커스텀 테마](https://docs.superset.sh/custom-themes)**: 테마 파일을 만들고, 편집하고, 가져오기
- **[키보드 단축키](https://docs.superset.sh/keyboard-shortcuts)**: 모든 동작은 **설정 → 키보드 단축키**(⌘/)에서 다시 매핑할 수 있습니다
- **[직접 프로바이더 연결](https://docs.superset.sh/providers)**: OpenRouter, Bedrock, Vertex, Vercel AI Gateway 연결
- **그리고 더 많은 기능**: 매일 출시하기 때문에 이 목록은 늘 뒤처져 있습니다. 진짜 기능 목록은 [변경 로그](https://superset.sh/changelog)입니다.

## 지원 에이전트

Superset은 다음을 포함한 모든 CLI 기반 코딩 에이전트와 함께 작동합니다:

| 에이전트 | 상태 |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 완전 지원 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 완전 지원 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 완전 지원 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 완전 지원 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 완전 지원 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 완전 지원 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 완전 지원 |
| 그 밖의 모든 CLI 에이전트 | 별도 설정 없이 작동 |

터미널에서 돌아간다면, Superset에서도 돌아갑니다

에이전트는 터미널 그 이상을 얻습니다:

- **모델 선택기**: 에이전트를 실행할 때 모델과 추론 강도를 선택
- **에이전트별 설정**: 설정 → 에이전트에서 실행 명령, 프롬프트 템플릿, 모델 오버라이드를 조정
- **커스텀 에이전트**: 어떤 터미널 에이전트든 전용 아이콘과 함께 추가하면 내장 에이전트처럼 작동
- **상태와 알림**: 작업 중 표시, 완료 알림음, 에이전트가 개입을 필요로 할 때의 Dock 배지
- **내장 채팅**: 채팅 패널에서 모델과 대화. 인라인 도구 승인과 계획 리뷰 지원

## 데스크톱 앱, 그 이상

모든 사용 환경이 같은 워크스페이스에 연결되므로, 앱에서 작업을 시작하고 어디서든 확인할 수 있습니다.

| 사용 환경 | 제공 기능 |
|:--------|:-------------|
| [**데스크톱 앱**](https://github.com/superset-sh/superset/releases/latest) | 완전한 IDE: 터미널, 차이 뷰어, 앱 내 브라우저, 자동화 |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | 어떤 셸에서든 워크스페이스, 에이전트, 터미널, 호스트를 관리하는 단일 `superset` 바이너리 |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk)로 Node, Bun, Deno에서 Superset을 프로그래밍 방식으로 제어 |
| [**MCP 서버**](https://docs.superset.sh/mcp) | Claude Code, Codex, Cursor 같은 에이전트가 직접 워크스페이스를 만들고 관리 |

CLI는 데스크톱 앱에 번들로 포함되어 있으며, 단독으로 설치할 수도 있습니다:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

iOS 앱도 곧 출시됩니다. 휴대폰에서 에이전트를 확인할 수 있게 됩니다.

## 설치

데스크톱 앱 다운로드:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (실험적; macOS가 주 지원 대상입니다)
- **Windows**: 아직 제공되지 않음
- [모든 빌드](https://github.com/superset-sh/superset/releases/latest)

필요한 것은 [Git](https://git-scm.com/)뿐입니다. [gh](https://cli.github.com/)는 선택 사항으로 PR 워크플로를 사용할 수 있게 해 주며, Superset이 대신 설치해 주겠다고 제안합니다.

## 개발

Superset을 직접 만져 보거나 PR을 기여하고 싶으신가요? 저장소를 클론하고, 설치된 Superset 앱에 추가한 다음, 변경 작업용 워크스페이스를 만드세요:

```bash
git clone https://github.com/superset-sh/superset.git
```

그런 다음 해당 워크스페이스 터미널에서 개발 설정을 실행하세요:

```bash
./.superset/setup.local.sh
bun run dev
```

`setup.local.sh`는 새 worktree마다 한 번씩 실행하세요. 워크스페이스별 앱 아이덴티티와 포트를 구성해서 개발용 데스크톱 앱이 설치된 Superset 앱 및 다른 개발 worktree와 나란히 실행될 수 있게 합니다.

Neon 계정이나 서드파티 자격 증명은 필요 없습니다. `setup.local.sh`가 Docker로 로컬 Postgres + Electric 스택을 띄우고 개발 계정을 시드합니다. **"Sign in as dev"** 버튼(또는 `admin@local.test` / `supersetdev`)으로 로그인하세요.

사전 요구 사항: [Bun](https://bun.sh/) v1.3.14+(`.bun-version`에 고정), `docker`, `jq`, `caddy`. `caddy`는 `bun dev`가 로컬 HTTPS 프록시로 실행합니다(`brew install jq caddy && caddy trust`).

전체 가이드는 [**DEVELOPMENT.md**](../DEVELOPMENT.md)를 참고하세요: 설정 스크립트가 하는 일, 실제 서비스 대상 수동 설정, 자주 쓰는 명령, 문제 해결, 데스크톱 앱 빌드 방법을 다룹니다. 기여 절차는 [**CONTRIBUTING.md**](../CONTRIBUTING.md)에 있습니다.

## 구성

워크스페이스의 설정, 정리, 실행 스크립트는 `.superset/config.json`에서 구성합니다. [전체 문서](https://docs.superset.sh/setup-teardown-scripts)를 참고하세요.

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

키보드 단축키는 **설정 → 키보드 단축키**(⌘/)에서 사용자 지정할 수 있습니다. [전체 단축키 목록](https://docs.superset.sh/keyboard-shortcuts)도 참고하세요.

## 기술 스택

<p>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB" alt="React" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white" alt="TailwindCSS" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://turbo.build/"><img src="https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://biomejs.dev/"><img src="https://img.shields.io/badge/Biome-339AF0?logo=biome&logoColor=white" alt="Biome" /></a>
  <a href="https://orm.drizzle.team/"><img src="https://img.shields.io/badge/Drizzle%20ORM-FFE873?logo=drizzle&logoColor=black" alt="Drizzle ORM" /></a>
  <a href="https://neon.tech/"><img src="https://img.shields.io/badge/Neon-00E9CA?logo=neon&logoColor=white" alt="Neon" /></a>
  <a href="https://trpc.io/"><img src="https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white" alt="tRPC" /></a>
</p>

## 기본이 프라이빗

- **소스 공개**: 전체 소스가 Elastic License 2.0(ELv2)으로 GitHub에 공개되어 있습니다.
- **명시적 연결**: 어떤 에이전트, 프로바이더, 통합을 연결할지 직접 선택합니다.

## 기여

기여를 환영합니다! 환경을 준비하고 PR을 여는 방법은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참고하세요. 버그와 기능 요청은 [issues](https://github.com/superset-sh/superset/issues)에 남겨 주세요.

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## 커뮤니티

Superset 커뮤니티에 참여해 도움을 받고, 피드백을 나누고, 다른 사용자와 교류하세요:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: 팀 및 커뮤니티와 대화
- **[Twitter](https://x.com/superset_sh)**: 업데이트와 소식 팔로우
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: 버그 신고와 기능 요청
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: 질문과 아이디어 공유

### 팀

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## 라이선스, 그리고 영원히 무료인 것

**데스크톱 앱은 영원히 무료입니다.** 자신의 컴퓨터에서 에이전트를 병렬로 실행하는 데는 결코 비용이 들지 않습니다. 유료화가 있더라도 그 위에 얹히는 선택적 서비스일 뿐입니다.

앱 전체가 이 저장소에 [Elastic License 2.0](../LICENSE.md)으로 공개되어 있습니다: 사용하고, 포크하고, 수정하고, 팀을 위해 셀프 호스팅하세요. 유일하게 안 되는 것은 Superset 자체를 서비스로 재포장해 다른 사람에게 판매하는 것뿐입니다.
