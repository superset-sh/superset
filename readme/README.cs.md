<div align="center">

<img width="full" alt="Claude a OpenCode pracují paralelně v pracovních prostorech Supersetu s živými diffy" src="../apps/marketing/public/images/readme-hero.gif" />

### Spusťte 100+ kódovacích agentů paralelně

<details>
<summary>🌐 Číst v jiných jazycích</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Toto je překlad anglického README, které je závazné.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex nebo libovolný CLI agent, každý ve vlastním izolovaném worktree.<br />
Trávte čas dodáváním, ne čekáním.

<br />

[**Stáhnout pro macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Dokumentace](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Kódujte 10x rychleji bez nákladů na přepínání

Superset spouští CLI kódovací agenty paralelně v izolovaných git worktree, s vestavěným terminálem, review a workflow otevření v editoru.

- **Spouštějte více agentů současně** bez režie přepínání kontextu
- **Izolujte každý úkol** ve vlastním git worktree, takže si agenti navzájem nezasahují do práce
- **Sledujte všechny své agenty** z jednoho místa a dostaňte upozornění, když potřebují pozornost
- **Rychle kontrolujte a upravujte změny** ve vestavěném diff prohlížeči a editoru
- **Otevřete kterýkoli pracovní prostor tam, kde ho potřebujete** — předání do editoru nebo terminálu jedním kliknutím
- **Dostaňte se ke svým pracovním prostorům odkudkoli** přes vzdálené hostitele, CLI, SDK nebo MCP

Méně čekání, více dodávání.

## Funkce

<table>
<tr>
<td width="50%" valign="middle">

### Paralelní pracovní prostory

Spusťte 100+ kódovacích agentů najednou, každého ve vlastním git worktree s vlastní větví, terminálem a prostředím. Porovnejte výsledky a slučte vítěze.

[Dokumentace →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude streamuje migraci billingu, zatímco další agenti běží v paralelních pracovních prostorech" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Monitorování agentů

Sledujte každého agenta z postranního panelu — indikátory práce, zvuky dokončení a odznaky v docku, když někdo potřebuje vaši pozornost.

[Dokumentace →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Agent dokončuje svůj úkol a stav v postranním panelu se přepíná z práce na hotovo" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vestavěný terminál

Karty, neomezené rozdělení, předvolby a perzistentní relace, které přežijí restart. Stiskněte ⌘I pro bohatý editor promptů s víceřádkovými úpravami a @-zmínkami souborů.

[Dokumentace →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Psaní navazujícího dotazu s @-zmínkou souboru v bohatém editoru promptů vedle rozděleného terminálu" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vestavěný diff prohlížeč

Prohlížejte, komentujte a upravujte změny agentů bez opuštění aplikace, a až budou hotové, commitněte a pushněte je.

[Dokumentace →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Kontrola změn agenta v diff prohlížeči" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vestavěný prohlížeč a porty

Prohlížejte běžící dev servery v panelu prohlížeče. Porty se detekují pro každý pracovní prostor zvlášť, takže každý worktree má vlastní náhled.

[Dokumentace →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Vestavěný prohlížeč s náhledem dev serveru a detekovanými porty" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatizace

Spouštějte relace agentů podle plánu: přes noc roztřiďte issues, připravte týdenní changelog, udržujte závislosti aktuální.

[Dokumentace →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Naplánované automatizace agentů" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vzdálený přístup

Připojte další počítač a dostaňte se k jeho pracovním prostorům odkudkoli: z desktopové aplikace, CLI nebo telefonu. Probuďte offline hostitele vlastním příkazem.

[Dokumentace →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hostitelé a členové v nastavení organizace" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Skriptujte z libovolného shellu: vytvářejte pracovní prostory, spouštějte agenty, čtěte jejich terminály a spravujte automatizace jedinou binárkou. Pokud agent umí spustit příkaz, umí řídit Superset.

[Dokumentace →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Vytvoření pracovního prostoru a spuštění agenta ze Superset CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paleta příkazů

Přejděte na libovolný pracovní prostor, akci nebo nastavení z jednoho vyhledávacího pole.

[Dokumentace →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Psaní v paletě příkazů a živé filtrování akcí pracovního prostoru" width="100%" /></a>
</td>
</tr>
</table>

**Také v balení:**

- **[Vestavěné skills](https://docs.superset.sh/skills)**: agenti přicházejí s přednahranými skills `superset:*` (orchestrace paralelních agentů, plánování automatizací, odesílání zpětné vazby, diagnostika problémů), automaticky poskytnutými při spuštění
- **[Výběr modelu a vlastní agenti](https://docs.superset.sh/agent-integration)**: při spuštění zvolte model a úroveň uvažování a přidejte libovolného terminálového agenta s vlastní ikonou
- **[Skripty pro nastavení pracovního prostoru](https://docs.superset.sh/setup-teardown-scripts)**: automatizujte nastavení prostředí, instalaci závislostí a dev servery pro každý pracovní prostor
- **[Předvolby terminálu](https://docs.superset.sh/terminal-presets)**: uložte si rozložení agentů a shellů a otevřete je jedním stiskem klávesy
- **[Slack a Linear](https://docs.superset.sh/use-with-linear)**: vytvářejte pracovní prostory ze zpráv na Slacku nebo issues v Linearu
- **[Otevření ve vašem IDE](https://docs.superset.sh/use-with-ide)**: předání jedním kliknutím do Cursoru, VS Code nebo jakéhokoli editoru
- **[Vlastní motivy](https://docs.superset.sh/custom-themes)**: vytvářejte, upravujte a importujte soubory motivů
- **[Klávesové zkratky](https://docs.superset.sh/keyboard-shortcuts)**: každou akci lze přemapovat přes **Nastavení → Klávesové zkratky** (⌘/)
- **[Přineste si vlastní poskytovatele](https://docs.superset.sh/providers)**: připojte OpenRouter, Bedrock, Vertex nebo Vercel AI Gateway
- **A mnoho dalšího**: dodáváme denně, takže tento seznam je věčně pozadu. Skutečný seznam funkcí je [changelog](https://superset.sh/changelog).

## Podporovaní agenti

Superset funguje s libovolným CLI kódovacím agentem, mimo jiné:

| Agent | Stav |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Plně podporován |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Plně podporován |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Plně podporován |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Plně podporován |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Plně podporován |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Plně podporován |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Plně podporován |
| Jakýkoli jiný CLI agent | Funguje bez konfigurace |

Pokud běží v terminálu, běží na Supersetu

Agenti dostávají víc než jen terminál:

- **Výběr modelu**: při spuštění agenta zvolte model a úroveň uvažování
- **Nastavení pro každého agenta**: dolaďte spouštěcí příkazy, šablony promptů a přepsání modelu v Nastavení → Agenti
- **Vlastní agenti**: přidejte libovolného terminálového agenta s vlastní ikonou a bude fungovat jako vestavěný
- **Stav a upozornění**: indikátory práce, zvuky dokončení a odznaky v docku, když vás agent potřebuje
- **Vestavěný chat**: mluvte s modely v chatovacím panelu, s inline schvalováním nástrojů a kontrolou plánu

## Víc než desktopová aplikace

Každé rozhraní komunikuje se stejnými pracovními prostory, takže můžete úkol začít v aplikaci a zkontrolovat ho odkudkoli.

| Rozhraní | Co dostanete |
|:--------|:-------------|
| [**Desktopová aplikace**](https://github.com/superset-sh/superset/releases/latest) | Plnohodnotné IDE: terminály, diff prohlížeč, vestavěný prohlížeč, automatizace |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Jediná binárka `superset` pro správu pracovních prostorů, agentů, terminálů a hostitelů z libovolného shellu |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Řiďte Superset programově pomocí [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) z Node, Bunu nebo Dena |
| [**MCP server**](https://docs.superset.sh/mcp) | Nechte Claude Code, Codex, Cursor a další agenty vytvářet a spravovat pracovní prostory samostatně |

CLI je přibalené k desktopové aplikaci, nebo ho nainstalujte samostatně:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Brzy dorazí iOS aplikace, takže na své agenty dohlédnete i z telefonu.

## Instalace

Stáhněte si desktopovou aplikaci:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (experimentální; primární platformou je macOS)
- **Windows**: zatím není k dispozici
- [Všechny buildy](https://github.com/superset-sh/superset/releases/latest)

Jediné, co potřebujete mít nainstalované, je [Git](https://git-scm.com/). [gh](https://cli.github.com/) je volitelný a odemyká PR workflow; Superset vám ho nabídne nainstalovat.

## Vývoj

Chcete na Supersetu bastlit nebo přispět PR? Naklonujte repozitář, přidejte ho do
nainstalované aplikace Superset a vytvořte pracovní prostor pro svou změnu:

```bash
git clone https://github.com/superset-sh/superset.git
```

Poté z terminálu daného pracovního prostoru spusťte vývojové nastavení:

```bash
./.superset/setup.local.sh
bun run dev
```

Spusťte `setup.local.sh` jednou v každém novém worktree. Nakonfiguruje identitu
aplikace a porty specifické pro pracovní prostor, aby vývojová desktopová aplikace mohla
běžet vedle nainstalované aplikace Superset a dalších vývojových worktree.

Není potřeba účet Neon ani přihlašovací údaje třetích stran. `setup.local.sh` nastartuje
lokální stack Postgres + Electric přes Docker a naplní dev účet. Přihlaste se
tlačítkem **"Sign in as dev"** (nebo `admin@local.test` / `supersetdev`).

Předpoklady: [Bun](https://bun.sh/) v1.3.14+ (připnutý v `.bun-version`), `docker`, `jq` a `caddy`, který `bun dev` spouští jako lokální HTTPS proxy (`brew install jq caddy && caddy trust`).

Kompletního průvodce najdete v [**DEVELOPMENT.md**](../DEVELOPMENT.md): co dělá skript nastavení, ruční nastavení proti skutečným službám, běžné příkazy, řešení problémů a jak sestavit desktopovou aplikaci. Proces přispívání je popsán v [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Konfigurace

Nakonfigurujte skripty setup, teardown a run pracovního prostoru v `.superset/config.json`. Viz [úplná dokumentace](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Klávesové zkratky si můžete přizpůsobit přes **Nastavení → Klávesové zkratky** (⌘/); viz [úplný seznam zkratek](https://docs.superset.sh/keyboard-shortcuts).

## Technologie

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

## Ve výchozím stavu soukromé

- **Dostupný zdrojový kód**: kompletní zdrojový kód je na GitHubu pod licencí Elastic License 2.0 (ELv2).
- **Explicitní připojení**: sami si volíte, které agenty, poskytovatele a integrace připojíte.

## Přispívání

Příspěvky vítáme! V [CONTRIBUTING.md](../CONTRIBUTING.md) najdete, jak se nastavit a otevřít PR. Chyby a požadavky na funkce patří do [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Komunita

Připojte se ke komunitě Supersetu — získáte pomoc, můžete sdílet zpětnou vazbu a poznat další uživatele:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chatujte s týmem a komunitou
- **[Twitter](https://x.com/superset_sh)**: sledujte novinky a oznámení
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: hlaste chyby a žádejte o funkce
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: ptejte se a sdílejte nápady

### Tým

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licence a co je navždy zdarma

**Desktopová aplikace je navždy zdarma.** Paralelní spouštění agentů na vlastním počítači nebude nikdy vyžadovat platbu. Cokoli zpoplatníme, bude volitelná služba navíc.

Celá aplikace je v tomto repozitáři pod licencí [Elastic License 2.0](../LICENSE.md): používejte ji, forkněte ji, upravujte ji, provozujte ji na vlastní infrastruktuře pro svůj tým. Jediné, co nejde, je přebalit samotný Superset jako službu, kterou prodáváte ostatním.
