; Atalho da segunda instância (D-29): o mesmo programa com outro perfil, ou seja, outro banco local e outra
; configuração. É a "Ambulância 02" do roteiro do conflito (docs/11, seção 11.4).
!macro customInstall
  CreateShortCut "$DESKTOP\MedicalField (Ambulância 02).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--perfil=ambulancia-02" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\MedicalField (Ambulância 02).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--perfil=ambulancia-02" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\MedicalField (Ambulância 02).lnk"
  Delete "$SMPROGRAMS\MedicalField (Ambulância 02).lnk"
!macroend
