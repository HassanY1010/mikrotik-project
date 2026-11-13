/**
 * Canonical MikroTik RouterOS scripts and configuration constants
 * Extracted verbatim from client production reference script (2-cookie-enabled.rsc)
 */

export const CANONICAL_DEFAULTS = {
  BRIDGE_NAME: 'LAN',
  WAN_INTERFACE_DEFAULT: 'ether1',
  WAN_INTERFACE_RENAMED: 'IN',
  HOTSPOT_SERVER_NAME: 'Mikrotik',
  HOTSPOT_PROFILE_NAME: 'Mikrotik',
  USER_PROFILE_NAME: 'CARD',
  POOL_NAME: 'HOTSPOT',
  POOL_RANGE: '10.0.0.51-10.0.0.254,10.0.1.2-10.0.1.254,10.0.2.2-10.0.2.254,10.0.3.2-10.0.3.254',
  GATEWAY_IP: '10.0.0.1/22',
  DHCP_SERVER_NAME: 'Mikrotik',
  DHCP_LEASE_TIME: '3h',
  INITIAL_CARD_EMAIL: '01020725110@CARD.NET',
  COOKIE_TIMEOUT: '3d',
  SCHEDULER_EXPIRED_TIME_NAME: 'Mikrotik-Expired-TIME',
  SCHEDULER_EXPIRED_TIME_INTERVAL: '5m',
  SCHEDULER_BACKUP_NAME: 'Mikrotik-backup',
  SCHEDULER_BACKUP_INTERVAL: '6h',
  TIMEZONE: 'Africa/Khartoum',
  NTP_SERVERS: ['time.google.com', '196.192.32.7'],
  SFQ_QUEUE_NAME: 'Eng-Hamdi',
  BRIDGE_ADMIN_MAC: 'AA:06:EE:DC:BB:70',
} as const;

/**
 * The authentic on-login script from 2-cookie-enabled.rsc
 * Calculates card expiration absolute minutes from system clock and writes:
 * |expiredmin|(User)name@hostname (START) date time
 * Tags user email: 0-0MiB-active-LT@Eng-Hamdi.info / T / L / unlimited
 */
