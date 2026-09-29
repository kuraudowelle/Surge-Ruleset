import path from 'node:path';
import { task } from './trace';
import { compareAndWriteFile } from './lib/create-file';
import { OUTPUT_MODULES_DIR } from './constants/dir';

const HOSTNAMES = [
  // Network Detection, Captive Portal
  'dns.msftncsi.com',
  // '*.msftconnecttest.com',
  // 'network-test.debian.org',
  // 'detectportal.firefox.com',
  // Handle SNAT conversation properly
  '*.srv.nintendo.net',
  '*.stun.playstation.net',
  'xbox.*.microsoft.com',
  '*.xboxlive.com',
  '*.turn.twilio.com',
  '*.stun.twilio.com',
  'stun.syncthing.net',
  'stun.*',
  // Steam LAN Cache
  //
  // Steam will DNS lookup this domain, trying to find Local LAN Cache server
  // If one is found, Steam client will try to connect with this IP with original CDN domain in
  // HTTP Host header, while in HTTP plain HTTP/1.1. It is up to the HTTP server to handle this.
  //
  // By having lancache.steamcontent.com in Real IP, we can avoid Steam client accidentally mistaking
  // the Fake IP as a local LAN cache. This also helps real LAN cache to work properly.
  'lancache.steamcontent.com'
  // 'controlplane.tailscale.com',
  // NTP
  // 'time.*.com', 'time.*.gov', 'time.*.edu.cn', 'time.*.apple.com', 'time?.*.com', 'ntp.*.com', 'ntp?.*.com', '*.time.edu.cn', '*.ntp.org.cn', '*.pool.ntp.org'
  // 'time*.cloud.tencent.com', 'ntp?.aliyun.com',
  // QQ Login
  // 'localhost.*.qq.com'
  // 'localhost.ptlogin2.qq.com
  // 'localhost.sec.qq.com',
  // 'localhost.work.weixin.qq.com'
];

export const buildAlwaysRealIPModule = task(require.main === module, __filename)(async (span) => {
  const surge: string[] = [];

  return compareAndWriteFile(
    span,
    [
      '#!name=[Sukka] Always Real IP Plus',
      `#!desc=Last Updated: ${new Date().toISOString()}`,
      '',
      '[General]',
      `always-real-ip = %APPEND% ${HOSTNAMES.concat(surge).join(', ')}`
    ],
    path.resolve(OUTPUT_MODULES_DIR, 'sukka_common_always_realip.sgmodule')
  );
});
