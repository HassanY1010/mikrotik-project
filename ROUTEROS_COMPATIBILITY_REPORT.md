# RouterOS 6 & RouterOS 7 Compatibility Report

> **Verification Scope Disclosure:** No physical RouterOS 6/7 hardware, RouterBOARD devices, or live MikroTik CHR instances were reachable or executed in this environment (Windows workstation without Docker daemon or lab routers). Compatibility findings below are established from source inspection of clients/adapters and automated Jest + Dart loopback socket mocks. **Live CHR / hardware smoke testing remains required before customer rollout.**

---

## 1. Capability Detection (`RouterCapabilityService`)

`apps/api/src/modules/mikrotik-provisioning/services/router-capability.service.ts` uses live feature inspection rather than hardcoded router model assumptions:

| Capability Dimension | Detection Rule | Resulting Branch / Stack |
| :--- | :--- | :--- |
| **OS Family & Version** | Parses numeric `major.minor` from `/system/resource` (e.g. `7.16.2`, `6.49.13`), fallback `/^v?7/` or `/^v?6/`, else `UNKNOWN`. | `ROS7`, `ROS6`, `UNKNOWN` |
| **Wireless Stack (ROS 7)** | Package + interface inspection (`wifi-qcom`, `wifi-qcom-ac`, `wifi`, `wifiwave2`, `wireless`, and interface types `wifi` / `wlan`). If `minorVersion < 13` with `wifiwave2` pkg -> `WIFIWAVE2`; `7.13+` / `wifi-qcom` -> `WIFI_QCOM`; `wireless` pkg / `wlan` iface -> `LEGACY_WIRELESS`. | `WIFI_QCOM`, `WIFIWAVE2`, `LEGACY_WIRELESS`, or `NONE` (if 0 interfaces) |
| **Wireless Stack (ROS 6)** | Inspects `wireless` package and `wlan` interfaces. | `LEGACY_WIRELESS` or `NONE` |
| **NTP Stack** | `ROS7` -> `NTP_V7` (uses `/system/ntp/client/servers` table); `ROS6` with `ntp` package -> `NTP_PKG_V6`, else built-in `SNTP_V6`. | `NTP_V7`, `NTP_PKG_V6`, `SNTP_V6`, `NONE` |
| **Hotspot Package** | Checks active `hotspot` package or meta-bundle (`routeros`, `routeros-arm`, `routeros-mipsbe`, `routeros-mmips`, `routeros-smips`, `routeros-x86`, `system`). | `supportsHotspot` |
| **Safe Mode Advisory** | Flags `REST` transport as lacking interactive CLI Safe Mode (relies on pre-backup, management isolation guard, and tracked rollback). | Warning surfaced in capability report |

---

## 2. Protocol Client Compatibility (`REST` vs `Binary API`)

| Operation | RouterOS Binary API (`routeros-api.client.ts`) | RouterOS 7 REST API (`routeros-rest.client.ts`) |
| :--- | :--- | :--- |
| **`/add` commands** | Sends native `/path/add` + `=k=v`; reads `!done` `ret=.id`. | Translates trailing `/add` to `PUT /rest/<path>`; extracts `.ret` / `.id`. |
| **`/remove` commands** | Sends `/path/remove` + `=.id=*id`. | Validates hexadecimal ID via `isValidRouterOsId`; strips `.id`, sends `POST /rest/<path>/remove` with `{ "numbers": "*id" }`. |
| **`/set` commands** | Sends `/path/set` + `=.id=*id` (or singleton attributes directly). | If path is in `SINGLETON_SET_PATHS` (`/ip/dns/set`, `/system/identity/set`, `/system/clock/set`, `/system/ntp/client/set`, `/system/note/set`), omits IDs and sends `POST`. For `.id` targets, sends `PATCH /rest/<collection>/*id` and falls back on HTTP `400`/`405`/`501` to `POST /rest/<collection>/set` with `{ numbers }`. Named targets (`wlan1`, `default`) route via `POST ...` with `numbers`. |
| **Single-object REST JSON** | Always returns `!re` array rows. | `toArray()` wraps non-empty single JSON objects (seen on `/file` when only 1 file exists) into `[res]`. |
| **Binary Backup Load (`restoreBackup`)** | Strips `.backup` first (mandatory on ROS6) and falls back to filename with `.backup`; distinguishes explicit `!trap` (`wrong password`, `corrupted`) from socket drop (reboot signal). | Uses REST equivalent / distinguishes trap vs reboot drop after dispatch. |
| **RSC Export (`createRscExport`)** | Sends `/export =file=<name> =show-sensitive=no`, automatically retrying without `show-sensitive` if ROS6 returns `unknown parameter`. | Sends `POST /rest/export` with `show-sensitive: 'no'`, falling back without `show-sensitive` on `unknown parameter`. |
| **File Download (`downloadFile`)** | Shared `downloadRouterFileOverHttp` enforcing HTTPS for non-loopback hosts, `/flash/<name>` 404 fallback, HTML & `Content-Length` checks. | Same shared `downloadRouterFileOverHttp` helper. |
| **Topologies & Routes (`listRoutes`, `listBondingInterfaces`, `listPppoeClients`)** | Maps `gateway-status`, `immediate-gw`, strict string/comma `slaves`, PPPoE `interface`. | Maps `gateway-status`, `immediate-gw`, strict String/Array `slaves` validation (rejecting non-string Objects). |

