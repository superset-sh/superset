<div align="center">

<img width="full" alt="Claude y OpenCode trabajando en paralelo en espacios de trabajo de Superset con diffs en vivo" src="../apps/marketing/public/images/readme-hero.gif" />

### Ejecuta más de 100 agentes de código en paralelo

<details>
<summary>🌐 Leer en otros idiomas</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Esta es una traducción del [README en inglés](../README.md), que es la versión canónica.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex o cualquier agente CLI, cada uno en su propio worktree aislado.<br />
Dedica tu tiempo a lanzar código, no a esperar.

<br />

[**Descargar para macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentación](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Programa 10 veces más rápido sin coste de cambio de contexto

Superset ejecuta agentes de código basados en CLI en paralelo en worktrees de git aislados, con terminal, revisión y flujos de apertura en el editor integrados.

- **Ejecuta varios agentes a la vez** sin la sobrecarga del cambio de contexto
- **Aísla cada tarea** en su propio worktree de git para que los agentes no interfieran entre sí
- **Supervisa todos tus agentes** desde un solo lugar y recibe notificaciones cuando necesiten atención
- **Revisa y edita los cambios rápidamente** con el visor de diffs y el editor integrados
- **Abre cualquier espacio de trabajo donde lo necesites** con un traspaso en un clic a tu editor o terminal
- **Accede a tus espacios de trabajo desde cualquier lugar** mediante hosts remotos, la CLI, el SDK o MCP

Espera menos, lanza más.

## Funcionalidades

<table>
<tr>
<td width="50%" valign="middle">

### Espacios de trabajo paralelos

Ejecuta más de 100 agentes de código a la vez, cada uno en su propio worktree de git con su propia branch, terminal y entorno. Compara los resultados y haz merge del ganador.

[Docs →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude transmitiendo una migración de facturación mientras otros agentes trabajan en espacios de trabajo paralelos" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Supervisión de agentes

Sigue cada agente desde la barra lateral, con indicadores de actividad, avisos sonoros al terminar y globos en el dock cuando alguno necesita tu atención.

[Docs →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Un agente terminando su tarea y el estado de la barra lateral pasando de trabajando a terminado" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal integrado

Pestañas, divisiones infinitas, presets y sesiones persistentes que sobreviven a los reinicios. Pulsa ⌘I para un editor de prompts enriquecido con edición multilínea y menciones de archivos con @.

[Docs →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Escribiendo un mensaje de seguimiento con una mención de archivo con @ en el editor de prompts enriquecido junto a un terminal dividido" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Visor de diffs integrado

Inspecciona, comenta y edita los cambios de los agentes sin salir de la app, y luego haz commit y push cuando esté listo.

[Docs →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Revisando los cambios de un agente en el visor de diffs" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Navegador integrado y puertos

Previsualiza los servidores de desarrollo en ejecución en un panel de navegador. Los puertos se detectan por espacio de trabajo, así que cada worktree tiene su propia vista previa.

[Docs →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Navegador integrado previsualizando un servidor de desarrollo con los puertos detectados" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatizaciones

Ejecuta sesiones de agentes de forma programada: clasifica issues durante la noche, redacta el changelog semanal, mantén las dependencias al día.

[Docs →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Automatizaciones de agentes programadas" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Acceso remoto

Conecta otra máquina y accede a sus espacios de trabajo desde cualquier lugar: la app de escritorio, la CLI o tu teléfono. Despierta hosts sin conexión con un comando personalizado.

[Docs →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosts y miembros en la configuración de la organización" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### CLI de Superset

Automatízalo desde cualquier shell: crea espacios de trabajo, lanza agentes, lee sus terminales y gestiona automatizaciones con un solo binario. Si un agente puede ejecutar un comando, puede manejar Superset.

[Docs →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Creando un espacio de trabajo y lanzando un agente desde la CLI de Superset" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paleta de comandos

Salta a cualquier espacio de trabajo, acción o ajuste desde un único cuadro de búsqueda.

[Docs →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Escribiendo en la paleta de comandos y filtrando acciones de espacios de trabajo en vivo" width="100%" /></a>
</td>
</tr>
</table>

**También incluido:**

- **[Habilidades integradas](https://docs.superset.sh/skills)**: los agentes vienen precargados con las habilidades `superset:*` (orquestar agentes en paralelo, programar automatizaciones, enviar feedback, diagnosticar problemas), aprovisionadas automáticamente al lanzarlos
- **[Selector de modelo y agentes personalizados](https://docs.superset.sh/agent-integration)**: elige un modelo y un nivel de razonamiento al lanzar, y añade cualquier agente de terminal con su propio icono
- **[Scripts de configuración de espacios de trabajo](https://docs.superset.sh/setup-teardown-scripts)**: automatiza la preparación del entorno, la instalación de dependencias y los servidores de desarrollo por espacio de trabajo
- **[Presets de terminal](https://docs.superset.sh/terminal-presets)**: guarda disposiciones de agentes y shells y ábrelas con una sola tecla
- **[Slack y Linear](https://docs.superset.sh/use-with-linear)**: crea espacios de trabajo desde mensajes de Slack o issues de Linear
- **[Abrir en tu IDE](https://docs.superset.sh/use-with-ide)**: traspaso en un clic a Cursor, VS Code o cualquier editor
- **[Temas personalizados](https://docs.superset.sh/custom-themes)**: crea, edita e importa archivos de tema
- **[Atajos de teclado](https://docs.superset.sh/keyboard-shortcuts)**: cada acción se puede reasignar en **Configuración → Atajos de teclado** (⌘/)
- **[Trae tus propios proveedores](https://docs.superset.sh/providers)**: conecta OpenRouter, Bedrock, Vertex o Vercel AI Gateway
- **Y mucho más**: lanzamos a diario, así que esta lista siempre va por detrás. El [changelog](https://superset.sh/changelog) es la verdadera lista de funcionalidades.

## Agentes compatibles

Superset funciona con cualquier agente de código basado en CLI, incluidos:

| Agente | Estado |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Totalmente compatible |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Totalmente compatible |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Totalmente compatible |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Totalmente compatible |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Totalmente compatible |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Totalmente compatible |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Totalmente compatible |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Totalmente compatible |
| Cualquier otro agente CLI | Funciona sin configuración |

Si funciona en un terminal, funciona en Superset

Los agentes obtienen más que un terminal:

- **Selector de modelo**: elige un modelo y un nivel de razonamiento al lanzar un agente
- **Configuración por agente**: ajusta comandos de lanzamiento, plantillas de prompts y modelos en Configuración → Agentes
- **Agentes personalizados**: añade cualquier agente de terminal con su propio icono y funcionará como uno integrado
- **Estado y notificaciones**: indicadores de actividad, avisos sonoros al terminar y globos en el dock cuando un agente te necesita
- **Chat integrado**: habla con los modelos en un panel de chat, con aprobación de herramientas en línea y revisión de planes

## Más que una app de escritorio

Todas las superficies hablan con los mismos espacios de trabajo, así que puedes empezar una tarea en la app y seguirla desde cualquier lugar.

| Superficie | Qué obtienes |
|:--------|:-------------|
| [**App de escritorio**](https://github.com/superset-sh/superset/releases/latest) | El IDE completo: terminales, visor de diffs, navegador integrado, automatizaciones |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Un único binario `superset` para gestionar espacios de trabajo, agentes, terminales y hosts desde cualquier shell |
| [**SDK de TypeScript**](https://docs.superset.sh/sdk/getting-started) | Maneja Superset mediante código con [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) desde Node, Bun o Deno |
| [**Servidor MCP**](https://docs.superset.sh/mcp) | Deja que Claude Code, Codex, Cursor y otros agentes creen y gestionen espacios de trabajo por sí mismos |

La CLI viene incluida con la app de escritorio, o instálala por separado:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Pronto llegará una app para iOS para que puedas seguir a tus agentes desde el teléfono.

## Instalación

Descarga la app de escritorio:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [AppImage x64](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (experimental; macOS es el objetivo principal)
- **Windows**: aún no disponible
- [Todas las builds](https://github.com/superset-sh/superset/releases/latest)

Lo único que necesitas tener instalado es [Git](https://git-scm.com/). [gh](https://cli.github.com/) es opcional y desbloquea los flujos de PR; Superset se ofrece a instalarlo por ti.

## Desarrollo

¿Quieres trastear con Superset o contribuir con una PR? Clona el repositorio, añádelo a
la app de Superset instalada y crea un espacio de trabajo para tu cambio:

```bash
git clone https://github.com/superset-sh/superset.git
```

Luego ejecuta la configuración de desarrollo desde el terminal de ese espacio de trabajo:

```bash
./.superset/setup.local.sh
bun run dev
```

Ejecuta `setup.local.sh` una vez en cada worktree nuevo. Configura la identidad de la app
y los puertos específicos del espacio de trabajo para que la app de escritorio de desarrollo
pueda ejecutarse junto a la app de Superset instalada y otros worktrees de desarrollo.

No se necesita cuenta de Neon ni credenciales de terceros. `setup.local.sh` levanta
una pila local de Postgres + Electric mediante Docker y crea una cuenta de desarrollo. Inicia sesión
con el botón **"Sign in as dev"** (o `admin@local.test` / `supersetdev`).

Requisitos previos: [Bun](https://bun.sh/) v1.3.14+ (fijado en `.bun-version`), `docker`, `jq` y `caddy`, que `bun dev` ejecuta como proxy HTTPS local (`brew install jq caddy && caddy trust`).

Consulta [**DEVELOPMENT.md**](../DEVELOPMENT.md) para la guía completa: qué hace el script de configuración, la configuración manual contra servicios reales, comandos habituales, resolución de problemas y cómo compilar la app de escritorio. El proceso de contribución está en [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configuración

Configura los scripts de setup, teardown y run de los espacios de trabajo en `.superset/config.json`. Consulta la [documentación completa](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Los atajos de teclado se pueden personalizar en **Configuración → Atajos de teclado** (⌘/); consulta la [lista completa de atajos](https://docs.superset.sh/keyboard-shortcuts).

## Stack tecnológico

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

## Privado por defecto

- **Código fuente disponible**: todo el código está en GitHub bajo la Elastic License 2.0 (ELv2).
- **Conexiones explícitas**: tú eliges qué agentes, proveedores e integraciones conectar.

## Contribuir

¡Las contribuciones son bienvenidas! Consulta [CONTRIBUTING.md](../CONTRIBUTING.md) para saber cómo prepararte y abrir una PR. Los bugs y las peticiones de funcionalidades van en las [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Comunidad

Únete a la comunidad de Superset para obtener ayuda, compartir feedback y conectar con otros usuarios:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chatea con el equipo y la comunidad
- **[Twitter](https://x.com/superset_sh)**: síguenos para novedades y anuncios
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: informa de bugs y pide funcionalidades
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: haz preguntas y comparte ideas

### Equipo

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licencia y qué es gratis para siempre

**La app de escritorio es gratis para siempre.** Ejecutar agentes en paralelo en tu propia máquina nunca requerirá pago. Todo lo que cobremos será un servicio opcional adicional.

Toda la app está en este repositorio bajo la [Elastic License 2.0](../LICENSE.md): úsala, haz un fork, modifícala, autoalójala para tu equipo. Lo único que queda fuera es reempaquetar el propio Superset como un servicio que vendas a terceros.
