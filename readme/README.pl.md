<div align="center">

<img width="full" alt="Claude i OpenCode pracujące równolegle w obszarach roboczych Superset z podglądem różnic na żywo" src="../apps/marketing/public/images/readme-hero.gif" />

### Uruchamiaj ponad 100 agentów kodujących równolegle

<details>
<summary>🌐 Przeczytaj w innych językach</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Tłumaczenie angielskiego README, który pozostaje wersją kanoniczną.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex lub dowolny agent CLI — każdy we własnym, izolowanym worktree.<br />
Poświęcaj czas na dostarczanie, nie na czekanie.

<br />

[**Pobierz na macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Dokumentacja](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Pisz kod 10 razy szybciej bez kosztów przełączania

Superset uruchamia agentów kodujących opartych na CLI równolegle w izolowanych worktree git, z wbudowanym terminalem, przeglądem zmian i otwieraniem w edytorze.

- **Uruchamiaj wielu agentów jednocześnie** bez narzutu przełączania kontekstu
- **Izoluj każde zadanie** we własnym worktree git, aby agenci nie wchodzili sobie w drogę
- **Śledź wszystkich agentów** z jednego miejsca i otrzymuj powiadomienia, gdy potrzebują uwagi
- **Szybko przeglądaj i edytuj zmiany** dzięki wbudowanemu podglądowi różnic i edytorowi
- **Otwieraj dowolny obszar roboczy tam, gdzie potrzeba** — przekazanie do edytora lub terminala jednym kliknięciem
- **Sięgaj po swoje obszary robocze zewsząd** przez zdalne hosty, CLI, SDK lub MCP

Czekaj mniej, dostarczaj więcej.

## Funkcje

<table>
<tr>
<td width="50%" valign="middle">

### Równoległe obszary robocze

Uruchamiaj ponad 100 agentów kodujących naraz — każdy we własnym worktree git z własną gałęzią, terminalem i środowiskiem. Porównaj wyniki i scal zwycięzcę.

[Dokumentacja →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude strumieniuje migrację rozliczeń, podczas gdy inni agenci pracują w równoległych obszarach roboczych" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Monitorowanie agentów

Śledź każdego agenta z paska bocznego — ze wskaźnikami pracy, dźwiękami ukończenia i plakietkami w docku, gdy któryś potrzebuje uwagi.

[Dokumentacja →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Agent kończy zadanie, a status na pasku bocznym zmienia się z pracuje na gotowe" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Wbudowany terminal

Karty, nieskończone podziały, presety i trwałe sesje, które przetrwają restarty. Naciśnij ⌘I, aby otworzyć rozbudowany edytor promptów z edycją wielowierszową i wzmiankami plików przez @.

[Dokumentacja →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Wpisywanie kolejnego polecenia ze wzmianką pliku przez @ w rozbudowanym edytorze promptów obok podzielonego terminala" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Wbudowany podgląd różnic

Sprawdzaj, komentuj i edytuj zmiany agentów bez opuszczania aplikacji, a gdy wszystko gotowe — zrób commit i push.

[Dokumentacja →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Przeglądanie zmian agenta w podglądzie różnic" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Przeglądarka w aplikacji i porty

Podglądaj działające serwery deweloperskie w panelu przeglądarki. Porty są wykrywane per obszar roboczy, więc każdy worktree ma własny podgląd.

[Dokumentacja →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Przeglądarka w aplikacji z podglądem serwera deweloperskiego i wykrytymi portami" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatyzacje

Uruchamiaj sesje agentów według harmonogramu: rób nocny triage zgłoszeń, przygotowuj szkic cotygodniowego changeloga, dbaj o świeżość zależności.

[Dokumentacja →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Zaplanowane automatyzacje agentów" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Dostęp zdalny

Podłącz inną maszynę i korzystaj z jej obszarów roboczych zewsząd: z aplikacji desktopowej, CLI lub telefonu. Wybudzaj hosty offline własnym poleceniem.

[Dokumentacja →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosty i członkowie w ustawieniach organizacji" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Skryptuj z dowolnej powłoki: twórz obszary robocze, uruchamiaj agentów, czytaj ich terminale i zarządzaj automatyzacjami jednym plikiem binarnym. Jeśli agent potrafi uruchomić polecenie, potrafi też sterować Supersetem.

[Dokumentacja →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Tworzenie obszaru roboczego i uruchamianie agenta z Superset CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paleta poleceń

Przeskakuj do dowolnego obszaru roboczego, akcji lub ustawienia z jednego pola wyszukiwania.

[Dokumentacja →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Wpisywanie w palecie poleceń i filtrowanie akcji obszaru roboczego na żywo" width="100%" /></a>
</td>
</tr>
</table>

**Również w zestawie:**

- **[Wbudowane umiejętności](https://docs.superset.sh/skills)**: agenci przychodzą z gotowymi umiejętnościami `superset:*` (orkiestracja równoległych agentów, planowanie automatyzacji, zgłaszanie opinii, diagnozowanie problemów), instalowanymi automatycznie przy starcie
- **[Wybór modelu i własni agenci](https://docs.superset.sh/agent-integration)**: wybierz model i poziom rozumowania przy starcie oraz dodaj dowolnego agenta terminalowego z własną ikoną
- **[Skrypty konfiguracji obszaru roboczego](https://docs.superset.sh/setup-teardown-scripts)**: automatyzuj konfigurację środowiska, instalację zależności i serwery deweloperskie per obszar roboczy
- **[Presety terminala](https://docs.superset.sh/terminal-presets)**: zapisuj układy agentów i powłok i otwieraj je jednym klawiszem
- **[Slack i Linear](https://docs.superset.sh/use-with-linear)**: twórz obszary robocze z wiadomości Slack lub zgłoszeń Linear
- **[Otwieranie w Twoim IDE](https://docs.superset.sh/use-with-ide)**: przekazanie jednym kliknięciem do Cursor, VS Code lub dowolnego edytora
- **[Własne motywy](https://docs.superset.sh/custom-themes)**: twórz, edytuj i importuj pliki motywów
- **[Skróty klawiszowe](https://docs.superset.sh/keyboard-shortcuts)**: każdą akcję można przemapować w **Ustawienia → Skróty klawiszowe** (⌘/)
- **[Własni dostawcy](https://docs.superset.sh/providers)**: podłącz OpenRouter, Bedrock, Vertex lub Vercel AI Gateway
- **I wiele więcej**: wydajemy codziennie, więc ta lista jest wiecznie w tyle. Prawdziwą listą funkcji jest [changelog](https://superset.sh/changelog).

## Obsługiwani agenci

Superset działa z każdym agentem kodującym opartym na CLI, w tym:

| Agent | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Pełne wsparcie |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Pełne wsparcie |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Pełne wsparcie |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Pełne wsparcie |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Pełne wsparcie |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Pełne wsparcie |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Pełne wsparcie |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Pełne wsparcie |
| Dowolny inny agent CLI | Działa bez konfiguracji |

Jeśli działa w terminalu, działa w Superset

Agenci dostają więcej niż terminal:

- **Wybór modelu**: wybierz model i poziom rozumowania przy uruchamianiu agenta
- **Ustawienia per agent**: dostosuj polecenia startowe, szablony promptów i nadpisania modeli w Ustawienia → Agenci
- **Własni agenci**: dodaj dowolnego agenta terminalowego z własną ikoną, a będzie działał jak wbudowany
- **Status i powiadomienia**: wskaźniki pracy, dźwięki ukończenia i plakietki w docku, gdy agent Cię potrzebuje
- **Wbudowany czat**: rozmawiaj z modelami w panelu czatu, z zatwierdzaniem narzędzi inline i przeglądem planów

## Więcej niż aplikacja desktopowa

Każda powierzchnia korzysta z tych samych obszarów roboczych, więc zadanie rozpoczęte w aplikacji można sprawdzać zewsząd.

| Powierzchnia | Co otrzymujesz |
|:--------|:-------------|
| [**Aplikacja desktopowa**](https://github.com/superset-sh/superset/releases/latest) | Pełne IDE: terminale, podgląd różnic, przeglądarka w aplikacji, automatyzacje |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Pojedynczy plik binarny `superset` do zarządzania obszarami roboczymi, agentami, terminalami i hostami z dowolnej powłoki |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Steruj Supersetem programistycznie przez [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) z Node, Bun lub Deno |
| [**Serwer MCP**](https://docs.superset.sh/mcp) | Pozwól Claude Code, Codex, Cursor i innym agentom samodzielnie tworzyć obszary robocze i nimi zarządzać |

CLI jest dołączone do aplikacji desktopowej; można je też zainstalować osobno:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Wkrótce pojawi się aplikacja na iOS, aby doglądać agentów z telefonu.

## Instalacja

Pobierz aplikację desktopową:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (eksperymentalne; głównym celem jest macOS)
- **Windows**: jeszcze niedostępne
- [Wszystkie kompilacje](https://github.com/superset-sh/superset/releases/latest)

Jedyne, co trzeba mieć zainstalowane, to [Git](https://git-scm.com/). [gh](https://cli.github.com/) jest opcjonalny i odblokowuje przepływy pracy z PR; Superset zaproponuje jego instalację.

## Rozwój

Chcesz rozwijać Superset lub wnieść PR? Sklonuj repozytorium, dodaj je do
zainstalowanej aplikacji Superset i utwórz obszar roboczy dla swojej zmiany:

```bash
git clone https://github.com/superset-sh/superset.git
```

Następnie uruchom konfigurację deweloperską z terminala tego obszaru roboczego:

```bash
./.superset/setup.local.sh
bun run dev
```

Uruchom `setup.local.sh` raz w każdym nowym worktree. Skrypt konfiguruje
specyficzną dla obszaru roboczego tożsamość aplikacji i porty, dzięki czemu
deweloperska aplikacja desktopowa może działać obok zainstalowanego Superset
i innych deweloperskich worktree.

Konto Neon ani poświadczenia zewnętrzne nie są potrzebne. `setup.local.sh` uruchamia
lokalny stos Postgres + Electric przez Docker i tworzy konto deweloperskie. Zaloguj się
przyciskiem **"Sign in as dev"** (lub `admin@local.test` / `supersetdev`).

Wymagania: [Bun](https://bun.sh/) v1.3.14+ (przypięty w `.bun-version`), `docker`, `jq` i `caddy`, którego `bun dev` uruchamia jako lokalne proxy HTTPS (`brew install jq caddy && caddy trust`).

Zobacz [**DEVELOPMENT.md**](../DEVELOPMENT.md) — pełny przewodnik: co robi skrypt konfiguracyjny, ręczna konfiguracja z prawdziwymi usługami, częste polecenia, rozwiązywanie problemów i budowanie aplikacji desktopowej. Proces wnoszenia zmian opisano w [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Konfiguracja

Skonfiguruj skrypty setup, teardown i run obszaru roboczego w `.superset/config.json`. Zobacz [pełną dokumentację](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Skróty klawiszowe można dostosować w **Ustawienia → Skróty klawiszowe** (⌘/); zobacz [pełną listę skrótów](https://docs.superset.sh/keyboard-shortcuts).

## Stos technologiczny

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

## Prywatność domyślnie

- **Source Available**: pełny kod źródłowy jest na GitHubie na licencji Elastic License 2.0 (ELv2).
- **Jawne połączenia**: to Ty wybierasz, które agenty, dostawców i integracje podłączyć.

## Wnoszenie zmian

Zapraszamy do współtworzenia! Zobacz [CONTRIBUTING.md](../CONTRIBUTING.md), aby dowiedzieć się, jak się przygotować i otworzyć PR. Błędy i propozycje funkcji zgłaszaj w [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Społeczność

Dołącz do społeczności Superset, aby uzyskać pomoc, dzielić się opiniami i nawiązywać kontakty z innymi użytkownikami:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: rozmawiaj z zespołem i społecznością
- **[Twitter](https://x.com/superset_sh)**: obserwuj, aby śledzić aktualizacje i ogłoszenia
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: zgłaszaj błędy i proponuj funkcje
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: zadawaj pytania i dziel się pomysłami

### Zespół

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licencja i co jest darmowe na zawsze

**Aplikacja desktopowa jest darmowa na zawsze.** Równoległe uruchamianie agentów na własnej maszynie nigdy nie będzie wymagać płatności. Wszystko, za co pobierzemy opłaty, będzie opcjonalną usługą dodatkową.

Cała aplikacja znajduje się w tym repozytorium na licencji [Elastic License 2.0](../LICENSE.md): używaj jej, forkuj, modyfikuj, hostuj samodzielnie dla swojego zespołu. Jedyną rzeczą wykluczoną jest przepakowanie samego Superset jako usługi sprzedawanej innym.