---

## 3. Adapter Stage Differences (`RouterOs6Adapter` vs `RouterOs7Adapter`)

- **Wi-Fi Configuration (`WIRELESS_WIFI` stage):**
  - `RouterOs6Adapter`: creates `/interface/wireless/security-profiles/add` (`mode=dynamic-keys`, `authentication-types=wpa2-psk`, `wpa2-pre-shared-key=...`) and configures `/interface/wireless/set` (`mode=ap-bridge`, `wps-mode=disabled` by default).
  - `RouterOs7Adapter`: selects `/interface/wifi/set` (`WIFI_QCOM`) or `/interface/wifiwave2/set` (`WIFIWAVE2`) with nested properties (`configuration.mode=ap`, `configuration.ssid`, `security.authentication-types=wpa2-psk,wpa3-psk`, `security.passphrase`), or falls back cleanly to `/interface/wireless` if `LEGACY_WIRELESS` is detected.
- **Hotspot User Profiles (`USER_PROFILES` stage):**
  - Both adapters configure `/ip/hotspot/user/profile` (`rate-limit`, `shared-users`, `keepalive-timeout`, `status-autorefresh=1m`, `transparent-proxy=no`, `add-mac-cookie=yes`, `mac-cookie-timeout=1d`).
  - `enableLocalUsageScript`: ROS6 logs `$user`/`$cause`; ROS7 resolves `[/system clock get date]` safely without using blocked `[find` wildcards (`assertCommandSafeToExecute`).
- **NTP & Auto-Backup Scheduler (`SCHEDULER_MONITORING` stage):**
  - `RouterOs6Adapter`: uses `/system/ntp/client/set` with `=primary-ntp` / `=secondary-ntp` (plus `=server-dns-names` on `SNTP_V6`), and scheduler `/export file=sudafi-auto-latest`.
  - `RouterOs7Adapter`: enables `/system/ntp/client/set =enabled=yes` and adds servers via `/system/ntp/client/servers/add`, and scheduler `/export show-sensitive=no file=sudafi-auto-latest`.
- **Shared Network Stages (`BaseRouterOsAdapter`):** `/queue/type` (`sfq`), Bridge/Ports, WAN (DHCP / PPPoE / Static + Masquerade NAT), IP Pool, DHCP Server & Network, DNS (`allow-remote-requests`), Hotspot Server/Profile, Walled Garden, and Security Firewall (`Mangle` anti-tethering TTL, DNS redirect, Drop admin ports).

---

## 4. Mobile Local Discovery & Auth Compatibility (`MikrotikDiscoveryService`)

- `apps/mobile/lib/core/services/mikrotik_discovery_service.dart` (`verifyCredentialsLocally`):
  - **ROS 7 REST Path:** Tests `GET http(s)://<host>:<port>/rest/system/resource` with HTTP Basic Auth; distinguishes HTTP `200` (`CONNECTED_SUCCESS`, extracts live `version`/`board-name`) from `401`/`403` (`INVALID_CREDENTIALS`).
  - **Binary API Socket Path (ports 8728/8729):** If REST is closed/unreachable, connects via `_LocalMikrotikBinaryApiClient` supporting both ROS >= `6.43` plaintext `/login` (`=name`, `=password`) and legacy ROS `< 6.43` MD5 challenge-response (`=response=00<md5>`), then queries `/system/resource/print` after authentication. Invalid credentials trigger `!trap` and fail auth instead of letting raw TCP open ports masquerade as connected ROS6 devices.
  - **Account Mode Preservation (`RouterSetupScreen`):** Stored-credential (`ACCOUNT`) mode with empty local password skips local unauthenticated fallback on LAN IPs and delegates to backend `testConnectionDirect` without downgrading `ROS7` to `V6`.
