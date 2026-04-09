import Foundation

enum ShellEnvironment {

    /// Bootstrap keys inherited from the app's process environment.
    /// Matches SHELL_BOOTSTRAP_KEYS in clean-shell-env.ts.
    private static let bootstrapKeys: Set<String> = [
        "HOME", "USER", "LOGNAME", "SHELL", "PATH", "TMPDIR",
        "LANG", "LC_ALL", "LC_CTYPE",
        "__CF_USER_TEXT_ENCODING", "Apple_PubSub_Socket_Render",
        // SSH (critical for git operations)
        "SSH_AUTH_SOCK", "SSH_AGENT_PID",
        // Proxy
        "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
        "NO_PROXY", "no_proxy",
        // Language managers
        "NVM_DIR", "PYENV_ROOT", "GOPATH", "GOROOT", "CARGO_HOME",
        "RUSTUP_HOME", "BUN_INSTALL", "VOLTA_HOME",
        // Homebrew
        "HOMEBREW_PREFIX", "HOMEBREW_CELLAR", "HOMEBREW_REPOSITORY",
        // XDG
        "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
        // Editor
        "EDITOR", "VISUAL",
        // TLS
        "SSL_CERT_FILE", "SSL_CERT_DIR",
        // Git config (not credentials)
        "GIT_SSH_COMMAND",
    ]

    private static let commonMacOSPaths = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ]

    static func resolveLoginShell() -> String {
        ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
    }

    static func shellLaunchArgs(shell: String) -> [String] {
        if shell.hasSuffix("/zsh") || shell.hasSuffix("/bash") {
            return ["--login", "-i"]
        }
        return ["-i"]
    }

    static func buildTerminalEnv(cwd: String) -> [String: String] {
        let processEnv = ProcessInfo.processInfo.environment
        var env: [String: String] = [:]

        // Copy bootstrap keys
        for key in bootstrapKeys {
            if let val = processEnv[key] { env[key] = val }
        }

        // Augment PATH with Homebrew locations
        let currentPath = env["PATH"] ?? ""
        let existing = Set(currentPath.split(separator: ":").map(String.init))
        let missing = commonMacOSPaths.filter { !existing.contains($0) }
        if !missing.isEmpty {
            env["PATH"] = (missing + [currentPath]).filter { !$0.isEmpty }.joined(separator: ":")
        }

        // Terminal identity
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        env["TERM_PROGRAM"] = "Superset"
        env["TERM_PROGRAM_VERSION"] = "1.0.0"

        // CWD
        env["PWD"] = cwd

        // Prevent tmux auto-start
        env["DISABLE_AUTO_UPDATE"] = "true"
        env["ZSH_TMUX_AUTOSTARTED"] = "true"
        env["ZSH_TMUX_AUTOSTART"] = "false"

        // Light/dark hint for TUI apps
        env["COLORFGBG"] = "15;0" // dark theme default

        return env
    }
}
