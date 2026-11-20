@echo off
if exist "%~dp0setup.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\setup.ps1"
)