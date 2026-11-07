$ErrorActionPreference='Stop'
$themeFramework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$themeOutput=Join-Path $PSScriptRoot 'bundle'
New-Item -ItemType Directory -Path $themeOutput -Force | Out-Null
$themeReferences=@('System.dll','System.Core.dll','System.Web.Extensions.dll','WPF\WindowsBase.dll','WPF\PresentationCore.dll','WPF\PresentationFramework.dll','System.Xaml.dll') | ForEach-Object { '/reference:'+(Join-Path $themeFramework $_) }
& (Join-Path $themeFramework 'csc.exe') /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+(Join-Path $themeOutput 'ProgressWindow.exe')) $themeReferences (Join-Path $PSScriptRoot 'ProgressWindow.cs')
if($LASTEXITCODE -ne 0){throw 'Progress window build failed'}
