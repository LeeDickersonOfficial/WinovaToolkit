!macro customInstall
  DetailPrint "Installing Winova network service..."
  nsExec::ExecToLog 'sc.exe stop WinovaToolkitNetworkService'
  nsExec::ExecToLog 'sc.exe delete WinovaToolkitNetworkService'
  nsExec::ExecToLog 'sc.exe create WinovaToolkitNetworkService binPath= "$INSTDIR\resources\service\Winova.NetworkService.exe" start= auto DisplayName= "Winova Toolkit Network Service"'
  nsExec::ExecToLog 'sc.exe description WinovaToolkitNetworkService "Securely manages Windows network adapters for Winova Toolkit."'
  nsExec::ExecToLog 'sc.exe failure WinovaToolkitNetworkService reset= 86400 actions= restart/3000/restart/10000/""/0'
  nsExec::ExecToLog 'sc.exe start WinovaToolkitNetworkService'
!macroend

!macro customUnInstall
  DetailPrint "Removing Winova network service..."
  nsExec::ExecToLog 'sc.exe stop WinovaToolkitNetworkService'
  nsExec::ExecToLog 'sc.exe delete WinovaToolkitNetworkService'
!macroend
