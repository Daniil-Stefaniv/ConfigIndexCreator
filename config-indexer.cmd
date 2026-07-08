@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%ROOT%tools\node\win-x64\node.exe"
set "CLI=%ROOT%bin\config-indexer.mjs"

if not exist "%NODE%" (
  echo Local Node.js was not found: "%NODE%" 1>&2
  exit /b 9009
)

"%NODE%" "%CLI%" %*
exit /b %ERRORLEVEL%
