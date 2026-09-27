# Changelog

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
