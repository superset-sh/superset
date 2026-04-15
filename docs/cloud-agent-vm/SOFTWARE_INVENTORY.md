# Cursor Cloud Agent VM — Full Software Inventory

**Generated:** 2026-04-15
**OS:** Ubuntu 24.04.4 LTS (Noble Numbat)
**Kernel:** Linux 6.12.58+ (x86_64, SMP PREEMPT_DYNAMIC)
**Hardware:** 4 vCPUs, 16 GB RAM, 126 GB disk (overlay filesystem inside Docker-in-Firecracker)

---

## 1. Operating System & Base

| Component | Version | Notes |
|---|---|---|
| Ubuntu | 24.04.4 LTS (Noble Numbat) | Minimal server base |
| Kernel | 6.12.58+ | Custom Firecracker-compatible |
| systemd | 255.4 | Init system |
| glibc (libc6) | 2.39 | C standard library |
| bash | 5.2.21 | Default shell |
| dash | 0.5.12 | `/bin/sh` |
| coreutils | 9.4 | ls, cp, mv, etc. |
| util-linux | 2.39.3 | mount, fdisk, lsblk, etc. |
| sudo | 1.9.15p5 | Privilege escalation |
| login/passwd | 4.13 | User management |
| locales | 2.39 | Locale support |
| tzdata | 2026a | Timezone data |

---

## 2. Desktop Environment (Headless via Xvfb + VNC)

| Component | Version | Notes |
|---|---|---|
| Xvfb | 21.1.12 | Virtual framebuffer X server (DISPLAY=:1) |
| TigerVNC | 1.13.1 | VNC server for remote desktop access |
| XFCE4 | 4.18 | Lightweight desktop environment |
| xfce4-terminal | 1.1.3 | Terminal emulator |
| xfce4-panel | 4.18.4 | Desktop panel |
| xfwm4 | 4.18.0 | Window manager |
| xfdesktop4 | 4.18.1 | Desktop manager |
| Thunar | 4.18.8 | File manager |
| Mousepad | 0.6.1 | Text editor (XFCE) |
| Plank | 0.11.89 | Dock |
| GTK+ 3 | 3.24.41 | GUI toolkit |
| GTK 4 | 4.14.5 | GUI toolkit (newer) |
| GTK+ 2 | 2.24.33 | Legacy GUI toolkit |
| Adwaita icons | 46.0 | Icon theme |
| Humanity icons | 0.6.16 | Ubuntu icon theme |

---

## 3. Web Browser

| Component | Version | Notes |
|---|---|---|
| Google Chrome | 147.0.7727.101 | Stable channel, `/opt/google/chrome/` |

---

## 4. Language Runtimes & Version Managers

### Node.js / JavaScript

| Component | Version | Location | Notes |
|---|---|---|---|
| nvm | latest | `~/.nvm/` | Node version manager |
| Node.js | 22.22.2 (LTS/Jod) | `~/.nvm/versions/node/v22.22.2/` | Active via nvm |
| npm | 10.9.7 | Global with Node | Package manager |
| pnpm | 10.33.0 | Global npm install | Package manager |
| yarn | 1.22.22 | Global npm install | Package manager (v1) |
| corepack | 0.34.6 | Bundled with Node | Package manager shim |
| Bun | 1.3.11 | `~/.bun/bin/bun` | **Installed during setup** for this repo |

### Python

| Component | Version | Location | Notes |
|---|---|---|---|
| Python | 3.12.3 | `/usr/bin/python3` | System Python |
| pip | 24.0 | System | Package installer |
| setuptools | 68.1.2 | System | Build backend |
| wheel | 0.42.0 | System | Wheel builder |
| numpy | 1.26.4 | System pip | Numerical computing |
| ansible | 9.2.0 (core 2.16.3) | System pip | Configuration management |
| redis (py) | 7.4.0 | System pip | Redis client |
| requests | 2.33.1 | System pip | HTTP library |
| PyYAML | 6.0.1 | System pip | YAML parser |
| cryptography | 41.0.7 | System pip | Crypto library |
| yq | 3.1.0 | System pip | YAML query tool |
| websockify | 0.13.0 | System pip | WebSocket proxy (for VNC) |

