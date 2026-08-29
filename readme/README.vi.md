<div align="center">

<img width="full" alt="Claude và OpenCode làm việc song song trong các workspace Superset với diff trực tiếp" src="../apps/marketing/public/images/readme-hero.gif" />

### Chạy song song 100+ coding agent

<details>
<summary>🌐 Đọc bằng ngôn ngữ khác</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Đây là bản dịch của README tiếng Anh; bản tiếng Anh là bản chuẩn.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex, hay bất kỳ CLI agent nào, mỗi agent trong một worktree cách ly riêng.<br />
Dành thời gian để ship, không phải để chờ.

<br />

[**Tải về cho macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Tài liệu](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Code nhanh gấp 10 lần mà không tốn chi phí chuyển ngữ cảnh

Superset chạy song song các coding agent dạng CLI trong những git worktree cách ly, với terminal, review và luồng mở-trong-editor tích hợp sẵn.

- **Chạy nhiều agent cùng lúc** mà không mất công chuyển ngữ cảnh
- **Cách ly từng tác vụ** trong git worktree riêng để các agent không giẫm chân nhau
- **Theo dõi mọi agent** từ một nơi và nhận thông báo khi chúng cần bạn chú ý
- **Xem và sửa thay đổi nhanh chóng** với trình xem diff và editor tích hợp
- **Mở bất kỳ workspace nào ở nơi bạn cần** — bàn giao một cú nhấp sang editor hoặc terminal của bạn
- **Truy cập workspace của bạn từ bất cứ đâu** qua host từ xa, CLI, SDK hoặc MCP

Chờ ít hơn, ship nhiều hơn.

## Tính năng

<table>
<tr>
<td width="50%" valign="middle">

### Workspace song song

Chạy 100+ coding agent cùng lúc, mỗi agent trong một git worktree riêng với nhánh, terminal và môi trường riêng. So sánh kết quả và merge phương án thắng cuộc.

[Tài liệu →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude đang stream một cuộc migration billing trong khi các agent khác chạy ở những workspace song song" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Giám sát agent

Theo dõi từng agent từ thanh bên, với chỉ báo đang làm việc, âm báo hoàn thành và badge trên Dock khi có agent cần bạn chú ý.

[Tài liệu →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Một agent hoàn thành tác vụ và trạng thái trên thanh bên chuyển từ đang làm việc sang xong" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal tích hợp

Tab, chia màn hình không giới hạn, preset và các phiên bền vững sống sót qua khởi động lại. Nhấn ⌘I để mở trình soạn prompt phong phú với chỉnh sửa nhiều dòng và nhắc file bằng @.

[Tài liệu →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Gõ câu hỏi tiếp theo với một lượt nhắc file bằng @ trong trình soạn prompt phong phú cạnh terminal được chia đôi" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Trình xem diff tích hợp

Kiểm tra, bình luận và chỉnh sửa thay đổi của agent mà không cần rời ứng dụng, rồi commit và push khi đã sẵn sàng.

[Tài liệu →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Review thay đổi của một agent trong trình xem diff" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Trình duyệt trong ứng dụng & cổng

Xem trước các dev server đang chạy trong một khung trình duyệt. Cổng được phát hiện theo từng workspace, nên mỗi worktree có bản xem trước riêng.

[Tài liệu →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Trình duyệt trong ứng dụng xem trước một dev server với các cổng được phát hiện" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Tự động hóa

Chạy các phiên agent theo lịch: phân loại issue qua đêm, soạn changelog hàng tuần, giữ dependency luôn mới.

[Tài liệu →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Các tự động hóa agent theo lịch" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Truy cập từ xa

Kết nối một máy khác và truy cập workspace của nó từ bất cứ đâu: ứng dụng desktop, CLI hoặc điện thoại của bạn. Đánh thức host đang offline bằng lệnh tùy chỉnh.

[Tài liệu →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Host và thành viên trong cài đặt tổ chức" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Viết script từ bất kỳ shell nào: tạo workspace, khởi chạy agent, đọc terminal của chúng và quản lý tự động hóa với một binary duy nhất. Nếu một agent chạy được lệnh, nó điều khiển được Superset.

[Tài liệu →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Tạo một workspace và khởi chạy một agent từ Superset CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Bảng lệnh

Nhảy đến bất kỳ workspace, hành động hay cài đặt nào từ một ô tìm kiếm duy nhất.

[Tài liệu →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Gõ trong bảng lệnh và lọc trực tiếp các hành động của workspace" width="100%" /></a>
</td>
</tr>
</table>

**Cũng có sẵn trong hộp:**

- **[Skill tích hợp](https://docs.superset.sh/skills)**: agent được nạp sẵn các skill `superset:*` (điều phối agent song song, lên lịch tự động hóa, gửi phản hồi, chẩn đoán sự cố), được cung cấp tự động khi khởi chạy
- **[Bộ chọn model & agent tùy chỉnh](https://docs.superset.sh/agent-integration)**: chọn model và mức độ suy luận khi khởi chạy, và thêm bất kỳ terminal agent nào với icon riêng
- **[Script thiết lập workspace](https://docs.superset.sh/setup-teardown-scripts)**: tự động hóa thiết lập env, cài đặt dependency và dev server cho từng workspace
- **[Preset terminal](https://docs.superset.sh/terminal-presets)**: lưu bố cục agent và shell rồi mở chúng bằng một phím bấm
- **[Slack & Linear](https://docs.superset.sh/use-with-linear)**: tạo workspace từ tin nhắn Slack hoặc issue Linear
- **[Mở trong IDE của bạn](https://docs.superset.sh/use-with-ide)**: bàn giao một cú nhấp sang Cursor, VS Code hoặc bất kỳ editor nào
- **[Theme tùy chỉnh](https://docs.superset.sh/custom-themes)**: tạo, chỉnh sửa và nhập file theme
- **[Phím tắt](https://docs.superset.sh/keyboard-shortcuts)**: mọi hành động đều gán lại được qua **Cài đặt → Phím tắt** (⌘/)
- **[Mang provider của riêng bạn](https://docs.superset.sh/providers)**: kết nối OpenRouter, Bedrock, Vertex hoặc Vercel AI Gateway
- **Và còn nhiều nữa**: chúng tôi ship hàng ngày, nên danh sách này luôn bị tụt hậu. [Changelog](https://superset.sh/changelog) mới là danh sách tính năng thật sự.

## Các agent được hỗ trợ

Superset hoạt động với bất kỳ coding agent dạng CLI nào, bao gồm:

| Agent | Trạng thái |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Hỗ trợ đầy đủ |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Hỗ trợ đầy đủ |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Hỗ trợ đầy đủ |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Hỗ trợ đầy đủ |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Hỗ trợ đầy đủ |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Hỗ trợ đầy đủ |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Hỗ trợ đầy đủ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Hỗ trợ đầy đủ |
| Bất kỳ CLI agent nào khác | Hoạt động không cần cấu hình |

Nếu nó chạy được trong terminal, nó chạy được trên Superset

Agent nhận được nhiều hơn một chiếc terminal:

- **Bộ chọn model**: chọn model và mức độ suy luận khi bạn khởi chạy agent
- **Cài đặt theo từng agent**: tinh chỉnh lệnh khởi chạy, mẫu prompt và ghi đè model trong Cài đặt → Agent
- **Agent tùy chỉnh**: thêm bất kỳ terminal agent nào với icon riêng và nó hoạt động như agent tích hợp sẵn
- **Trạng thái và thông báo**: chỉ báo đang làm việc, âm báo hoàn thành và badge trên Dock khi một agent cần bạn
- **Chat tích hợp**: trò chuyện với các model trong khung chat, với phê duyệt công cụ inline và review kế hoạch

## Nhiều hơn một ứng dụng desktop

Mọi bề mặt đều nói chuyện với cùng những workspace, nên bạn có thể bắt đầu một tác vụ trong ứng dụng và theo dõi nó từ bất cứ đâu.

| Bề mặt | Bạn nhận được gì |
|:--------|:-------------|
| [**Ứng dụng desktop**](https://github.com/superset-sh/superset/releases/latest) | IDE đầy đủ: terminal, trình xem diff, trình duyệt trong ứng dụng, tự động hóa |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Một binary `superset` duy nhất để quản lý workspace, agent, terminal và host từ bất kỳ shell nào |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Điều khiển Superset bằng lập trình với [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) từ Node, Bun hoặc Deno |
| [**MCP Server**](https://docs.superset.sh/mcp) | Để Claude Code, Codex, Cursor và các agent khác tự tạo và quản lý workspace |

CLI được đóng gói kèm ứng dụng desktop, hoặc cài riêng:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Ứng dụng iOS sẽ sớm ra mắt để bạn theo dõi các agent từ điện thoại.

## Cài đặt

Tải ứng dụng desktop:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (thử nghiệm; macOS là nền tảng chính)
- **Windows**: chưa có
- [Tất cả các bản build](https://github.com/superset-sh/superset/releases/latest)

Tất cả những gì bạn cần cài là [Git](https://git-scm.com/). [gh](https://cli.github.com/) là tùy chọn và mở khóa các luồng làm việc PR; Superset sẽ đề nghị cài nó cho bạn.

## Phát triển

Muốn vọc Superset hay đóng góp một PR? Clone repository, thêm nó vào
ứng dụng Superset đã cài, rồi tạo một workspace cho thay đổi của bạn:

```bash
git clone https://github.com/superset-sh/superset.git
```

Sau đó chạy thiết lập phát triển từ terminal của workspace đó:

```bash
./.superset/setup.local.sh
bun run dev
```

Chạy `setup.local.sh` một lần trong mỗi worktree mới. Nó cấu hình danh tính ứng dụng
và cổng riêng cho từng workspace để ứng dụng desktop bản phát triển có thể chạy
song song với ứng dụng Superset đã cài và các worktree phát triển khác.

Không cần tài khoản Neon hay thông tin xác thực bên thứ ba. `setup.local.sh` dựng
một stack Postgres + Electric cục bộ qua Docker và seed sẵn một tài khoản dev. Đăng nhập
bằng nút **"Sign in as dev"** (hoặc `admin@local.test` / `supersetdev`).

Yêu cầu trước: [Bun](https://bun.sh/) v1.3.14+ (ghim trong `.bun-version`), `docker`, `jq` và `caddy`, thứ mà `bun dev` chạy làm proxy HTTPS cục bộ (`brew install jq caddy && caddy trust`).

Xem [**DEVELOPMENT.md**](../DEVELOPMENT.md) để có hướng dẫn đầy đủ: script thiết lập làm gì, thiết lập thủ công với dịch vụ thật, các lệnh thường dùng, xử lý sự cố và cách build ứng dụng desktop. Quy trình đóng góp nằm trong [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Cấu hình

Cấu hình các script setup, teardown và run của workspace trong `.superset/config.json`. Xem [tài liệu đầy đủ](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Phím tắt có thể tùy chỉnh qua **Cài đặt → Phím tắt** (⌘/); xem [danh sách phím tắt đầy đủ](https://docs.superset.sh/keyboard-shortcuts).

## Công nghệ sử dụng

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

## Riêng tư theo mặc định

- **Mã nguồn công khai**: toàn bộ mã nguồn ở trên GitHub theo giấy phép Elastic License 2.0 (ELv2).
- **Kết nối tường minh**: bạn tự chọn agent, provider và tích hợp nào được kết nối.

## Đóng góp

Chúng tôi hoan nghênh mọi đóng góp! Xem [CONTRIBUTING.md](../CONTRIBUTING.md) để biết cách thiết lập và mở một PR. Bug và yêu cầu tính năng gửi vào [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Cộng đồng

Tham gia cộng đồng Superset để được trợ giúp, chia sẻ phản hồi và kết nối với những người dùng khác:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: trò chuyện với đội ngũ và cộng đồng
- **[Twitter](https://x.com/superset_sh)**: theo dõi để nhận cập nhật và thông báo
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: báo bug và yêu cầu tính năng
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: đặt câu hỏi và chia sẻ ý tưởng

### Đội ngũ

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Giấy phép & những gì miễn phí mãi mãi

**Ứng dụng desktop miễn phí mãi mãi.** Chạy song song các agent trên máy của chính bạn sẽ không bao giờ phải trả tiền. Bất cứ thứ gì chúng tôi thu phí sẽ là dịch vụ tùy chọn nằm bên trên.

Toàn bộ ứng dụng nằm trong repo này theo giấy phép [Elastic License 2.0](../LICENSE.md): cứ dùng, fork, chỉnh sửa, tự host cho đội ngũ của bạn. Điều duy nhất không được phép là đóng gói lại chính Superset thành dịch vụ bạn bán cho người khác.