export const CANONICAL_CARD_ON_LOGIN = `:delay 2; :local expiredmin ""; :local a $user; :local id [/ip hotspot user find name=$a !disabled]; :local email [/ip hotspot user get $id email]; :local m [/ip hotspot active get [find user=$a] mac-address]; :local hostnam; :do {:set hostnam [/ip dhcp-server lease get [find mac-address=$m] host-name];} on-error={ :set hostnam "" }; :if ([:typeof $hostnam] != "str" || $hostnam = "") do={ :set hostnam "Unknown-Device"; }; :local nme [/ip hotspot user get $id name]; :if (($email = "01020725110@CARD.NET")) do={\t:local limituptime [/ip hotspot user get $id limit-uptime ]; :local limituptimetype [:typeof [/ip hotspot user get $id limit-uptime ]]; :local limitbytes [:typeof [/ip hotspot user get $id limit-bytes-total]]; :local startdate [/system clock get date]; :local starttime [/system clock get time]; :local email; :if ($limituptimetype != "nil" and $limitbytes != "nil") do={\t:set email "0-0MiB-active-LT@Eng-Hamdi.info"; } else={ :if ($limituptimetype != "nil" and $limitbytes = "nil") do={ :set email "0-0MiB-active-T@Eng-Hamdi.info"; } else={ :if ($limituptimetype = "nil" and $limitbytes != "nil") do={ :set email "0-0MiB-active-L@Eng-Hamdi.info"; } else={ :if ($limituptimetype = "nil" and $limitbytes = "nil") do={ :set email "0-0MiB-active-unlimited@Eng-Hamdi.info"; }; }; }; }; :if ( email~"MiB-active-LT@Eng-Hamdi.info" or email~"MiB-active-T@Eng-Hamdi.info" ) do={ :local montharray  ("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" ); :local monthdays (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31); :local startyear 0; :local startmonths 0; :local startdays 0; :if ([:typeof [:find $startdate "-"]] = "num") do={:set startdays [ :pick $startdate 8 10 ]; :local startmonthtxt [ :pick $startdate 5 7 ]; :set startyear [ :pick $startdate 0 4 ]; :set startmonths ([:tonum $startmonthtxt] - 2); } else={ :set startdays [ :pick $startdate 4 6 ]; :local startmonthtxt [ :pick $startdate 0 3 ]; :set startyear [ :pick $startdate 7 11 ]; :set startmonths (([ :find $montharray $startmonthtxt]) - 1);}; :local starthour [:pick $starttime 0 2]; :local startminute [:pick $starttime 3 5]; :local baseYear 2000; :local starttotalDays ( (( $startyear - $baseYear ) - 1) * 365); :local startdaystotal 0; :for nodays from=0 to=$startmonths do={ :set startdaystotal ( $startdaystotal + [ :pick $monthdays $nodays ] ); }; :set startdaystotal ($startdaystotal + $starttotalDays + $startdays); :local startminutes ( $startminute + ([:tonum $starthour] * 60) + ([:tonum $startdaystotal] * 1440) ); :local uptimeMinutes 0; :if ([:find $limituptime "w"] >= 0) do={ :local weeks [:pick $limituptime 0 [:find $limituptime "w"]]; :set uptimeMinutes ($uptimeMinutes + [:tonum $weeks] * 10080); :set limituptime [:pick $limituptime ([ :find $limituptime "w" ] + 1) [:len $limituptime]]; }; :if ([:find $limituptime "d"] >= 0) do={ :local days [:pick $limituptime 0 [:find $limituptime "d"]]; :set uptimeMinutes ($uptimeMinutes + [:tonum $days] * 1440); :set limituptime [:pick $limituptime ([ :find $limituptime "d" ] + 1) [:len $limituptime]]; }; :local hours [:pick $limituptime 0 2]; :local minutes [:pick $limituptime 3 5]; :set uptimeMinutes ($uptimeMinutes + [:tonum $hours] * 60 + [:tonum $minutes]); :set expiredmin ($uptimeMinutes + $startminutes); :set expiredmin ("|" . $expiredmin . "|"); }; :local when ($startdate . " " . $starttime); /ip hotspot user set $id comment=($expiredmin . "(User)" . $nme . "@" . $hostnam . " (START) " . $when) email=$email;  }; }`;

/**
 * The authentic on-logout script from 2-cookie-enabled.rsc
 * Decrements limit-bytes-total, updates consumed MiB in email tag,
 * and automatically removes user when quota is exhausted (< 10MB)
 */
export const CANONICAL_CARD_ON_LOGOUT = `:local qname $user; :local bytesin [/ip hotspot user get $qname bytes-in];:local bytesout [/ip hotspot user get $qname bytes-out];:local bytes ($bytesin + $bytesout); :local hotsid [/ip hotspot user find name=$qname !disabled]; :local byteslimit [/ip hotspot user get $hotsid limit-bytes-total]; :local email [/ip hotspot user get $hotsid email]; :local emaillen [:len $email]; :local bmark [:find $email "-" 0]; :local mmark [:find $email "MiB" 0]; :local restemail [:pick $email $mmark $emaillen]; :local currbyte [:pick $email 0 $bmark]; :local newbyte ($bytes + $currbyte); :local newmib (($bytes + $currbyte) / 1024 / 1024); :local comm [/ip hotspot user get $hotsid comment]; :local pos1 [:find $comm "(User)"]; :local pos2 [:find $comm "@"]; :local us [:pick $comm ($pos1+6) $pos2]; :local when ([/system clock get date] . " " . [/system clock get time]); :if ($email~"MiB-active-LT@Eng-Hamdi.info" or $email~"MiB-active-L@Eng-Hamdi.info") do={ :if ($bytes >= ($byteslimit - (10 * 1024 * 1024))) do={ /ip hotspot user remove $hotsid ;  } else={ /ip hotspot user set $hotsid limit-bytes-total=($byteslimit - $bytes) email=($newbyte . "-" . $newmib . $restemail); /ip hotspot user reset-counters $hotsid; };\t} else={ :if ($email~"MiB-active-T@Eng-Hamdi.info" or $email~"MiB-active-unlimited@Eng-Hamdi.info") do={ /ip hotspot user set $hotsid email=($newbyte . "-" . $newmib . $restemail); /ip hotspot user reset-counters $hotsid; }; };`;