### Go

| Component | Version | Location | Notes |
|---|---|---|---|
| Go | 1.22.2 | `/usr/lib/go-1.22/` | System apt package |
| gopls | — | `~/go/bin/gopls` | Go language server |
| staticcheck | — | `~/go/bin/staticcheck` | Go linter |

### Rust

| Component | Version | Location | Notes |
|---|---|---|---|
| rustup | (manages toolchain) | `/usr/local/rustup/` | Toolchain manager |
| rustc | 1.83.0 | `/usr/local/cargo/bin/` | Compiler |
| cargo | 1.83.0 | `/usr/local/cargo/bin/` | Build tool / package manager |
| clippy | included | `/usr/local/cargo/bin/` | Linter |
| rustfmt | included | `/usr/local/cargo/bin/` | Formatter |
| rust-analyzer | included | `/usr/local/cargo/bin/` | Language server |

### Java

| Component | Version | Location | Notes |
|---|---|---|---|
| OpenJDK | 21.0.10 | `/usr/lib/jvm/` | Full JDK (not just JRE) |

---

## 5. C/C++ Build Toolchain

| Component | Version | Notes |
|---|---|---|
| gcc | 13.3.0 | GNU C compiler |
| g++ | 13.3.0 | GNU C++ compiler |
| clang | 18.1.3 | LLVM C/C++ compiler |
| LLVM | 18.1.3 + 20.1.2 | Both versions present |
| make | 4.3 | Build automation |
| cmake | 3.28.3 | Cross-platform build system |
| pkg-config | 1.8.1 | Library configuration |
| binutils | 2.42 | Assembler, linker, etc. |
| build-essential | 12.10 | Meta-package for build tools |
| zlib (dev) | 1.3 | Compression library (headers) |
| libffi (dev) | 3.4.6 | Foreign function interface (headers) |
| libssl (dev) | 3.0.13 | OpenSSL headers |
| libgcrypt (dev) | 1.10.3 | Crypto library (headers) |

---

## 6. Cursor Cloud Agent Infrastructure

| Component | Location | Notes |
|---|---|---|
| exec-daemon | `/exec-daemon/` | Process execution daemon for cloud agent |
| cursorsandbox | `/exec-daemon/cursorsandbox` | Sandboxed execution |
| node (exec-daemon) | `/exec-daemon/node` | Dedicated Node.js binary (124 MB) |
| gh (exec-daemon) | `/exec-daemon/gh` | GitHub CLI (dedicated copy) |
| rg (exec-daemon) | `/exec-daemon/rg` | ripgrep (dedicated copy) |
| ssh-keygen (exec-daemon) | `/exec-daemon/ssh-keygen` | SSH key generation |
| tmux (exec-daemon) | `/exec-daemon/tmux` | tmux wrapper script |
| tmux.portal.conf | `/exec-daemon/tmux.portal.conf` | tmux config for agent sessions |
| polished-renderer.node | `/exec-daemon/` | Native addon for rendering |
| pty.node | `/exec-daemon/` | Native addon for pseudo-terminals |
| cloud-agent-tools | `/opt/cursor/cloud-agent-tools/` | Versioned agent tooling bundles |
| artifacts dir | `/opt/cursor/artifacts/` | Output directory for screenshots/videos |
| recording-staging | `/opt/cursor/recording-staging/` | Screen recording staging area |
| logs | `/opt/cursor/logs/` | Agent log files |
| ansible playbook | `/opt/cursor/ansible/vnc-desktop.yml` | Desktop setup automation |

---

## 7. CLI Tools & Utilities

### Text Processing / Search

| Tool | Version | Notes |
|---|---|---|
| ripgrep (rg) | 14.1.0 | Fast regex search |
| grep | 3.11 | Standard grep |
| sed | 4.9 | Stream editor |
| mawk | 1.3.4 | AWK implementation |
| jq | 1.7.1 | JSON processor |
| yq | 3.1.0 | YAML processor (Python-based) |
| diffutils | 3.10 | diff, cmp, etc. |
| patch | 2.7.6 | Apply patches |
| file | 5.45 | File type detection |

### Editors

