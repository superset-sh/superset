!ifndef BUILD_UNINSTALLER
  !include LogicLib.nsh
  !include nsDialogs.nsh

  Var SupersetCleanDataCheckbox
  Var SupersetCleanClaudeCheckbox
  Var SupersetCleanDataState
  Var SupersetCleanClaudeState

  !macro customPageAfterChangeDir
    Page custom SupersetCleanOptionsPage SupersetCleanOptionsLeave
  !macroend

  Function SupersetCleanOptionsPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 28u "This installer replaces the previous Superset version automatically. Choose whether to reset local state before the newly installed app starts."
    Pop $0

    ${NSD_CreateCheckbox} 0 40u 100% 14u "Reset Superset local app data and authentication"
    Pop $SupersetCleanDataCheckbox
    ${NSD_SetState} $SupersetCleanDataCheckbox ${BST_UNCHECKED}

    ${NSD_CreateCheckbox} 0 64u 100% 14u "Also reset Claude Code and mastracode login data"
    Pop $SupersetCleanClaudeCheckbox
    ${NSD_SetState} $SupersetCleanClaudeCheckbox ${BST_UNCHECKED}

    ${NSD_CreateLabel} 0 92u 100% 44u "Superset reset keeps ~/.superset/worktrees, but removes local auth, caches, databases, generated runtime files, and Electron app data. Claude reset moves known login files aside with a .superset-reset.bak suffix."
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function SupersetCleanOptionsLeave
    ${NSD_GetState} $SupersetCleanDataCheckbox $SupersetCleanDataState
    ${NSD_GetState} $SupersetCleanClaudeCheckbox $SupersetCleanClaudeState
  FunctionEnd

  !macro customInstall
    ${If} $SupersetCleanDataState == ${BST_CHECKED}
      DetailPrint "Resetting Superset local app data..."
      Call SupersetResetLocalData
    ${EndIf}

    ${If} $SupersetCleanClaudeState == ${BST_CHECKED}
      DetailPrint "Resetting Claude Code and mastracode login data..."
      Call SupersetResetClaudeAuthData
    ${EndIf}
  !macroend

  Function SupersetDeleteSupersetFile
    Exch $0
    Delete "$PROFILE\.superset\$0"
    Pop $0
  FunctionEnd

  Function SupersetRemoveSupersetDir
    Exch $0
    RMDir /r "$PROFILE\.superset\$0"
    Pop $0
  FunctionEnd

  Function SupersetBackupFile
    Exch $0
    Delete "$0.superset-reset.bak"
    Rename "$0" "$0.superset-reset.bak"
    Pop $0
  FunctionEnd

  Function SupersetResetLocalData
    Push "auth-token.enc"
    Call SupersetDeleteSupersetFile
    Push "chat-anthropic-env.json"
    Call SupersetDeleteSupersetFile
    Push "config.json"
    Call SupersetDeleteSupersetFile
    Push "app-state.json"
    Call SupersetDeleteSupersetFile
    Push "window-state.json"
    Call SupersetDeleteSupersetFile
    Push "local.db"
    Call SupersetDeleteSupersetFile
    Push "local.db-shm"
    Call SupersetDeleteSupersetFile
    Push "local.db-wal"
    Call SupersetDeleteSupersetFile
    Push "tanstack-db.sqlite"
    Call SupersetDeleteSupersetFile
    Push "tanstack-db.sqlite-shm"
    Call SupersetDeleteSupersetFile
    Push "tanstack-db.sqlite-wal"
    Call SupersetDeleteSupersetFile
    Push "daemon.log"
    Call SupersetDeleteSupersetFile
    Push "port-allocations.json"
    Call SupersetDeleteSupersetFile
    Push "terminal-host.pid"
    Call SupersetDeleteSupersetFile
    Push "terminal-host.token"
    Call SupersetDeleteSupersetFile

    Push "host"
    Call SupersetRemoveSupersetDir
    Push "bin"
    Call SupersetRemoveSupersetDir
    Push "hooks"
    Call SupersetRemoveSupersetDir
    Push "bash"
    Call SupersetRemoveSupersetDir
    Push "zsh"
    Call SupersetRemoveSupersetDir
    Push "assets"
    Call SupersetRemoveSupersetDir
    Push "project-icons"
    Call SupersetRemoveSupersetDir
    Push "projects"
    Call SupersetRemoveSupersetDir
    Push "terminal-history"
    Call SupersetRemoveSupersetDir

    RMDir /r "$APPDATA\Superset"
    RMDir /r "$APPDATA\superset"
    RMDir /r "$LOCALAPPDATA\Superset"
    RMDir /r "$LOCALAPPDATA\superset"
    RMDir /r "$LOCALAPPDATA\com.superset.desktop"
  FunctionEnd

  Function SupersetResetClaudeAuthData
    Push "$PROFILE\.claude\.credentials.json"
    Call SupersetBackupFile
    Push "$PROFILE\.claude\credentials.json"
    Call SupersetBackupFile
    Push "$PROFILE\.claude\api-keys.json"
    Call SupersetBackupFile
    Push "$PROFILE\.claude\session-tokens.json"
    Call SupersetBackupFile
    Push "$PROFILE\.claude\mcp-needs-auth-cache.json"
    Call SupersetBackupFile
    Push "$PROFILE\.claude.json"
    Call SupersetBackupFile

    Push "$PROFILE\.config\claude\credentials.json"
    Call SupersetBackupFile
    Push "$PROFILE\.config\claude\config.json"
    Call SupersetBackupFile

    Push "$PROFILE\.mastracode\auth.json"
    Call SupersetBackupFile
    Push "$PROFILE\.mastracode\credentials.json"
    Call SupersetBackupFile
    Push "$PROFILE\.mastracode\token.json"
    Call SupersetBackupFile
    Push "$PROFILE\.mastracode\tokens.json"
    Call SupersetBackupFile
  FunctionEnd
!endif