/**
 * The authentic 5-minute scheduler Mikrotik-Expired-TIME from 2-cookie-enabled.rsc
 * Compares current system clock in absolute minutes against |expiredmin|,
 * removes expired cards and their active sessions, or updates limit-uptime dynamically.
 */
export const CANONICAL_EXPIRED_TIME_SCRIPT = `:global tominute 0; { :local monthdays; :local date [/system clock get date]; :local time [/system clock get time]; :local montharray ("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"); :local year 0; :local months 0; :local days 0; :if ([:typeof [:find $date "-"]] = "num") do={ :set days [:pick $date 8 10]; :local monthtxt [:pick $date 5 7]; :set year [:pick $date 0 4]; :set months ([:tonum $monthtxt] - 2); } else={ :set days [:pick $date 4 6]; :local monthtxt [:pick $date 0 3]; :set year [:pick $date 7 11]; :set months ([:find $montharray $monthtxt] - 1); }; :local baseYear 2000; :if ($baseYear > $year) do={ :log error message="Time Not Correct" }; :local totalDays ((($year - $baseYear) - 1) * 365); :set monthdays (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31); :local hour [:pick $time 0 2]; :local minute [:pick $time 3 5]; :for nodays from=0 to=$months do={ :set tominute ($tominute + [:pick $monthdays $nodays]); }; :set tominute ($tominute + $days + $totalDays); :set tominute ($minute + ([:tonum $hour] * 60) + ([:tonum $tominute] * 1440)); }; :if ($tominute > 0) do={ :foreach i in=[/ip hotspot user find where !disabled and (email~"MiB-active-LT@Eng-Hamdi.info" or email~"MiB-active-T@Eng-Hamdi.info")] do={ :local hotsid $i; :local uname [/ip hotspot user get $i name]; :local when ([/system clock get date] . " " . [/system clock get time]); :local email [/ip hotspot user get $i email]; :local mmark [:find $email "MiB" 0]; :local femail [:pick $email 0 $mmark]; :local comm [/ip hotspot user get $i comment]; :if ([:len $comm] > 0) do={ :if ([:find $comm "|"] >= 0) do={ :local firstPosition [:find $comm "|"]; :local secondPosition [:find $comm "|" ($firstPosition + 1)]; :if (($firstPosition >= 0) && ($secondPosition > $firstPosition)) do={ :local posUser [:find $comm "(User)"]; :local posAt [:find $comm "@"]; :local us [:pick $comm ($posUser + 6) $posAt]; :local autoTime [:tonum [:pick $comm ($firstPosition + 1) $secondPosition]]; :if ([:typeof $autoTime] = "num") do={ :if ($autoTime < $tominute) do={ /ip hotspot user remove $i ; :foreach act in=[/ip hotspot active find user=$uname] do={ /ip hotspot active remove $act; }; } else={ :local remainMinutes ($autoTime - $tominute); /ip hotspot user set $i limit-uptime=($remainMinutes . "m"); /ip hotspot user reset-counters $hotsid; }; }; }; }; }; }; } else={ :log error message="Time Not Correct"; };`;

/**
 * The authentic 6-hour backup scheduler from 2-cookie-enabled.rsc
 */
export const CANONICAL_BACKUP_SCRIPT = `/file remove Mikrotik-Hotspot.backup;\r\n:delay 500ms;\r\n/system backup save name=Mikrotik-Hotspot;\r\n`;