| Tool | Version | Notes |
|---|---|---|
| Vim | 9.1.0016 | Full vim |
| nano | 7.2 | Simple editor |
| Emacs | 29.3 | GNU Emacs (GTK build) |

### Networking

| Tool | Version | Notes |
|---|---|---|
| curl | 8.5.0 | HTTP client (OpenSSL, brotli, zstd, nghttp2) |
| wget | 1.21.4 | HTTP downloader |
| OpenSSH client | 9.6p1 | SSH client |
| nslookup/dig | 9.18.39 (BIND) | DNS utilities |
| ping | 20240117 (iputils) | ICMP ping |
| net-tools | 2.10 | ifconfig, netstat, etc. |
| oathtool | 2.6.11 | TOTP/HOTP token generator |

### Archiving / Compression

| Tool | Version | Notes |
|---|---|---|
| tar | 1.35 | Tape archive |
| gzip | 1.12 | Gzip compression |
| bzip2 | 1.0.8 | Bzip2 compression |
| xz-utils | 5.4.5 | XZ compression |
| zip | 3.0 | Zip creation |
| unzip | 6.0 | Zip extraction |
| zstd (lib) | 1.5.5 | Zstandard (library only) |

### Version Control

| Tool | Version | Notes |
|---|---|---|
| git | 2.43.0 | Distributed VCS |
| git-lfs | 3.7.1 | Large file storage |
| gh (GitHub CLI) | 2.81.0 (system, 2.45.0 apt) | Two copies: system apt + exec-daemon |

### Terminal Multiplexers

| Tool | Version | Notes |
|---|---|---|
| tmux | 3.4 | Terminal multiplexer |

### Security / Crypto

| Tool | Version | Notes |
|---|---|---|
| OpenSSL | 3.0.13 | TLS/SSL toolkit |
| GnuPG (gpg) | 2.4.4 | Encryption, signing |
| gnome-keyring | 46.1 | Secret storage |
| seahorse | 43.0 | Keyring GUI |
| p11-kit | 0.25.3 | PKCS#11 module manager |

### Process / System Monitoring

| Tool | Version | Notes |
|---|---|---|
| htop | 3.3.0 | Interactive process viewer |
| procps (ps, top) | 4.0.4 | Process utilities |
| lsof | 4.95.0 | List open files |

### Media

| Tool | Version | Notes |
|---|---|---|
| ffmpeg | 6.1.1 | Video/audio encoder/decoder (used for screen recording) |

### Miscellaneous

| Tool | Version | Notes |
|---|---|---|
| sqlite3 | 3.45.1 | SQLite CLI |
| xclip | 0.13 | Clipboard access |
| xdotool | 3.20160805 | X11 automation |
| xdg-utils | 1.1.3 | Desktop integration (xdg-open) |
| findutils | 4.9.0 | find, xargs |
| man-db | 2.12.0 | Manual pages |
| sassc | 3.6.1 | Sass CSS compiler |

### AI/Agent CLIs

| Tool | Version | Location | Notes |
|---|---|---|---|
| claude | 2.1.109 | `~/.local/bin/claude` | Anthropic Claude CLI |

---

## 8. Installed for This Repo (During Setup)

These were installed by the cloud agent specifically for the Superset monorepo:

| Tool | Version | How Installed | Why |
|---|---|---|---|
| Bun | 1.3.11 | `curl -fsSL https://bun.sh/install` | Required package manager (in `package.json`) |
| Caddy | 2.11.2 | apt (Cloudsmith repo) | HTTP/2 reverse proxy for Electric SQL SSE |

---

## 9. Enabled Systemd Services

| Service | State |
|---|---|
| caddy.service | enabled |
| e2scrub_reap.service | enabled |
| getty@.service | enabled |
| systemd-pstore.service | enabled |

---

## 10. APT Repositories

| Source | URL | Notes |
|---|---|---|
| Ubuntu main | `http://archive.ubuntu.com/ubuntu/` | noble, noble-updates, noble-backports |
| Ubuntu security | `http://security.ubuntu.com/ubuntu/` | noble-security |
| Google Chrome | `https://dl.google.com/linux/chrome/deb/` | stable |
| Caddy | `https://dl.cloudsmith.io/public/caddy/stable/` | Added during setup |

