Unicode true
!include "MUI2.nsh"
Name "Bible"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Bible"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
VIProductVersion "${NUMVERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Bible"
VIAddVersionKey /LANG=1033 "FileDescription" "Bible desktop installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${NUMVERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Bible contributors"
Function .onInit
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 runtime_ready
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 runtime_ready
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 runtime_ready
  MessageBox MB_YESNO|MB_ICONINFORMATION "Microsoft Edge WebView2 Runtime is required. Open the Microsoft download page? Install the runtime, then run this installer again." IDNO no_runtime
  ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"
  no_runtime:
  Abort
  runtime_ready:
  SetRegView 64
FunctionEnd
Section "Bible" MainSection
  SetOutPath "$INSTDIR"
  File "${BINARY}"
  File "..\..\THIRD_PARTY_NOTICES.txt"
  File /r "..\..\licenses"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Bible"
  CreateShortcut "$SMPROGRAMS\Bible\Bible.lnk" "$INSTDIR\Bible.exe"
  CreateShortcut "$SMPROGRAMS\Bible\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Bible.lnk" "$INSTDIR\Bible.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Bible" "DisplayName" "Bible"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Bible" "DisplayVersion" "${NUMVERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Bible" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd
Section "Uninstall"
  Delete "$INSTDIR\Bible.exe"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\licenses"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Bible\Bible.lnk"
  Delete "$SMPROGRAMS\Bible\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Bible"
  Delete "$DESKTOP\Bible.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Bible"
  ; User annotations in the platform application-data directory are retained.
SectionEnd
