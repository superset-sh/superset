<div align="center">

<img width="full" alt="Claude e OpenCode al lavoro in parallelo in workspace Superset con diff in tempo reale" src="../apps/marketing/public/images/readme-hero.gif" />

### Esegui più di 100 agenti di coding in parallelo

<details>
<summary>🌐 Leggi in altre lingue</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Traduzione del README in inglese, che resta la versione di riferimento.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex o qualsiasi agente CLI, ognuno nel proprio worktree isolato.<br />
Passa il tempo a rilasciare, non ad aspettare.

<br />

[**Scarica per macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentazione](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Scrivi codice 10 volte più veloce, senza costi di cambio contesto

Superset esegue agenti di coding CLI in parallelo su worktree git isolati, con terminale integrato, revisione delle modifiche e apertura diretta nell'editor.

- **Esegui più agenti contemporaneamente** senza l'overhead del cambio di contesto
- **Isola ogni attività** nel proprio worktree git, così gli agenti non interferiscono tra loro
- **Monitora tutti i tuoi agenti** da un unico posto e ricevi una notifica quando serve il tuo intervento
- **Rivedi e modifica le modifiche rapidamente** con il visualizzatore di diff e l'editor integrati
- **Apri qualsiasi workspace dove ti serve** con il passaggio in un clic al tuo editor o terminale
- **Raggiungi i tuoi workspace da ovunque** tramite host remoti, la CLI, l'SDK o MCP

Aspetta meno, rilascia di più.

## Funzionalità

<table>
<tr>
<td width="50%" valign="middle">

### Workspace paralleli

Esegui più di 100 agenti di coding alla volta, ognuno nel proprio worktree git con il proprio branch, terminale e ambiente. Confronta i risultati e fai il merge del migliore.

[Documentazione →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude esegue in streaming una migrazione del billing mentre altri agenti lavorano in workspace paralleli" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Monitoraggio degli agenti

Tieni traccia di ogni agente dalla barra laterale, con indicatori di lavoro, suoni di completamento e badge nel dock quando uno richiede la tua attenzione.

[Documentazione →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Un agente termina la sua attività e lo stato nella barra laterale passa da in lavorazione a completato" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminale integrato

Schede, split infiniti, preset e sessioni persistenti che sopravvivono ai riavvii. Premi ⌘I per un editor di prompt avanzato con modifica multilinea e menzioni @-file.

[Documentazione →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Digitazione di un follow-up con una menzione @-file nell'editor di prompt avanzato accanto a un terminale diviso" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Visualizzatore di diff integrato

Ispeziona, commenta e modifica le modifiche degli agenti senza uscire dall'app, poi fai commit e push quando è tutto pronto.

[Documentazione →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Revisione delle modifiche di un agente nel visualizzatore di diff" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Browser in-app e porte

Visualizza in anteprima i dev server in esecuzione in un pannello browser. Le porte vengono rilevate per workspace, così ogni worktree ha la propria anteprima.

[Documentazione →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Browser in-app che mostra l'anteprima di un dev server con le porte rilevate" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automazioni

Esegui sessioni di agenti su pianificazione: fai il triage delle issue durante la notte, prepara la bozza del changelog settimanale, mantieni aggiornate le dipendenze.

[Documentazione →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Automazioni di agenti pianificate" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Accesso remoto

Collega un'altra macchina e raggiungi i suoi workspace da ovunque: l'app desktop, la CLI o il tuo telefono. Riattiva gli host offline con un comando personalizzato.

[Documentazione →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Host e membri nelle impostazioni dell'organizzazione" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### CLI di Superset

Scriptalo da qualsiasi shell: crea workspace, avvia agenti, leggi i loro terminali e gestisci le automazioni con un singolo binario. Se un agente può eseguire un comando, può pilotare Superset.

[Documentazione →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Creazione di un workspace e avvio di un agente dalla CLI di Superset" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Palette dei comandi

Salta a qualsiasi workspace, azione o impostazione da un'unica casella di ricerca.

[Documentazione →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Digitazione nella palette dei comandi con filtraggio in tempo reale delle azioni del workspace" width="100%" /></a>
</td>
</tr>
</table>

**Inclusi nella confezione:**

- **[Skill integrate](https://docs.superset.sh/skills)**: gli agenti arrivano precaricati con le skill `superset:*` (orchestrare agenti paralleli, pianificare automazioni, inviare feedback, diagnosticare problemi), fornite automaticamente all'avvio
- **[Selettore di modello e agenti personalizzati](https://docs.superset.sh/agent-integration)**: scegli un modello e il livello di ragionamento all'avvio, e aggiungi qualsiasi agente da terminale con la propria icona
- **[Script di setup del workspace](https://docs.superset.sh/setup-teardown-scripts)**: automatizza la configurazione dell'ambiente, l'installazione delle dipendenze e i dev server per ogni workspace
- **[Preset del terminale](https://docs.superset.sh/terminal-presets)**: salva layout di agenti e shell e aprili con un solo tasto
- **[Slack e Linear](https://docs.superset.sh/use-with-linear)**: crea workspace da messaggi Slack o issue Linear
- **[Apri nel tuo IDE](https://docs.superset.sh/use-with-ide)**: passaggio in un clic a Cursor, VS Code o qualsiasi editor
- **[Temi personalizzati](https://docs.superset.sh/custom-themes)**: crea, modifica e importa file di tema
- **[Scorciatoie da tastiera](https://docs.superset.sh/keyboard-shortcuts)**: ogni azione è rimappabile in **Impostazioni → Scorciatoie da tastiera** (⌘/)
- **[Porta i tuoi provider](https://docs.superset.sh/providers)**: collega OpenRouter, Bedrock, Vertex o Vercel AI Gateway
- **E molto altro**: rilasciamo ogni giorno, quindi questa lista è perennemente indietro. Il [changelog](https://superset.sh/changelog) è la vera lista delle funzionalità.

## Agenti supportati

Superset funziona con qualsiasi agente di coding basato su CLI, tra cui:

| Agente | Stato |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Supporto completo |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Supporto completo |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Supporto completo |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Supporto completo |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Supporto completo |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Supporto completo |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Supporto completo |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Supporto completo |
| Qualsiasi altro agente CLI | Funziona senza configurazione |

Se gira in un terminale, gira su Superset

Gli agenti ottengono più di un semplice terminale:

- **Selettore di modello**: scegli un modello e il livello di ragionamento quando avvii un agente
- **Impostazioni per agente**: regola comandi di avvio, template di prompt e override dei modelli in Impostazioni → Agenti
- **Agenti personalizzati**: aggiungi qualsiasi agente da terminale con la propria icona e funzionerà come uno integrato
- **Stato e notifiche**: indicatori di lavoro, suoni di completamento e badge nel dock quando un agente ha bisogno di te
- **Chat integrata**: parla con i modelli in un pannello di chat, con approvazioni degli strumenti inline e revisione dei piani

## Più di un'app desktop

Ogni superficie parla con gli stessi workspace, così puoi avviare un'attività nell'app e controllarla da ovunque.

| Superficie | Cosa ottieni |
|:--------|:-------------|
| [**App desktop**](https://github.com/superset-sh/superset/releases/latest) | L'IDE completo: terminali, visualizzatore di diff, browser in-app, automazioni |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Un singolo binario `superset` per gestire workspace, agenti, terminali e host da qualsiasi shell |
| [**SDK TypeScript**](https://docs.superset.sh/sdk/getting-started) | Pilota Superset programmaticamente con [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) da Node, Bun o Deno |
| [**Server MCP**](https://docs.superset.sh/mcp) | Lascia che Claude Code, Codex, Cursor e altri agenti creino e gestiscano i workspace in autonomia |

La CLI è inclusa nell'app desktop, oppure installala standalone:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Un'app iOS è in arrivo, così potrai controllare i tuoi agenti dal telefono.

## Installazione

Scarica l'app desktop:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (sperimentale; macOS è la piattaforma principale)
- **Windows**: non ancora disponibile
- [Tutte le build](https://github.com/superset-sh/superset/releases/latest)

L'unica cosa che serve avere installata è [Git](https://git-scm.com/). [gh](https://cli.github.com/) è opzionale e sblocca i flussi di lavoro per le PR; Superset si offre di installarlo per te.

## Sviluppo

Vuoi lavorare su Superset o contribuire con una PR? Clona il repository, aggiungilo
all'app Superset installata e crea un workspace per la tua modifica:

```bash
git clone https://github.com/superset-sh/superset.git
```

Poi esegui il setup di sviluppo dal terminale di quel workspace:

```bash
./.superset/setup.local.sh
bun run dev
```

Esegui `setup.local.sh` una volta in ogni nuovo worktree. Configura l'identità
dell'app e le porte specifiche del workspace, così l'app desktop di sviluppo può
girare accanto all'app Superset installata e agli altri worktree di sviluppo.

Non servono account Neon né credenziali di terze parti. `setup.local.sh` avvia
uno stack locale Postgres + Electric via Docker e crea un account di sviluppo. Accedi
con il pulsante **"Sign in as dev"** (oppure `admin@local.test` / `supersetdev`).

Prerequisiti: [Bun](https://bun.sh/) v1.3.14+ (fissato in `.bun-version`), `docker`, `jq` e `caddy`, che `bun dev` esegue come proxy HTTPS locale (`brew install jq caddy && caddy trust`).

Consulta [**DEVELOPMENT.md**](../DEVELOPMENT.md) per la guida completa: cosa fa lo script di setup, il setup manuale con servizi reali, i comandi comuni, la risoluzione dei problemi e come compilare l'app desktop. Il processo di contribuzione è descritto in [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configurazione

Configura gli script di setup, teardown e run del workspace in `.superset/config.json`. Vedi la [documentazione completa](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Le scorciatoie da tastiera sono personalizzabili in **Impostazioni → Scorciatoie da tastiera** (⌘/); vedi la [lista completa delle scorciatoie](https://docs.superset.sh/keyboard-shortcuts).

## Stack tecnologico

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

## Privato per impostazione predefinita

- **Source Available**: il codice sorgente completo è su GitHub sotto Elastic License 2.0 (ELv2).
- **Connessioni esplicite**: scegli tu quali agenti, provider e integrazioni collegare.

## Contribuire

I contributi sono benvenuti! Vedi [CONTRIBUTING.md](../CONTRIBUTING.md) per come configurare l'ambiente e aprire una PR. Bug e richieste di funzionalità vanno nelle [issue](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Community

Unisciti alla community di Superset per ricevere aiuto, condividere feedback e connetterti con altri utenti:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chatta con il team e la community
- **[Twitter](https://x.com/superset_sh)**: seguici per aggiornamenti e annunci
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: segnala bug e richiedi funzionalità
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: fai domande e condividi idee

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licenza e cosa è gratis per sempre

**L'app desktop è gratis per sempre.** Eseguire agenti in parallelo sulla tua macchina non richiederà mai un pagamento. Tutto ciò che faremo pagare sarà un servizio opzionale in aggiunta.

L'intera app è in questo repo sotto la [Elastic License 2.0](../LICENSE.md): usala, forkala, modificala, ospitala per il tuo team. L'unica cosa esclusa è riconfezionare Superset stesso come servizio da vendere ad altri.
