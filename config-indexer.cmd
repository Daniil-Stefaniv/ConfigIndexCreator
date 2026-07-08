@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%ROOT%tools\node\win-x64\node.exe"
set "CLI=%ROOT%bin\config-indexer.mjs"
if not defined CONFIG_INDEXER_MAX_OLD_SPACE_SIZE set "CONFIG_INDEXER_MAX_OLD_SPACE_SIZE=8192"

if not exist "%NODE%" (
  echo Local Node.js was not found: "%NODE%" 1>&2
  exit /b 9009
)

"%NODE%" --max-old-space-size=%CONFIG_INDEXER_MAX_OLD_SPACE_SIZE% "%CLI%" %*
exit /b %ERRORLEVEL%
