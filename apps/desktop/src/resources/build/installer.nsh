!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
  Var isNoDesktopShortcut
  Var DesktopShortcutCheckbox

  !macro isNoDesktopShortcut _t _f
    StrCmp $isNoDesktopShortcut "1" ${_t} ${_f}
  !macroend

  !macro customInstall
    StrCpy $0 "$INSTDIR\\resources\\build\\icons\\icon.ico"
    ${If} ${FileExists} "$0"
      ${If} ${FileExists} "$newDesktopLink"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      ${EndIf}
      ${If} ${FileExists} "$newStartMenuLink"
        CreateShortCut "$newStartMenuLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
      ${EndIf}
    ${EndIf}
  !macroend

  !macro customPageAfterChangeDir
    Page Custom DesktopShortcutPageCreate DesktopShortcutPageLeave
  !macroend

  Function DesktopShortcutPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${If} $isNoDesktopShortcut == ""
      StrCpy $isNoDesktopShortcut "0"
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 12u "Additional Options"
    Pop $0

    ${NSD_CreateCheckbox} 0 20u 100% 12u "Create Desktop Shortcut"
    Pop $DesktopShortcutCheckbox
    ${If} $isNoDesktopShortcut == "1"
      ${NSD_Uncheck} $DesktopShortcutCheckbox
    ${Else}
      ${NSD_Check} $DesktopShortcutCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function DesktopShortcutPageLeave
    ${NSD_GetState} $DesktopShortcutCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $isNoDesktopShortcut "0"
    ${Else}
      StrCpy $isNoDesktopShortcut "1"
    ${EndIf}
  FunctionEnd
!endif
