# Changelog

## v0.1.23

- Expanded Quick Actions with Windows Update, Device Manager, Disk Management, Services, Event Viewer, and System Information.
- Added every new Windows shortcut to the Ctrl+K command palette.
- Added the purple Winova “W” as the executable, installer, shortcut, taskbar, and window icon.
- Fixed Windows edition, feature release, and build information when Windows blocks CIM/WMI access.
- Made device information resilient so one unavailable hardware source no longer blanks the entire Overview.
- Added a protected installed-service fallback for reading the device serial number.
- Updated every time-based greeting to use consistent capitalization, punctuation, and a waving-hand emoji.
- Fixed escaped Windows registry paths so the feature version and complete OS build render correctly.
- Fixed disabling virtual adapters such as Tailscale when Windows removes them from the adapter list immediately.
- Switched privileged adapter toggles to Windows' native NetAdapter cmdlets so virtual adapters do not report false `netsh` success.

## v0.1.22

- Added a clear MAC Address label to every network adapter.
- Changed both the full-check DNS target and the manual lookup preview to `google.com`; the manual input is no longer pre-filled.
- Added Windows release information such as `25H2`, the complete OS build and revision, device serial number, and last boot time.
- Added a one-click system summary for copying useful device and Windows details.
- Fixed the Software Update panel so “up to date” always reports the version currently installed and running.
- Improved Programs and Features metadata with a clearer product description, publisher information, project links, and display name.

## v0.1.21

- Added a dedicated, narrowly scoped Windows service for network-adapter changes.
- Removed repeated elevation prompts for adapter controls in installed copies.
- Restricted service requests to the installed Winova Toolkit executable and validated every adapter name before making changes.
- Kept per-action Windows elevation as a safe fallback for portable copies and unavailable services.
- Added a network command center with gateway, DNS, and internet health checks.
- Added safe DNS-cache flush, DHCP renewal, and adapter restart actions.
- Added post-action adapter-state verification before reporting success.
- Added service health and version information to Network and Preferences.
- Added copy controls for adapter IP addresses and gateways.
- Added loading skeletons, clearer adapter states, and richer success, progress, and error notifications.

## v0.1.20

- Added automatic update checks shortly after launch and every 60 seconds.
- Added a prominent in-app banner when an update is available or ready to install.
- Fixed raw HTML tags and literal `\n` sequences appearing in update release notes.
- Added safe HTML-to-text normalization with improved spacing and bullet formatting.
- Added animated Overview cards and drive-capacity meters on launch and refresh.
- Fixed drive-capacity bars and added green, amber, and red remaining-space states.
- Added live seconds to system uptime and the Overview updated time.
- Updated the greeting to use the user's local time with clearer punctuation.
- Added network-adapter enable and disable controls with a branded confirmation dialog.
- Added IPv4 address, default gateway, connection status, and MAC address details for each adapter.

## v0.1.19

- Added green, amber, and red drive-capacity indicators based on remaining space.

## v0.1.18

- Standardized Winova on its dark-only interface.
- Added live uptime seconds and release-note support.
- Added file checksums, unit conversion, and stopwatch/timer utilities.
