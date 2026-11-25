param([Parameter(Mandatory=$true)][string]$Family,[Parameter(Mandatory=$true)][string]$HostPath,[Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference='Stop'
# Resolve the installed registration every time; never cache a versioned WindowsApps path.
$package=Get-AppxPackage | Where-Object PackageFamilyName -eq $Family | Sort-Object Version -Descending | Select-Object -First 1
if(-not $package){throw 'Official application package is not registered'}
$request=Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
if($request.expectedVersion -and $request.expectedVersion -ne $package.Version.ToString()){throw 'Official package changed during startup'}
$manifest=Get-AppxPackageManifest -Package $package.PackageFullName
$application=@($manifest.Package.Applications.Application) | Where-Object { $_.Executable -match 'ChatGPT\.exe$' } | Select-Object -First 1
if(-not $application){throw 'Official desktop application registration changed'}
Invoke-CommandInDesktopPackage -PackageFamilyName $Family -AppId $application.Id -Command $HostPath -Args ('"'+$RequestPath+'"')
