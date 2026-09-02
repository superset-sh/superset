<div align="center">

<img width="full" alt="Claude и OpenCode работают параллельно в рабочих областях Superset с живыми diff" src="../apps/marketing/public/images/readme-hero.gif" />

### Запускайте 100+ агентов для кодинга параллельно

<details>
<summary>🌐 Читать на других языках</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Перевод английского README; канонической является английская версия.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex или любой CLI-агент — каждый в своём изолированном worktree.<br />
Тратьте время на выпуск фич, а не на ожидание.

<br />

[**Скачать для macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Документация](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Пишите код в 10 раз быстрее без затрат на переключение

Superset запускает CLI-агентов для кодинга параллельно в изолированных git worktree, со встроенным терминалом, ревью изменений и открытием в редакторе.

- **Запускайте несколько агентов одновременно** без накладных расходов на переключение контекста
- **Изолируйте каждую задачу** в отдельном git worktree, чтобы агенты не мешали друг другу
- **Следите за всеми агентами** из одного места и получайте уведомления, когда им нужно внимание
- **Быстро проверяйте и правьте изменения** во встроенном просмотрщике diff и редакторе
- **Открывайте любую рабочую область там, где нужно** — передача в редактор или терминал в один клик
- **Подключайтесь к рабочим областям откуда угодно** через удалённые хосты, CLI, SDK или MCP

Меньше ожидания — больше релизов.

## Возможности

<table>
<tr>
<td width="50%" valign="middle">

### Параллельные рабочие области

Запускайте 100+ агентов для кодинга одновременно — каждый в собственном git worktree со своей веткой, терминалом и окружением. Сравните результаты и смержите лучший.

[Документация →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude стримит миграцию биллинга, пока другие агенты работают в параллельных рабочих областях" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Мониторинг агентов

Отслеживайте каждого агента из боковой панели: индикаторы работы, звуковые сигналы о завершении и бейджи в доке, когда агенту нужно ваше внимание.

[Документация →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Агент завершает задачу, и статус в боковой панели меняется с «работает» на «готово»" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Встроенный терминал

Вкладки, бесконечные сплиты, пресеты и постоянные сессии, переживающие перезапуски. Нажмите ⌘I — откроется расширенный редактор промптов с многострочным вводом и упоминаниями файлов через @.

[Документация →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Ввод уточнения с упоминанием файла через @ в расширенном редакторе промптов рядом с разделённым терминалом" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Встроенный просмотрщик diff

Изучайте, комментируйте и правьте изменения агентов, не выходя из приложения, а затем делайте commit и push, когда всё готово.

[Документация →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Ревью изменений агента в просмотрщике diff" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Встроенный браузер и порты

Просматривайте запущенные dev-серверы в панели браузера. Порты определяются для каждой рабочей области, так что у каждого worktree — своё превью.

[Документация →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Встроенный браузер показывает превью dev-сервера с определёнными портами" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Автоматизации

Запускайте сессии агентов по расписанию: разбирайте issue за ночь, готовьте черновик еженедельного changelog, держите зависимости свежими.

[Документация →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Автоматизации агентов по расписанию" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Удалённый доступ

Подключите другую машину и работайте с её рабочими областями откуда угодно: из десктопного приложения, CLI или с телефона. Будите офлайн-хосты пользовательской командой.

[Документация →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Хосты и участники в настройках организации" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Скриптуйте из любой оболочки: создавайте рабочие области, запускайте агентов, читайте их терминалы и управляйте автоматизациями одним бинарником. Если агент умеет выполнять команды, он умеет управлять Superset.

[Документация →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Создание рабочей области и запуск агента из Superset CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Палитра команд

Переходите к любой рабочей области, действию или настройке из одной строки поиска.

[Документация →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Ввод в палитре команд с живой фильтрацией действий рабочей области" width="100%" /></a>
</td>
</tr>
</table>

**Также в комплекте:**

- **[Встроенные навыки](https://docs.superset.sh/skills)**: агенты поставляются с предустановленными навыками `superset:*` (оркестрация параллельных агентов, планирование автоматизаций, отправка отзывов, диагностика проблем), которые устанавливаются автоматически при запуске
- **[Выбор модели и пользовательские агенты](https://docs.superset.sh/agent-integration)**: выбирайте модель и уровень рассуждений при запуске и добавляйте любого терминального агента с собственной иконкой
- **[Скрипты настройки рабочей области](https://docs.superset.sh/setup-teardown-scripts)**: автоматизируйте настройку окружения, установку зависимостей и dev-серверы для каждой рабочей области
- **[Пресеты терминала](https://docs.superset.sh/terminal-presets)**: сохраняйте раскладки агентов и оболочек и открывайте их одним нажатием
- **[Slack и Linear](https://docs.superset.sh/use-with-linear)**: создавайте рабочие области из сообщений Slack или задач Linear
- **[Открытие в вашей IDE](https://docs.superset.sh/use-with-ide)**: передача в Cursor, VS Code или любой редактор в один клик
- **[Пользовательские темы](https://docs.superset.sh/custom-themes)**: создавайте, редактируйте и импортируйте файлы тем
- **[Горячие клавиши](https://docs.superset.sh/keyboard-shortcuts)**: любое действие можно переназначить в **Настройки → Горячие клавиши** (⌘/)
- **[Свои провайдеры](https://docs.superset.sh/providers)**: подключайте OpenRouter, Bedrock, Vertex или Vercel AI Gateway
- **И многое другое**: мы выпускаем обновления каждый день, так что этот список вечно отстаёт. Настоящий список возможностей — [changelog](https://superset.sh/changelog).

## Поддерживаемые агенты

Superset работает с любым CLI-агентом для кодинга, в том числе:

| Агент | Статус |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Полная поддержка |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Полная поддержка |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Полная поддержка |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Полная поддержка |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Полная поддержка |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Полная поддержка |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Полная поддержка |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Полная поддержка |
| Любой другой CLI-агент | Работает без настройки |

Если он запускается в терминале, он работает в Superset

Агенты получают больше, чем просто терминал:

- **Выбор модели**: выбирайте модель и уровень рассуждений при запуске агента
- **Настройки для каждого агента**: настраивайте команды запуска, шаблоны промптов и переопределения моделей в Настройки → Агенты
- **Пользовательские агенты**: добавьте любого терминального агента с собственной иконкой — он будет работать как встроенный
- **Статус и уведомления**: индикаторы работы, звуковые сигналы о завершении и бейджи в доке, когда агенту нужно внимание
- **Встроенный чат**: общайтесь с моделями в панели чата — с инлайн-подтверждением инструментов и ревью планов

## Больше, чем десктопное приложение

Все поверхности работают с одними и теми же рабочими областями: начните задачу в приложении и проверяйте её откуда угодно.

| Поверхность | Что вы получаете |
|:--------|:-------------|
| [**Десктопное приложение**](https://github.com/superset-sh/superset/releases/latest) | Полноценная IDE: терминалы, просмотрщик diff, встроенный браузер, автоматизации |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Единый бинарник `superset` для управления рабочими областями, агентами, терминалами и хостами из любой оболочки |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Управляйте Superset программно через [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) из Node, Bun или Deno |
| [**Сервер MCP**](https://docs.superset.sh/mcp) | Позвольте Claude Code, Codex, Cursor и другим агентам самим создавать рабочие области и управлять ими |

CLI идёт в комплекте с десктопным приложением, либо установите его отдельно:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Скоро выйдет приложение для iOS, чтобы следить за агентами с телефона.

## Установка

Скачайте десктопное приложение:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (экспериментально; основная платформа — macOS)
- **Windows**: пока недоступно
- [Все сборки](https://github.com/superset-sh/superset/releases/latest)

Из установленного нужен только [Git](https://git-scm.com/). [gh](https://cli.github.com/) необязателен и открывает рабочие процессы с PR; Superset предложит установить его за вас.

## Разработка

Хотите поработать над Superset или прислать PR? Клонируйте репозиторий, добавьте его
в установленное приложение Superset и создайте рабочую область для своих изменений:

```bash
git clone https://github.com/superset-sh/superset.git
```

Затем запустите настройку окружения разработки из терминала этой рабочей области:

```bash
./.superset/setup.local.sh
bun run dev
```

Запускайте `setup.local.sh` один раз в каждом новом worktree. Скрипт настраивает
идентичность приложения и порты для конкретной рабочей области, чтобы десктопное
приложение для разработки могло работать рядом с установленным Superset и другими
worktree для разработки.

Аккаунт Neon и сторонние учётные данные не нужны. `setup.local.sh` поднимает
локальный стек Postgres + Electric через Docker и создаёт dev-аккаунт. Войдите
кнопкой **"Sign in as dev"** (или `admin@local.test` / `supersetdev`).

Требования: [Bun](https://bun.sh/) v1.3.14+ (зафиксирован в `.bun-version`), `docker`, `jq` и `caddy`, который `bun dev` запускает как локальный HTTPS-прокси (`brew install jq caddy && caddy trust`).

Полное руководство — в [**DEVELOPMENT.md**](../DEVELOPMENT.md): что делает скрипт настройки, ручная настройка с реальными сервисами, частые команды, устранение неполадок и сборка десктопного приложения. Процесс участия описан в [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Конфигурация

Настройте скрипты setup, teardown и run для рабочих областей в `.superset/config.json`. См. [полную документацию](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Горячие клавиши настраиваются в **Настройки → Горячие клавиши** (⌘/); см. [полный список сочетаний](https://docs.superset.sh/keyboard-shortcuts).

## Технологический стек

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

## Приватность по умолчанию

- **Source Available**: полный исходный код доступен на GitHub под лицензией Elastic License 2.0 (ELv2).
- **Явные подключения**: вы сами выбираете, какие агенты, провайдеры и интеграции подключать.

## Участие в разработке

Мы рады вкладу сообщества! См. [CONTRIBUTING.md](../CONTRIBUTING.md) о том, как настроить окружение и открыть PR. Баги и запросы функций — в [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Сообщество

Присоединяйтесь к сообществу Superset, чтобы получать помощь, делиться отзывами и общаться с другими пользователями:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: общайтесь с командой и сообществом
- **[Twitter](https://x.com/superset_sh)**: подписывайтесь на обновления и анонсы
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: сообщайте о багах и предлагайте функции
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: задавайте вопросы и делитесь идеями

### Команда

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Лицензия и что бесплатно навсегда

**Десктопное приложение бесплатно навсегда.** Параллельный запуск агентов на собственной машине никогда не потребует оплаты. Всё платное будет необязательным сервисом сверху.

Всё приложение находится в этом репозитории под [Elastic License 2.0](../LICENSE.md): используйте, форкайте, изменяйте, разворачивайте для своей команды. Единственное, что запрещено — переупаковывать сам Superset в сервис и продавать его другим.