---

## 11. NOT Installed (Notable Absences)

| Tool | Status | Impact |
|---|---|---|
| Docker / Podman | **Not installed** | Cannot run Electric SQL container |
| neonctl | **Not installed** | Cannot manage Neon DB branches |
| screen | Not installed | tmux is available instead |
| less | Not installed | Use `more` or `vim` |
| tree | Not installed | Use `find` or `ls -R` |
| fd | Not installed | Use `find` |
| bat | Not installed | Use `cat` |
| fzf | Not installed | No fuzzy finder |
| ip / ss | Not installed | Use `ifconfig` / `netstat` from net-tools |
| rsync | Not installed | Use `cp` / `scp` |
| snap / flatpak | Not installed | Use apt |
| pyenv / rbenv | Not installed | System Python / no Ruby |

---

## 12. Full Debian Package List (778 packages)

<details>
<summary>Click to expand all 778 dpkg packages</summary>

```
adduser                     3.137ubuntu1
adwaita-icon-theme          46.0-1
ansible                     9.2.0+dfsg-0ubuntu5
ansible-core                2.16.3-0ubuntu2
apt                         2.8.3
apt-transport-https         2.8.3
at-spi2-common              2.52.0-1build1
at-spi2-core                2.52.0-1build1
bamfdaemon                  0.5.6+22.04.20220217-0ubuntu5
base-files                  13ubuntu10.4
base-passwd                 3.6.3build1
bash                        5.2.21-2ubuntu4
bind9-dnsutils              1:9.18.39-0ubuntu0.24.04.3
bind9-host                  1:9.18.39-0ubuntu0.24.04.3
bind9-libs                  1:9.18.39-0ubuntu0.24.04.3
binutils                    2.42-4ubuntu2.10
binutils-common             2.42-4ubuntu2.10
binutils-x86-64-linux-gnu   2.42-4ubuntu2.10
bsdextrautils               2.39.3-9ubuntu6.5
bsdutils                    1:2.39.3-9ubuntu6.5
build-essential             12.10ubuntu1
bzip2                       1.0.8-5.1build0.1
ca-certificates             20240203
ca-certificates-java        20240118
caddy                       2.11.2
clang                       1:18.0-59~exp2
clang-18                    1:18.1.3-1ubuntu1
cmake                       3.28.3-1build7
cmake-data                  3.28.3-1build7
coreutils                   9.4-3ubuntu6.2
cpp                         4:13.2.0-7ubuntu1
cpp-13                      13.3.0-6ubuntu2~24.04.1
cpp-13-x86-64-linux-gnu     13.3.0-6ubuntu2~24.04.1
cpp-x86-64-linux-gnu        4:13.2.0-7ubuntu1
curl                        8.5.0-2ubuntu10.8
dash                        0.5.12-6ubuntu5
dbus                        1.14.10-4ubuntu4.1
dbus-bin                    1.14.10-4ubuntu4.1
dbus-daemon                 1.14.10-4ubuntu4.1
dbus-session-bus-common     1.14.10-4ubuntu4.1
dbus-system-bus-common      1.14.10-4ubuntu4.1
dbus-user-session           1.14.10-4ubuntu4.1
dbus-x11                    1.14.10-4ubuntu4.1
dconf-cli                   0.40.0-4ubuntu0.1
dconf-gsettings-backend     0.40.0-4ubuntu0.1
dconf-service               0.40.0-4ubuntu0.1
debconf                     1.5.86ubuntu1
debian-archive-keyring       2023.4ubuntu1
debian-keyring              2023.12.24
debianutils                 5.17build1
default-jdk                 2:1.21-75+exp1
default-jdk-headless        2:1.21-75+exp1
default-jre                 2:1.21-75+exp1
default-jre-headless        2:1.21-75+exp1
desktop-file-utils          0.27-2build1
dictionaries-common         1.29.7
diffutils                   1:3.10-1build1
dirmngr                     2.4.4-2ubuntu17.4
distro-info-data            0.60ubuntu0.5
dnsutils                    1:9.18.39-0ubuntu0.24.04.3
dpkg                        1.22.6ubuntu6.5
dpkg-dev                    1.22.6ubuntu6.5
e2fsprogs                   1.47.0-2.4~exp1ubuntu4.1
emacs                       1:29.3+1-1ubuntu2
emacs-bin-common            1:29.3+1-1ubuntu2
emacs-common                1:29.3+1-1ubuntu2
emacs-el                    1:29.3+1-1ubuntu2
emacs-gtk                   1:29.3+1-1ubuntu2
emacsen-common              3.0.5
exo-utils                   4.18.0-1build4
ffmpeg                      7:6.1.1-3ubuntu5
file                        1:5.45-3build1
findutils                   4.9.0-5build1
fontconfig                  2.15.0-1.1ubuntu2
fontconfig-config           2.15.0-1.1ubuntu2
fonts-cantarell             0.303.1-1
fonts-croscore              20201225-2
fonts-dejavu-core           2.37-8
fonts-dejavu-mono           2.37-8
fonts-droid-fallback        1:6.0.1r16-1.1build1
fonts-jetbrains-mono        2.304+ds-4
fonts-liberation            1:2.1.5-3
fonts-noto                  20201225-2
fonts-noto-color-emoji      2.047-0ubuntu0.24.04.1
fonts-noto-core             20201225-2
fonts-noto-mono             20201225-2
fonts-wqy-microhei          0.2.0-beta-3.1
g++                         4:13.2.0-7ubuntu1
g++-13                      13.3.0-6ubuntu2~24.04.1
g++-13-x86-64-linux-gnu     13.3.0-6ubuntu2~24.04.1
g++-x86-64-linux-gnu        4:13.2.0-7ubuntu1
gcc                         4:13.2.0-7ubuntu1
gcc-13                      13.3.0-6ubuntu2~24.04.1
gcc-13-base                 13.3.0-6ubuntu2~24.04.1
gcc-13-x86-64-linux-gnu     13.3.0-6ubuntu2~24.04.1
gcc-14-base                 14.2.0-4ubuntu2~24.04.1
gcc-x86-64-linux-gnu        4:13.2.0-7ubuntu1
gcr                         3.41.2-1build3
gcr4                        4.2.0-5
gh                          2.45.0-1ubuntu0.3
git                         1:2.43.0-1ubuntu7.3
git-lfs                     3.7.1
git-man                     1:2.43.0-1ubuntu7.3
glib-networking             2.80.0-1build1
glib-networking-common      2.80.0-1build1
glib-networking-services    2.80.0-1build1
gnome-keyring               46.1-2ubuntu0.2
gnome-themes-extra          3.28-2ubuntu5
gnome-themes-extra-data     3.28-2ubuntu5
gnupg                       2.4.4-2ubuntu17.4
gnupg-utils                 2.4.4-2ubuntu17.4
golang-1.22-go              1.22.2-2ubuntu0.4
golang-1.22-src             1.22.2-2ubuntu0.4
golang-go                   2:1.22~2build1
golang-src                  2:1.22~2build1
google-chrome-stable        147.0.7727.101-1
gpg                         2.4.4-2ubuntu17.4
gpg-agent                   2.4.4-2ubuntu17.4
gpgconf                     2.4.4-2ubuntu17.4
gpgsm                       2.4.4-2ubuntu17.4
gpgv                        2.4.4-2ubuntu17.4
grep                        3.11-4build1
groff-base                  1.23.0-3build2
gsettings-desktop-schemas   46.1-0ubuntu1
gtk2-engines-pixbuf         2.24.33-4ubuntu1.1
gtk-update-icon-cache       3.24.41-4ubuntu1.3
gzip                        1.12-1ubuntu3.1
hicolor-icon-theme          0.17-2
hostname                    3.23+nmu2ubuntu2
htop                        3.3.0-4build1
humanity-icon-theme         0.6.16
hunspell-en-us              1:2020.12.07-2
ieee-data                   20220827.1
init-system-helpers         1.66ubuntu1
install-info                7.1-3build2
iputils-ping                3:20240117-1ubuntu0.1
iso-codes                   4.16.0-1
java-common                 0.75+exp1
jq                          1.7.1-3ubuntu0.24.04.1
keyboxd                     2.4.4-2ubuntu17.4
locales                     2.39-0ubuntu8.7
login                       1:4.13+dfsg1-4ubuntu3.2
logsave                     1.47.0-2.4~exp1ubuntu4.1
lsb-release                 12.0-2
lsof                        4.95.0-1build3
lto-disabled-list           47
m17n-db                     1.8.5-1
make                        4.3-4.1build2
man-db                      2.12.0-4build2
mawk                        1.3.4.20240123-1build1
media-types                 10.1.0
mount                       2.39.3-9ubuntu6.5
mousepad                    0.6.1-1build2
nano                        7.2-2ubuntu0.1
ncurses-base                6.4+20240113-1ubuntu2
ncurses-bin                 6.4+20240113-1ubuntu2
netbase                     6.4
net-tools                   2.10-0.1ubuntu4.4
oathtool                    2.6.11-2.1ubuntu0.1
openjdk-21-jdk              21.0.10+7-1~24.04
openjdk-21-jdk-headless     21.0.10+7-1~24.04
openjdk-21-jre              21.0.10+7-1~24.04
openjdk-21-jre-headless     21.0.10+7-1~24.04
openssh-client              1:9.6p1-3ubuntu13.15
openssl                     3.0.13-0ubuntu3.7
p11-kit                     0.25.3-4ubuntu2.1
p11-kit-modules             0.25.3-4ubuntu2.1
packagekit                  1.2.8-2ubuntu1.4
passwd                      1:4.13+dfsg1-4ubuntu3.2
patch                       2.7.6-7build3
perl                        5.38.2-3.2ubuntu0.2
perl-base                   5.38.2-3.2ubuntu0.2
perl-modules-5.38           5.38.2-3.2ubuntu0.2
pinentry-curses             1.2.1-3ubuntu5
pinentry-gnome3             1.2.1-3ubuntu5
pkgconf                     1.8.1-2build1
pkgconf-bin                 1.8.1-2build1
pkg-config                  1.8.1-2build1
plank                       0.11.89-4ubuntu5
polkitd                     124-2ubuntu1.24.04.2
procps                      2:4.0.4-4ubuntu3.2
python3                     3.12.3-0ubuntu2.1
python3.12                  3.12.3-1ubuntu0.12
python3.12-minimal          3.12.3-1ubuntu0.12
python3-apt                 2.7.7ubuntu5.2
python3-argcomplete         3.1.4-1ubuntu0.1
python3-blinker             1.7.0-1
python3-cffi-backend        1.16.0-2build1
python3-cryptography        41.0.7-4ubuntu0.4
python3-dbus                1.3.2-5build3
python3-distro              1.9.0-1
python3-dnspython           2.6.1-1ubuntu1
python3-gi                  3.48.2-1
python3-httplib2            0.20.4-3
python3-jinja2              3.1.2-1ubuntu1.3
python3-jwt                 2.7.0-1ubuntu0.1
python3-launchpadlib        1.11.0-6
python3-lazr.restfulclient  0.14.6-1
python3-lazr.uri            1.0.6-3
python3-markupsafe          2.1.5-1build2
python3-minimal             3.12.3-0ubuntu2.1
python3-netaddr             0.8.0-2ubuntu1
python3-numpy               1:1.26.4+ds-6ubuntu1
python3-oauthlib            3.2.2-1
python3-packaging           24.0-1
python3-pip                 24.0+dfsg-1ubuntu1.3
python3-pkg-resources       68.1.2-2ubuntu1.2
python3-pyparsing           3.1.1-1
python3-resolvelib          1.0.1-1
python3-setuptools          68.1.2-2ubuntu1.2
python3-six                 1.16.0-4
python3-software-properties 0.99.49.4
python3-toml                0.10.2-1
python3-urllib3              2.0.7-1ubuntu0.6
python3-wadllib             1.3.6-5
python3-wheel               0.42.0-2
python3-xmltodict           0.13.0-1ubuntu0.24.04.1
python3-yaml                6.0.1-2build2
python-apt-common           2.7.7ubuntu5.2
readline-common             8.2-4build1
ripgrep                     14.1.0-1
rpcsvc-proto                1.4.2-0ubuntu7
sassc                       3.6.1+20201027-2
seahorse                    43.0-3build2
sed                         4.9-2build1
sensible-utils              0.0.22
session-migration           0.3.9build1
sgml-base                   1.31
shared-mime-info            2.4-4
software-properties-common  0.99.49.4
sqlite3                     3.45.1-1ubuntu2.5
sudo                        1.9.15p5-3ubuntu5.24.04.2
systemd                     255.4-1ubuntu8.14
systemd-dev                 255.4-1ubuntu8.14
systemd-sysv                255.4-1ubuntu8.14
sysvinit-utils              3.08-6ubuntu3
tar                         1.35+dfsg-3build1
thunar                      4.18.8-1build3
thunar-data                 4.18.8-1build3
tigervnc-common             1.13.1+dfsg-2build2
tigervnc-standalone-server  1.13.1+dfsg-2build2
tigervnc-tools              1.13.1+dfsg-2build2
tmux                        3.4-1ubuntu0.1
tzdata                      2026a-0ubuntu0.24.04.1
ubuntu-keyring              2023.11.28.1
ubuntu-mono                 24.04-0ubuntu1
unminimize                  0.2.1
unzip                       6.0-28ubuntu4.1
util-linux                  2.39.3-9ubuntu6.5
uuid-dev                    2.39.3-9ubuntu6.5
vim                         2:9.1.0016-1ubuntu7.10
vim-common                  2:9.1.0016-1ubuntu7.10
vim-runtime                 2:9.1.0016-1ubuntu7.10
wget                        1.21.4-1ubuntu4.1
x11-common                  1:7.7+23ubuntu3
x11proto-dev                2023.2-1
x11-utils                   7.7+6build2
x11-xkb-utils               7.7+8build2
x11-xserver-utils           7.7+10build2
xauth                       1:1.1.2-1build1
xclip                       0.13-3
xdg-utils                   1.1.3-4.1ubuntu3
xdotool                     1:3.20160805.1-5build1
xfce4                       4.18
xfce4-appfinder             4.18.0-1build2
xfce4-helpers               4.18.4-0ubuntu3
xfce4-panel                 4.18.4-1ubuntu0.1
xfce4-pulseaudio-plugin     0.4.8-1build2
xfce4-session               4.18.3-1build2
xfce4-settings              4.18.4-0ubuntu3
xfce4-terminal              1.1.3-1build1
xfconf                      4.18.1-1build3
xfdesktop4                  4.18.1-1build3
xfdesktop4-data             4.18.1-1build3
xfonts-base                 1:1.0.5+nmu1
xfonts-encodings            1:1.0.5-0ubuntu2
xfonts-terminus             4.48-3.1
xfonts-utils                1:7.7+6build3
xfwm4                       4.18.0-1build3
xkb-data                    2.41-2ubuntu1.1
xml-core                    0.19
xorg-sgml-doctools          1:1.11-1.1
xserver-common              2:21.1.12-1ubuntu1.5
xtrans-dev                  1.4.0-1
xvfb                        2:21.1.12-1ubuntu1.5
xz-utils                    5.6.1+really5.4.5-1ubuntu0.2
yq                          3.1.0-3
zip                         3.0-13ubuntu0.2
zlib1g                      1:1.3.dfsg-3.1ubuntu2.1
zlib1g-dev                  1:1.3.dfsg-3.1ubuntu2.1
```

*Plus ~540 shared library packages (lib*) omitted from this summary but included above.*

</details>

---

## 13. Shell Environment (`.bashrc`)

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
export PS1="\[\033[36m\]\W\[\033[0m\] $ "
export PATH=/usr/local/cargo/bin:$PATH
export PATH="$HOME/.local/bin:$PATH"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

---

## 14. PATH Resolution Order

```
/home/ubuntu/.bun/bin
/home/ubuntu/.local/bin
/usr/local/cargo/bin
/home/ubuntu/.nvm/versions/node/v22.22.2/bin
/usr/local/sbin
/usr/local/bin
/usr/sbin
/usr/bin
/sbin
/bin
```
