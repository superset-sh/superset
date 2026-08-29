<div align="center">

<img width="full" alt="Claude dan OpenCode bekerja paralel di workspace Superset dengan diff langsung" src="../apps/marketing/public/images/readme-hero.gif" />

### Jalankan 100+ Agen Coding Secara Paralel

<details>
<summary>🌐 Baca dalam bahasa lain</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Ini adalah terjemahan dari README bahasa Inggris, yang menjadi acuan resmi.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex, atau agen CLI apa pun, masing-masing di worktree terisolasinya sendiri.<br />
Habiskan waktu Anda untuk shipping, bukan menunggu.

<br />

[**Unduh untuk macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Dokumentasi](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Coding 10x Lebih Cepat Tanpa Biaya Berpindah Konteks

Superset menjalankan agen coding berbasis CLI secara paralel di git worktree yang terisolasi, dengan alur kerja terminal, review, dan buka-di-editor bawaan.

- **Jalankan banyak agen sekaligus** tanpa beban berpindah konteks
- **Isolasi tiap tugas** di git worktree-nya sendiri sehingga agen tidak saling mengganggu
- **Pantau semua agen Anda** dari satu tempat dan dapatkan notifikasi saat mereka butuh perhatian
- **Review dan edit perubahan dengan cepat** lewat diff viewer dan editor bawaan
- **Buka workspace mana pun di tempat yang Anda butuhkan** dengan serah terima sekali klik ke editor atau terminal Anda
- **Akses workspace Anda dari mana saja** lewat host jarak jauh, CLI, SDK, atau MCP

Lebih sedikit menunggu, lebih banyak shipping.

## Fitur

<table>
<tr>
<td width="50%" valign="middle">

### Workspace Paralel

Jalankan 100+ agen coding sekaligus, masing-masing di git worktree-nya sendiri dengan branch, terminal, dan lingkungannya sendiri. Bandingkan hasilnya dan merge pemenangnya.

[Dokumentasi →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude sedang men-streaming migrasi billing sementara agen lain berjalan di workspace paralel" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Pemantauan Agen

Lacak setiap agen dari sidebar, dengan indikator bekerja, bunyi penanda selesai, dan badge dock saat ada yang butuh perhatian Anda.

[Dokumentasi →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Agen menyelesaikan tugasnya dan status di sidebar berubah dari bekerja menjadi selesai" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal Bawaan

Tab, split tanpa batas, preset, dan sesi persisten yang bertahan setelah restart. Tekan ⌘I untuk editor prompt kaya dengan pengeditan multibaris dan mention file dengan @.

[Dokumentasi →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Mengetik tindak lanjut dengan mention file @ di editor prompt kaya di samping terminal yang di-split" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Diff Viewer Bawaan

Periksa, komentari, dan edit perubahan agen tanpa meninggalkan aplikasi, lalu commit dan push saat sudah siap.

[Dokumentasi →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Me-review perubahan agen di diff viewer" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Browser Dalam Aplikasi & Port

Pratinjau server dev yang berjalan di panel browser. Port dideteksi per workspace, jadi setiap worktree mendapat pratinjaunya sendiri.

[Dokumentasi →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Browser dalam aplikasi menampilkan pratinjau server dev dengan port yang terdeteksi" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Otomatisasi

Jalankan sesi agen sesuai jadwal: triase issue semalaman, susun draf changelog mingguan, jaga dependensi tetap mutakhir.

[Dokumentasi →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Otomatisasi agen terjadwal" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Akses Jarak Jauh

Hubungkan mesin lain dan akses workspace-nya dari mana saja: aplikasi desktop, CLI, atau ponsel Anda. Bangunkan host yang offline dengan perintah kustom.

[Dokumentasi →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Host dan anggota di pengaturan organisasi" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Skrip dari shell mana pun: buat workspace, luncurkan agen, baca terminal mereka, dan kelola otomatisasi dengan satu binary. Kalau sebuah agen bisa menjalankan perintah, ia bisa mengendalikan Superset.

[Dokumentasi →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Membuat workspace dan meluncurkan agen dari Superset CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Palet Perintah

Lompat ke workspace, aksi, atau pengaturan mana pun dari satu kotak pencarian.

[Dokumentasi →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Mengetik di palet perintah dan memfilter aksi workspace secara langsung" width="100%" /></a>
</td>
</tr>
</table>

**Juga sudah termasuk:**

- **[Skill bawaan](https://docs.superset.sh/skills)**: agen sudah dimuat dengan skill `superset:*` (mengorkestrasi agen paralel, menjadwalkan otomatisasi, mengirim umpan balik, mendiagnosis masalah), disediakan otomatis saat diluncurkan
- **[Pemilih model & agen kustom](https://docs.superset.sh/agent-integration)**: pilih model dan tingkat penalaran saat meluncurkan, dan tambahkan agen terminal apa pun dengan ikonnya sendiri
- **[Skrip setup workspace](https://docs.superset.sh/setup-teardown-scripts)**: otomatiskan setup env, instalasi dependensi, dan server dev per workspace
- **[Preset terminal](https://docs.superset.sh/terminal-presets)**: simpan tata letak agen dan shell lalu buka dengan satu tekanan tombol
- **[Slack & Linear](https://docs.superset.sh/use-with-linear)**: buat workspace dari pesan Slack atau issue Linear
- **[Buka di IDE Anda](https://docs.superset.sh/use-with-ide)**: serah terima sekali klik ke Cursor, VS Code, atau editor apa pun
- **[Tema kustom](https://docs.superset.sh/custom-themes)**: buat, edit, dan impor berkas tema
- **[Pintasan keyboard](https://docs.superset.sh/keyboard-shortcuts)**: setiap aksi bisa dipetakan ulang lewat **Pengaturan → Pintasan Keyboard** (⌘/)
- **[Bawa provider Anda sendiri](https://docs.superset.sh/providers)**: hubungkan OpenRouter, Bedrock, Vertex, atau Vercel AI Gateway
- **Dan masih banyak lagi**: kami shipping setiap hari, jadi daftar ini selalu tertinggal. [Changelog](https://superset.sh/changelog) adalah daftar fitur yang sebenarnya.

## Agen yang Didukung

Superset bekerja dengan agen coding berbasis CLI apa pun, termasuk:

| Agen | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Didukung penuh |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Didukung penuh |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Didukung penuh |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Didukung penuh |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Didukung penuh |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Didukung penuh |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Didukung penuh |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Didukung penuh |
| Agen CLI lainnya | Bekerja tanpa konfigurasi |

Kalau bisa berjalan di terminal, ia bisa berjalan di Superset

Agen mendapat lebih dari sekadar terminal:

- **Pemilih model**: pilih model dan tingkat penalaran saat Anda meluncurkan agen
- **Pengaturan per agen**: atur perintah peluncuran, templat prompt, dan override model di Pengaturan → Agen
- **Agen kustom**: tambahkan agen terminal apa pun dengan ikonnya sendiri dan ia bekerja seperti agen bawaan
- **Status dan notifikasi**: indikator bekerja, bunyi penanda selesai, dan badge dock saat agen membutuhkan Anda
- **Chat bawaan**: bicaralah dengan model di panel chat, dengan persetujuan tool inline dan review rencana

## Lebih dari Sekadar Aplikasi Desktop

Setiap permukaan berbicara dengan workspace yang sama, jadi Anda bisa memulai tugas di aplikasi dan memeriksanya dari mana saja.

| Permukaan | Yang Anda dapat |
|:--------|:-------------|
| [**Aplikasi Desktop**](https://github.com/superset-sh/superset/releases/latest) | IDE lengkap: terminal, diff viewer, browser dalam aplikasi, otomatisasi |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Satu binary `superset` untuk mengelola workspace, agen, terminal, dan host dari shell mana pun |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Kendalikan Superset secara programatik dengan [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) dari Node, Bun, atau Deno |
| [**MCP Server**](https://docs.superset.sh/mcp) | Biarkan Claude Code, Codex, Cursor, dan agen lainnya membuat dan mengelola workspace sendiri |

CLI sudah dibundel dengan aplikasi desktop, atau pasang secara terpisah:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Aplikasi iOS segera hadir sehingga Anda bisa memantau agen dari ponsel.

## Instalasi

Unduh aplikasi desktop:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (eksperimental; macOS adalah target utama)
- **Windows**: belum tersedia
- [Semua build](https://github.com/superset-sh/superset/releases/latest)

Yang perlu terpasang hanya [Git](https://git-scm.com/). [gh](https://cli.github.com/) bersifat opsional dan membuka alur kerja PR; Superset menawarkan untuk memasangnya bagi Anda.

## Pengembangan

Ingin mengutak-atik Superset atau menyumbang PR? Clone repositorinya, tambahkan ke
aplikasi Superset yang terpasang, lalu buat workspace untuk perubahan Anda:

```bash
git clone https://github.com/superset-sh/superset.git
```

Lalu jalankan setup pengembangan dari terminal workspace tersebut:

```bash
./.superset/setup.local.sh
bun run dev
```

Jalankan `setup.local.sh` sekali di setiap worktree baru. Skrip ini mengonfigurasi identitas
aplikasi dan port yang spesifik per workspace, sehingga aplikasi desktop versi pengembangan
bisa berjalan berdampingan dengan aplikasi Superset yang terpasang dan worktree pengembangan lainnya.

Tidak perlu akun Neon atau kredensial pihak ketiga. `setup.local.sh` menyiapkan
stack Postgres + Electric lokal via Docker dan mengisi akun dev. Masuk
dengan tombol **"Sign in as dev"** (atau `admin@local.test` / `supersetdev`).

Prasyarat: [Bun](https://bun.sh/) v1.3.14+ (dipatok di `.bun-version`), `docker`, `jq`, dan `caddy`, yang dijalankan `bun dev` sebagai proxy HTTPS lokal (`brew install jq caddy && caddy trust`).

Lihat [**DEVELOPMENT.md**](../DEVELOPMENT.md) untuk panduan lengkap: apa yang dilakukan skrip setup, setup manual dengan layanan sungguhan, perintah umum, pemecahan masalah, dan cara mem-build aplikasi desktop. Proses kontribusi ada di [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Konfigurasi

Konfigurasikan skrip setup, teardown, dan run workspace di `.superset/config.json`. Lihat [dokumentasi lengkap](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Pintasan keyboard bisa dikustomisasi lewat **Pengaturan → Pintasan Keyboard** (⌘/); lihat [daftar pintasan lengkap](https://docs.superset.sh/keyboard-shortcuts).

## Tech Stack

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

## Privat Secara Default

- **Sumber tersedia**: kode sumber lengkap ada di GitHub di bawah Elastic License 2.0 (ELv2).
- **Koneksi eksplisit**: Anda yang memilih agen, provider, dan integrasi mana yang dihubungkan.

## Berkontribusi

Kami menyambut kontribusi! Lihat [CONTRIBUTING.md](../CONTRIBUTING.md) untuk cara menyiapkan lingkungan dan membuka PR. Bug dan permintaan fitur masuk ke [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Komunitas

Bergabunglah dengan komunitas Superset untuk mendapat bantuan, berbagi umpan balik, dan terhubung dengan pengguna lain:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: mengobrol dengan tim dan komunitas
- **[Twitter](https://x.com/superset_sh)**: ikuti untuk pembaruan dan pengumuman
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: laporkan bug dan ajukan permintaan fitur
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: ajukan pertanyaan dan bagikan ide

### Tim

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Lisensi & yang gratis selamanya

**Aplikasi desktop gratis selamanya.** Menjalankan agen secara paralel di mesin Anda sendiri tidak akan pernah memerlukan pembayaran. Apa pun yang kami kenakan biaya akan berupa layanan opsional di atasnya.

Seluruh aplikasi ada di repositori ini di bawah [Elastic License 2.0](../LICENSE.md): gunakan, fork, modifikasi, self-host untuk tim Anda. Satu-satunya yang tidak boleh adalah mengemas ulang Superset itu sendiri sebagai layanan yang Anda jual ke orang lain.
