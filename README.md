# Surge Ruleset

Ruleset snippets for [Surge](https://nssurge.com/), maintained by [kuraudowelle](https://github.com/kuraudowelle) for personal use. Based on [SukkaW/Surge](https://github.com/SukkaW/Surge) (AGPL-3.0), now maintained as an independent repository. Read the [Terms and License](#terms-and-license) before you use it.

## Rule Section

Paste this over the `[Rule]` section of your Surge profile. It is the whole section, from `[Rule]` to `FINAL`, with every ruleset of this project in one chosen order. Which ruleset a request matches first depends on that order only, never on the policies; where the request goes depends on the policy of the ruleset it matched. The order is a set of priorities, and some of them matter when your policies differ, for instance when CDN and Streaming use different countries: [How the Order Works](#how-the-order-works) lists them, so read it before you change a policy.

Every policy in it except `DIRECT`, `REJECT`, `REJECT-DROP` and `REJECT-NO-DROP` has to exist in your profile: [Policies](#policies) lists them, and has a `[Proxy Group]` to start from.

```ini
[Rule]

# DIRECT, REJECT, REJECT-DROP and REJECT-NO-DROP are built in. Every other policy below has to exist in your profile (see "Policies" in the README).
# Your own rules for hostnames (DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD) go in front of the ruleset they override, your own IP rules go into the IP part at the end.

# ---- Ad blocking, privacy protection, malware blocking, phishing blocking
# Matched before all other rules, wherever it stands
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject-drop.conf,REJECT-DROP,pre-matching
# Base list
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/reject.conf,REJECT,extended-matching
# Extra domains, a supplement to the base list; must be used together with the base list
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/reject_extra.conf,REJECT
# Phishing site blocklist
# On Surge 5 for Mac (or newer), enabling both the base and extra blocked domains at the same time will not degrade matching performance or cause excessive memory usage
# DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/reject_phishing.conf,REJECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject.conf,REJECT,extended-matching
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject-no-drop.conf,REJECT-NO-DROP,extended-matching
# URL-REGEX
# Must be used together with the Surge module https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_mitm_hostnames.sgmodule
# MITM and URL-REGEX have a very high performance overhead and are not recommended
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject-url-regex.conf,REJECT

# ---- Never proxied
# Local names; the exceptions that live inside bigger rulesets further down (captive.apple.com inside apple.com, Google Scholar inside google.com);
# and the processes that must never be proxied (proxy tools, downloaders, ...), whatever host they talk to
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/lan.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/direct.conf,DIRECT

# ---- Speed tests and static CDNs
# A host that is in one of these and in a service ruleset further down goes to these
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/speedtest.conf,Speedtest,extended-matching
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/cdn.conf,CDN
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/cdn.conf,CDN

# ---- Services with a ruleset of their own, in front of the bigger rulesets that contain them
# YouTube Music is a part of YouTube, and both are in Streaming and in Google; TikTok is in Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/youtubemusic.conf,YouTube
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/youtube.conf,YouTube
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/tiktok.conf,TikTok
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reddit.conf,Reddit
# Antigravity is a part of Gemini, and both are in AI and in Google
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/antigravity.conf,Gemini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/gemini.conf,Gemini
# github.com and ghcr.io are in Homebrew as well. They are GitHub's, and a rule for a hostname cannot tell the traffic of Homebrew from the rest,
# so GitHub goes first and Homebrew keeps formulae.brew.sh. Homebrew first would send all of github.com and ghcr.io to the policy of Homebrew
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/github.conf,GitHub
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/homebrew.conf,Homebrew
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/telegram.conf,Telegram

# ---- Streaming: the regions first, then all services
# us North America, eu Europe, jp Japan, kr South Korea, hk Hong Kong, tw Taiwan. Give a region a policy of its own to split it from the rest
# Hulu Japan is in North America as well, so Japan stands in front of it. HBO GO Asia is in Hong Kong and Taiwan, Hong Kong comes first
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_jp.conf,Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_us.conf,Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_eu.conf,Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_kr.conf,Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_hk.conf,Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_tw.conf,Streaming
# All streaming services (including all of the above)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream.conf,Streaming

# ---- AI
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/ai.conf,AI
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/apple_intelligence.conf,AI,extended-matching

# ---- Apple: what is hosted in mainland China first, then the rest
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/apple_cdn.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/apple_cn.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/apple_services.conf,Apple

# ---- Microsoft: Teams, and the CDN nodes in mainland China, in front of the rest
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/teams.conf,Microsoft
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/microsoft_cdn.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/microsoft.conf,Microsoft

# ---- Google, after everything that is a part of it
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/google.conf,Google

# ---- Large file downloads (software updates, operating systems, ...): what no service above claims
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/download.conf,Download
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/download.conf,Download

# ---- Mainland China, then the other countries and regions
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/domestic.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/global.conf,Proxy

# ---- IP rules: Surge resolves DNS from the first one on, so every rule for a hostname is above this line
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/reject.conf,REJECT-DROP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/telegram.conf,Telegram
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/telegram_asn.conf,Telegram
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/github.conf,GitHub
# A few addresses of CDNs, GitHub Pages among them, so it stays behind github.conf
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/cdn.conf,CDN
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream.conf,Streaming
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/ai.conf,AI
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/apple_services.conf,Apple
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/teams.conf,Microsoft
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/google.conf,Google
# A few addresses of hosts for large files
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/download.conf,Download
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/lan.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/domestic.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/china_ip.conf,DIRECT
# Only use it if you are using IPv6
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/china_ip_ipv6.conf,DIRECT

FINAL,Proxy,dns-failed
```

### Policies

| Policy | Used for |
| --- | --- |
| `Proxy` | The other countries and regions, and `FINAL`. The default group of your profile, the one that holds your nodes |
| `Streaming` | Streaming services. All regions share it, see the comment in the Rule section |
| `AI` | AI services, Apple Intelligence |
| `Gemini` | Gemini and Antigravity |
| `YouTube` | YouTube and YouTube Music |
| `TikTok` | TikTok |
| `Reddit` | Reddit |
| `GitHub` | GitHub |
| `Homebrew` | Homebrew: `formulae.brew.sh` only, see [How the Order Works](#how-the-order-works) |
| `Google` | Google |
| `Telegram` | Telegram |
| `Apple` | Apple Service |
| `Microsoft` | Microsoft and Microsoft Teams |
| `Download` | Large file downloads |
| `CDN` | Common static CDNs |
| `Speedtest` | Speedtest domains |
| `DIRECT` | Intranet and LAN, mainland China, services that should go direct, Apple CDN, Apple CN, Microsoft CDN, chnroute |
| `REJECT`, `REJECT-DROP`, `REJECT-NO-DROP` | Blocking |

If your profile does not have these groups yet, this `[Proxy Group]` makes them. `Proxy` has to exist already. Every group starts on `Proxy`, so every service goes through `Proxy` until you pick another member for it in Surge.

```ini
[Proxy Group]
Streaming = select, Proxy, DIRECT
AI = select, Proxy, DIRECT
Gemini = select, Proxy, DIRECT
YouTube = select, Proxy, DIRECT
TikTok = select, Proxy, DIRECT
Reddit = select, Proxy, DIRECT
GitHub = select, Proxy, DIRECT
Homebrew = select, Proxy, DIRECT
Google = select, Proxy, DIRECT
Telegram = select, Proxy, DIRECT
Apple = select, Proxy, DIRECT
Microsoft = select, Proxy, DIRECT
Download = select, Proxy, DIRECT
CDN = select, Proxy, DIRECT
Speedtest = select, Proxy, DIRECT
```

### How the Order Works

Surge follows the first rule that matches and ignores all the ones after it ([Surge manual](https://manual.nssurge.com/rules/overview.html)), so where a line stands decides which ruleset a request matches, and the policy of that ruleset decides where the request goes. The order is a choice, not the only order that works: two rules give it its shape, and [the priorities](#the-priorities) below say what it chooses.

**1. Rules for hostnames before IP rules.** `DOMAIN-SET` and `non_ip` rulesets do not trigger DNS resolution, `ip` rulesets do: Surge resolves the domain at the first IP rule it reaches. All the rules for hostnames have to stand in front of it, yours included (`DOMAIN`, `DOMAIN-SUFFIX` and `DOMAIN-KEYWORD` above, `IP-CIDR`, `IP-CIDR6`, `IP-ASN` and `GEOIP` below). `DOMAIN-SET` and `non_ip` rulesets both avoid DNS, so there is no order to keep between the two kinds, and the Rule section does not put `domainset` first: it orders them by what they contain, which is the second rule.

**2. Narrower before broader.** A host that is in two rulesets goes to the one that stands first. A ruleset that is a part of a bigger one stands in front of it, or its policy is never used: YouTube Music, YouTube and TikTok in front of Streaming; Antigravity and Gemini in front of AI and Google; GitHub in front of AI and Homebrew; Apple CDN and Apple CN in front of Apple Service; Microsoft Teams and Microsoft CDN in front of Microsoft; the regions in front of the list of all streaming services.

If you place any `ip` ruleset, or your own `IP-CIDR`, `IP-CIDR6`, `IP-ASN`, and `GEOIP` rules, before any `domainset` or `non_ip` ruleset or any `DOMAIN`, `DOMAIN-SUFFIX`, and `DOMAIN-KEYWORD` rules you added yourself, **you will immediately lose the DNS pollution protection that Surge and this project provide, and you will be completely exposed to the GFW's DNS pollution.**

> Surge matches rules one by one from top to bottom in the order they appear in the configuration, and DNS resolution is performed if and only when matching IP-type rules, FINAL, or the direct policy. Adding the rulesets in the order above avoids, as far as possible, your device issuing DNS resolution for domains that need to be proxied, thereby providing a degree of protection against the so-called "DNS pollution".

#### The Priorities

From the first to the last. A priority only shows when your policies differ: with every ruleset on `Proxy`, all of them end in the same place.

1. **`reject-drop`, then the blocklists.** Nothing overrides them. `reject-drop` is matched before every other rule, wherever it stands.
2. **Direct and LAN: never proxied, and in front of every service.**
   - Its hostnames are exceptions inside bigger rulesets: `captive.apple.com` is inside `apple.com`, Google Scholar inside `google.com`. A few university mirrors that Download lists too are inside academic domains that Direct lists, and go DIRECT.
   - Its rules for processes (proxy tools, downloaders, `tailscaled`, ...) match by who is asking, not by the hostname, so they win over every service behind them: `api.github.com` from Safari matches GitHub, and from `aria2c` it matches Direct and goes DIRECT.
   - The rules for processes and apps in the other rulesets (`PROCESS-NAME`, `USER-AGENT`) have the priority of their ruleset, so an app can be taken by a ruleset in front of its own: a request of YouTube Music (`USER-AGENT,YouTubeMusic*`) to `i.ytimg.com` matches CDN, not YouTube Music. Surge matches `PROCESS-NAME` on the Mac only, and `USER-AGENT` on plain HTTP or with MITM.
3. **Speedtest and CDN: in front of the services.** A host that one of them has and a service has too goes to Speedtest or CDN: `ytimg.com` goes to CDN, not to YouTube. So do the CloudFront hosts that streaming services list, because `cdn.conf` has the whole of `cloudfront.net`: DAZN's `d151l6v8er5bdm.cloudfront.net` matches CDN before Streaming. This is a choice, and it can matter: if CDN and Streaming use different countries, a streaming service can see one session from two of them. To let a service win, move its lines in front of the CDN lines, and change the tests of this repository with them.
4. **One service, one ruleset.** YouTube Music before YouTube, then TikTok, Reddit, Antigravity before Gemini, GitHub before Homebrew, Telegram: each in front of the bigger rulesets that contain it. GitHub stands in front of Homebrew because `github.com` and `ghcr.io` are in both, they are GitHub's hosts, and a rule for a hostname cannot tell the traffic of Homebrew from any other traffic to them. With Homebrew in front, all of `github.com` and `ghcr.io` would go to the policy of Homebrew, so Homebrew keeps `formulae.brew.sh`.
5. **Streaming: the regions first, then all services.** Hulu Japan is in North America and in Japan, Japan stands first. HBO GO Asia is in Hong Kong and in Taiwan, Hong Kong stands first.
6. **AI, Apple, Microsoft, Google.** AI is in front of Microsoft and Google, which have hosts of Copilot and Gemini.
7. **Services in front of Download.** Download takes what no service claims (mirrors, object storage): `dl.google.com` goes to Google, `download.xbox.com` to Microsoft and `codeload.github.com` to GitHub.
8. **Mainland China, then the other countries and regions.**
9. **IP rules, last.** Google's IP ranges are all of Google, YouTube and Gemini included, and cannot be told apart by address: a connection by IP address gets the policy of Google, whatever the service is.

### Check It

Which ruleset a request matches first, for hosts where the order decides. The table names the process too, because rules for processes depend on placement: the same hostname can match another ruleset from another process. The request viewer of Surge shows the rule that a request matched, so you can look at your own profile the same way.

`pnpm test` asserts every row, and more, in [`Build/lib/readme-routing.test.ts`](Build/lib/readme-routing.test.ts): it reads the Rule section of this file and the published rulesets, and asserts which ruleset matches first, whatever the policies are. It simulates `DOMAIN`, `DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, `DOMAIN-WILDCARD` (and the lines of a `DOMAIN-SET`), `PROCESS-NAME`, `USER-AGENT`, `PROTOCOL`, `DEST-PORT`, `SRC-IP`, `IP-CIDR`, `IP-CIDR6`, `AND`, `OR` and `NOT`. It does not evaluate `URL-REGEX` and `IP-ASN`, which some rulesets have, and it does not resolve DNS or look at the TLS SNI and the Host header (`extended-matching`): a request only has what the test gives it. The header of [`Build/lib/surge-rules.ts`](Build/lib/surge-rules.ts) has the details.

The workflow of this repository runs it twice. `pnpm test` reads the rulesets that are committed, which are the ones that the URLs above serve. After every build, and before anything is deployed, `pnpm run check-output` runs it again on the rulesets that the build has just made (`SURGE_LIST_DIR=public/List`), together with [`Build/lib/published-output.test.ts`](Build/lib/published-output.test.ts), which checks the files themselves: whole files, hostnames and address ranges that are what they say, and the MTProto addresses of Telegram. An upstream list can change which ruleset a request matches first with no change in this repository, and a build that fails is not deployed: the published rulesets stay the ones of the last build that passed.

| Host | From | Matches first | Other rulesets that have it, or the one it is inside |
| --- | --- | --- | --- |
| `music.youtube.com` | any | `youtubemusic.conf` | a part of YouTube; Streaming and Google have it too |
| `www.youtube.com` | any | `youtube.conf` | Streaming and Google have it too |
| `www.tiktok.com` | any | `tiktok.conf` | Streaming has it too |
| `gemini.google.com` | any | `gemini.conf` | AI and Google have it too |
| `api.github.com` | Safari | `github.conf` | AI has it too |
| `api.github.com` | `aria2c` | `direct.conf` | a process rule of Direct, in front of the services |
| `ghcr.io` | any | `github.conf` | Homebrew and Download have it too |
| `formulae.brew.sh` | any | `homebrew.conf` | what Homebrew keeps |
| `cn.ls.apple.com` | any | `apple_cn.conf` | inside `apple.com`, which Apple Service has |
| `captive.apple.com` | any | `direct.conf` | inside `apple.com`, which Apple Service has |
| `scholar.google.com` | any | `direct.conf` | inside `google.com`, which Google has |
| `hulu.jp` | any | `stream_jp.conf` | North America has it too |
| `d151l6v8er5bdm.cloudfront.net` | any | `cdn.conf` | Streaming has it too (DAZN); CDN is in front, by choice |

## Rulesets

What each ruleset is made of. The order to use them in is the one of the Rule section above, not the order of these sections.

The rulesets of the services and of the categories below (from Speedtest to Common Services in Other Countries and Regions) are made of two kinds of data, which are merged on every build:

- **Automatic**: what the owner of a service publishes where there is something that a build can read, and the lists that the community keeps ([v2fly/domain-list-community](https://github.com/v2fly/domain-list-community), downloaded as [the one file that v2fly builds of all its lists](https://github.com/v2fly/domain-list-community/tree/release)) where there is not. It follows its sources
- **Collected by hand**: what nobody lists: the long tail of hostnames of single sites and of mirrors, the patterns, and the rules of apps (`USER-AGENT`, `PROCESS-NAME`). Every ruleset has its file in `Source/`: `Source/non_ip/ai.conf` for `List/non_ip/ai.conf`, `Source/domainset/cdn.conf` for `List/domainset/cdn.conf`, and so on, and the streaming services are in [`Source/stream.ts`](Source/stream.ts). The sections below name them

The automatic update never changes what is collected by hand, it adds to it: to keep a domain for good, add it to the file of its ruleset. A file of this kind says `# $ custom_build_script` at the start of a line, which keeps it from being published as a ruleset of its own (the build fails, and says so, if the line is missing). The header of a published ruleset says how many of its entries are collected by hand.

- **Surge (Mac/iOS/tvOS)**: Surge optimizes all types of rules to varying degrees
  - `/List/domainset/`: `DOMAIN-SET`, domain-only rulesets that do not trigger DNS resolution
  - `/List/non_ip/`: `RULE-SET`, rulesets that do not trigger DNS resolution
  - `/List/ip/`: `RULE-SET`, rulesets that trigger DNS resolution

### Ad Blocking / Privacy Protection / Malware Blocking / Phishing Blocking

- Automatically generated
- For the data sources, the allowlist of domains, and how the list is generated, see [`build-reject-domainset.ts`](Build/build-reject-domainset.ts)
- Recommended for Surge for Mac only; on mobile platforms, use a dedicated tool (such as AdGuard for Android/iOS) for better performance
- **Not a replacement for browser ad-blocking extensions (such as AdGuard for Browser)**

### Speedtest Domains

- Automatically generated, plus the domains collected by hand ([`Source/domainset/speedtest.conf`](Source/domainset/speedtest.conf)), which the update keeps
- `speedtest.net` test points: the domains of speed test servers in dozens of common regions, fetched through the Speedtest API (a slice of the regions on each build, and the list keeps the domains of the earlier builds, so it grows)
- The backend servers that [LibreSpeed](https://librespeed.org/backend-servers/servers.php) publishes, and the endpoints of macOS `networkQuality`, from [the configuration that Apple's tool downloads](https://mensura.cdn-apple.com/api/v1/gm/config)
- The sites and servers of the other speed test tools (Cloudflare, M-Lab, OpenSpeedTest, nPerf, ...): [`category-speedtest`](https://github.com/v2fly/domain-list-community/blob/master/data/category-speedtest) of the community
- `fast.com` itself is in the list, but its test points share infrastructure and domains with the Netflix CDN and would affect streaming traffic routing, so they are not included in this ruleset
- Lets you run speed tests over a designated network egress without affecting normal internet access through the primary egress

### Common Static CDNs

- Automatically generated, plus what is collected by hand: the hostnames of the CDNs and the asset servers of single sites that no list has ([`Source/domainset/cdn.conf`](Source/domainset/cdn.conf)), and the patterns and the few addresses ([`Source/non_ip/cdn.conf`](Source/non_ip/cdn.conf) and [`Source/ip/cdn.conf`](Source/ip/cdn.conf)), which the update keeps
- The CDNs that the community lists ([`category-cdn-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-cdn-!cn): jsDelivr, cdnjs, esm.sh, imgix, Bunny, Gcore, CDN77, ...) and the [public gateways of IPFS](https://github.com/ipfs/public-gateway-checker), which the IPFS project lists
- Akamai, Cloudflare and Fastly are not in the automatic part, although the community lists them as CDNs. AbemaTV, DAZN, Bilibili International, Spotify and other services that have rulesets of their own are hosted on them, and this ruleset comes before theirs: a rule for a whole network would take their traffic away from them
- The hand-collected part does have the whole of Amazon CloudFront (`cloudfront.net`), and some streaming services list hosts on it: those go to CDN, see [The Priorities](#the-priorities)
- The object storage domains are in [Large File Downloads](#large-file-downloads-software-updates-operating-systems-etc)
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes
- Includes some domains that are not in `global.conf`, so even if you have no use for the low-rate nodes offered by commercial public proxy services and do not need to split this traffic, it is still recommended to use these rules; in that case, just assign them the same policy as `global.conf`

### Streaming

- Every service is made of two kinds of data, which [`Source/stream.ts`](Source/stream.ts) keeps apart, together with the region that the service belongs to:
  - Automatic, on every build: the list that the community keeps for the service ([v2fly/domain-list-community](https://github.com/v2fly/domain-list-community/tree/master/data)), and, for Netflix, the addresses that its owner announces itself (AS2906, which [RIPEstat](https://stat.ripe.net/docs/02.data-api/announced-prefixes.html) lists)
  - Collected by hand, which the update keeps: the domains that no list has, the addresses, and the `USER-AGENT` and `PROCESS-NAME` rules of apps, which no list carries
- Includes 4gtv, AbemaTV, All4, Amazon Prime Video, Apple Music TV, Apple TV, Bahamut, BBC, Bilibili Intl, Crackle, DAZN, Deezer, Discovery+, Disney+ (with Hulu, ESPN, Hotstar, ...), DMM, encoreTVB, Fox Now, Fox+, Friday, HBO Go / Now / Max / Asia, Himalaya, Hulu, Hulu Japan, HWTV, iQiYi Global, ITV, JOOX, KKBOX, KKTV, Line TV, LiTV, MangaFox, My5, myTV Super, Naver TV, Netflix, NHK, niconico, Now E, Overcast, Pandora, Paramount+, PBS, Peacock, Pluto TV, Pornhub, SHOWTIME, SoundCloud, Spotify, TaiwanGood, TIDAL, TikTok, Tubi TV, TVB Anywhere, TVer, Twitch, Viu / ViuTV, Vudu, WeTV, YouTube and YouTube Music
- A service has an automatic part only if the community has a list that is about that service and nothing else. There is none for 4gtv, All4, Apple Music TV, Crackle, encoreTVB, Fox Now, Fox+, Friday, Himalaya, Hulu Japan (the list of Hulu has `hulu.jp`, and not the rest of it), HWTV, ITV, JOOX, MangaFox, My5, Naver TV, Now E, Overcast, Pandora, Paramount+, Peacock, TaiwanGood, TVB Anywhere, Vudu and WeTV, so they are collected by hand alone. The lists of a whole company (Fox, Naver, CBS, NBCUniversal, TVB) would send all of the company to the policy of a streaming service
- YouTube, YouTube Music and TikTok have rulesets of their own as well (below), which are the ones that are kept up to date on their own: what is here for them is what was collected by hand. In the Rule section their rulesets stand in front of these lists
- `List/ip/stream_us.conf`, `stream_eu.conf`, `stream_jp.conf`, `stream_kr.conf`, `stream_hk.conf` and `stream_tw.conf` are published too and hold no addresses today (none of their services has addresses that its owner announces). The Rule section has `List/ip/stream.conf` only, which has the addresses of Netflix; a regional one that gets addresses goes in front of it

### AI

- Domain rules: automatically generated from the list that the community keeps for the AI services that are not in mainland China ([`category-ai-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-ai-!cn): OpenAI, Claude, Gemini, Perplexity, Grok, Copilot, Cursor, Mistral, and more), plus what is collected by hand ([`Source/non_ip/ai.conf`](Source/non_ip/ai.conf)), which the update keeps. It has the one rule that no list of domains can carry, the page that the site of Gemini sends a client to when it does not like its IP address (it needs MITM on `www.google.com`)
- IP rules: automatically generated from the ranges of ChatGPT Voice that OpenAI [publishes itself](https://openai.com/chatgpt-voice.json)
- `apple_intelligence.conf`: automatically generated from [`apple-intelligence`](https://github.com/v2fly/domain-list-community/blob/master/data/apple-intelligence) of the community, plus what is collected by hand ([`Source/non_ip/apple_intelligence.conf`](Source/non_ip/apple_intelligence.conf))

### Reddit / Homebrew / GitHub / TikTok / YouTube / YouTube Music / Google / Gemini / Antigravity

- Automatically generated on every build, from the source that is closest to the service: what its owner publishes, where the owner publishes something that a build can read, and the list that the community keeps ([v2fly/domain-list-community](https://github.com/v2fly/domain-list-community/tree/master/data)) where the owner does not. Every file says which of the two it is made from
- One file per service, so every service can go to its own policy

| Ruleset | Built from | Source |
| --- | --- | --- |
| `github.conf` (Non IP and IP) | GitHub's own [meta API](https://docs.github.com/en/rest/meta/meta): the domains of `website`, `codespaces`, `copilot`, `packages`, `storage` and `actions`, and the services of `artifact_attestations`; the IP ranges of `web`, `api`, `git`, `pages` and `packages`. GitHub says that neither list is meant to be exhaustive. It lists what its services need, which includes domains of Microsoft and Azure, so a wildcard is only kept on a domain of GitHub (named after it, or `ghcr.io`); hostnames are kept as listed | Official |
| `homebrew.conf` | The defaults that Homebrew defines in its own [source code](https://github.com/Homebrew/brew/blob/HEAD/Library/Homebrew/brew.sh) for the API, the bottles and the git remotes (`HOMEBREW_*_DEFAULT_*`) | Official |
| `google.conf` (IP) | Google's own [`goog.json`](https://www.gstatic.com/ipranges/goog.json) without [`cloud.json`](https://www.gstatic.com/ipranges/cloud.json), which is what [Google documents](https://support.google.com/a/answer/10026322) for the ranges of its own services. All of Google is in it, so YouTube and Gemini are, but cannot be told apart by their addresses | Official |
| `google.conf` (Non IP) | [`google`](https://github.com/v2fly/domain-list-community/blob/master/data/google), and the lists it includes (YouTube, Firebase, Android, Google Play, ...) | Community |
| `youtube.conf` | [`youtube`](https://github.com/v2fly/domain-list-community/blob/master/data/youtube) | Community |
| `gemini.conf` | [`google-gemini`](https://github.com/v2fly/domain-list-community/blob/master/data/google-gemini): Gemini and the Google AI products that list groups with it (AI Studio, NotebookLM, Jules, Antigravity, ...) | Community |
| `antigravity.conf` | Taken from the `google-gemini` list above: the hostnames that contain `antigravity`. What Antigravity shares with the other Google AI products is in `gemini.conf` | Community |
| `reddit.conf` | [`reddit`](https://github.com/v2fly/domain-list-community/blob/master/data/reddit) | Community |
| `tiktok.conf` | [`tiktok`](https://github.com/v2fly/domain-list-community/blob/master/data/tiktok) | Community |
| `youtubemusic.conf` | The only one that is not generated: [the file](Source/non_ip/youtubemusic.conf) has what sets YouTube Music apart from YouTube, whose domains it shares (its hostname and its `USER-AGENT` rules) | Manually maintained |

Why the others are community lists: no list of their domains that a build can read was found for them.

- **Google** publishes its IP ranges (above), and its domains as pages for admins only: a [Chrome hostname allowlist](https://support.google.com/chrome/a/answer/6334001), a [Google Workspace one](https://knowledge.workspace.google.com/admin/getting-started/set-up-a-google-workspace-host-name-allowlist) and the [setup of Gemini Code Assist](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini). They list what those products need, not YouTube or Gemini as a whole. Google's [API Discovery directory](https://www.googleapis.com/discovery/v1/apis) has 535 APIs, and not the Gemini API (`generativelanguage`)
- **Reddit** is served from Fastly: `www.reddit.com` is a CNAME for `reddit.map.fastly.net`, and its addresses are inside the [ranges that Fastly publishes](https://api.fastly.com/public-ip-list) for all of its customers, so no list of addresses can tell Reddit apart. The [registry data](https://stat.ripe.net/) does not help either: the ASN that is often given for Reddit, AS22697, is registered to Roblox
- **TikTok**, **Antigravity** and **YouTube Music** publish nothing of the kind

> The rulesets overlap (`google.conf` has YouTube and the Google AI products, `gemini.conf` has Antigravity, `homebrew.conf` has hosts of GitHub), and a connection follows the first rule that matches, so the more specific rulesets stand first in the Rule section.
>
> The lists of the owners are made for networks that have to allow a service, and the lists of the community for routing it, so they do not have to agree. GitHub says that its own are not exhaustive. `USER-AGENT`, `PROCESS-NAME` and `URL-REGEX` rules cannot come from a list of domains either.
>
> A service whose data is gone or empty does not hold back the other rulesets: its file stays as the last build left it, and the build log says so (on GitHub Actions also as a warning on the workflow run). The build asks GitHub without a token unless `GITHUB_TOKEN` is set, which the workflow does to stay clear of the 60 requests an hour of an anonymous client.

### Telegram

- Domain rules: automatically generated from the [v2fly/domain-list-community `telegram`](https://github.com/v2fly/domain-list-community/blob/master/data/telegram) list, plus [a few extra domains](Source/non_ip/telegram.conf) and `PROTOCOL,MTProto` (see [Surge as an MTProto proxy server](#surge-as-an-mtproto-proxy-server))
- IP CIDR rules: automatically generated (data sources: [`https://core.telegram.org/resources/cidr.txt`](https://core.telegram.org/resources/cidr.txt), and the DC mapping that Telegram itself hands out to its clients: `help.getConfig` over MTProto plus Telegram's signed backup endpoints)
- ASN rules: automatically generated: the ASNs that announce the IP ranges above, found through [Team Cymru's IP to ASN mapping](https://team-cymru.com/community-services/ip-asn-mapping/) and kept while the AS is registered to Telegram, plus the [known ASNs](Source/ip/telegram_asn.conf) (where the lookup starts, and what is used when it fails)
- MTProto DC mapping: automatically generated, [`Internal/mtproto-dc-config.json`](Internal/mtproto-dc-config.json)

> Using only the IP CIDR rules is recommended. The IP CIDR rule data comes entirely from data published by Telegram itself and does not include the IPs of CDNs and data centers that Telegram has not yet put into use.
> The ASN rules are only suitable as a supplement; using them together with an unofficial MaxMind GeoLite database (such as GeoIP2-CN) will affect matching.

#### Surge as an MTProto proxy server

Surge (iOS 5.21.0+, Mac 6.8.0+) can act as an [MTProto proxy server](https://manual.nssurge.com/features/mtproto.html) for Telegram. The Telegram client connects to a port on Surge and only says which Telegram data center (DC) it needs; Surge picks a current endpoint of that DC from its DC mapping and evaluates the connection with the normal rules. The target of such a connection is normally a Telegram IP address, not a hostname, so domain rules normally cannot match it. According to the manual, `PROTOCOL,MTProto` matches all of this traffic, and IP rules, ASN rules and a Telegram ruleset that contains the mapped addresses are the most reliable choices. The rulesets above are built for that:

- `List/non_ip/telegram.conf` contains `PROTOCOL,MTProto`. The manual says a rule set skips the lines it cannot parse instead of failing as a whole, so a Surge older than the version above should only lose this line
- `List/ip/telegram.conf` always contains every address of the DC mapping published in [`Internal/mtproto-dc-config.json`](Internal/mtproto-dc-config.json): Telegram's published ranges alone do not cover all of them, so the missing ones are added on every build

The rulesets only route the traffic; the listener itself is set up in your profile. A minimal `[MTProto]` section, following the manual's quick start (see the manual for every option):

```ini
[MTProto]
interface = 127.0.0.1
port = 5753
# 32 hexadecimal characters, generate them with: openssl rand -hex 16
secret = [Replace with your secret]
ipv6 = true
```

> `ipv6 = true` makes Surge use only the IPv6 endpoints of Telegram's data centers (the default is IPv4 only). The manual notes that Telegram's IPv4 servers can hang while its IPv6 ones do not, but the device and every outbound proxy on the path must then be able to carry IPv6.

> Surge ships a snapshot of the DC mapping and refreshes it from a default URL that the manual lists, when its stored copy is missing or older than 30 days. It keeps serving the copy it has if a download fails, and the download follows your normal rules, so the host of the URL must be reachable through the policy that matches it.
>
> `dc-config-url` replaces that URL. [`Internal/mtproto-dc-config.json`](Internal/mtproto-dc-config.json) has the format the manual asks for, but it is not the plain `help.getConfig` result that the manual says a custom mapping should publish: it also holds endpoints from Telegram's signed backup configuration and its built-in DC addresses, and it is sorted by DC and address, while Surge takes the first suitable endpoint in file order. Point `dc-config-url` at it only if you want exactly that file.

### Apple CDN

- Automatically generated
- This ruleset contains the domains of Apple, Inc. that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/apple.china.conf)

### Apple Service

- Automatically generated, plus what is collected by hand, which the update keeps
- Domains: the list that the community keeps for Apple ([`apple`](https://github.com/v2fly/domain-list-community/blob/master/data/apple), which includes iCloud, iTunes, Apple Music, Apple TV+, the developer and software update domains, ...), without the entries that it marks as hosted in mainland China (they are in Apple CN below). Apple documents its domains for admins to read, not in a form that a build can read
- Addresses: the ones that Apple announces itself, from AS714 and AS6185, as [RIPEstat](https://stat.ripe.net/docs/02.data-api/announced-prefixes.html) sees them
- Collected by hand: the domains, and the system processes of Apple that connect without a domain, which no list can carry ([`Source/non_ip/apple_services.conf`](Source/non_ip/apple_services.conf)), and the ranges that Apple does not announce itself ([`Source/ip/apple_services.conf`](Source/ip/apple_services.conf))

### Apple CN

- Automatically generated, plus what is collected by hand ([`Source/non_ip/apple_cn.conf`](Source/non_ip/apple_cn.conf)), which the update keeps
- The part of the same list that the community marks as hosted in mainland China (`@cn`): Cloud Guizhou (`icloud.com.cn`), the mainland-China-only edition of Apple Maps, the App Store of mainland China, and more
- The Rule section has it in front of Apple Service: `apple.com` is in Apple Service, and this list has hosts below it (`cn.ls.apple.com`, ...), which Apple Service would take

### Microsoft Teams

- Automatically generated
- Data source: Microsoft's official [Microsoft 365 endpoints web service](https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service) (service area `Skype`, which is Microsoft Teams)
- The Rule section has these before the Microsoft ruleset, otherwise the broader `microsoft.conf` matches first

### Microsoft CDN

- Automatically generated
- This ruleset contains the domains of Microsoft that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/accelerated-domains.china.conf)

### Microsoft

- Automatically generated from the list that the community keeps for Microsoft ([`microsoft`](https://github.com/v2fly/domain-list-community/blob/master/data/microsoft): Office 365, OneDrive, Outlook, Xbox, Bing, Azure, Windows Update, ...), without the entries that it marks as hosted in mainland China, and without GitHub, which has a ruleset of its own above
- Plus what is collected by hand ([`Source/non_ip/microsoft.conf`](Source/non_ip/microsoft.conf), which has keyword rules as well), which the update keeps
- Microsoft publishes the endpoints of Microsoft 365 for admins to read, but they only hold Microsoft 365, and they add the domains of the certificate authorities that it needs, which are not Microsoft's to route. The domains of Teams, which Microsoft does publish, are in the ruleset above

### Large File Downloads (Software Updates, Operating Systems, etc.)

- Automatically generated, plus what is collected by hand, which the update keeps
- Object storage: the domains that the providers register in the [Public Suffix List](https://publicsuffix.org/) for their buckets (Amazon S3, Scaleway, Sakura)
- What the community keeps for the downloads of game platforms (Steam, Epic, Blizzard, Riot, Xbox, PlayStation, Nintendo, ...), for the software updates of Apple devices that Apple documents, and for the registries of containers (Docker Hub, GHCR, Quay, ...). The CDNs of the game platforms inside mainland China are left out, they are for `domestic`
- Collected by hand: the mirrors and package registries that nobody lists in one place (Linux distribution mirrors, universities, ...) and the regional object storage ([`Source/domainset/download.conf`](Source/domainset/download.conf)), the game downloads ([`Source/domainset/game-download.conf`](Source/domainset/game-download.conf), which is a ruleset of its own as well), and the patterns and addresses ([`Source/non_ip/download.conf`](Source/non_ip/download.conf) and [`Source/ip/download.conf`](Source/ip/download.conf))
- These domains may include Microsoft and Apple CDN nodes inside mainland China. You can use them together with the Microsoft CDN and Apple CDN rulesets above and assign the direct policy.
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes

### Intranet Domains and LAN IPs

- Automatically generated, plus what is collected by hand, which the update keeps
- Domains: the list that the community keeps for private networks ([`private`](https://github.com/v2fly/domain-list-community/blob/master/data/private)). It follows the IANA registries of the special-use domain names and of the locally-served DNS zones, and adds the names that routers and local tools answer for. It contains `.local` and the `in-addr.arpa` domains of LAN IPs (i.e., AS112 domains). These domains are generally resolved to LAN IPs, need to be resolved by the internal DNS, and need to be accessed directly.
- IPs: the ranges that the community keeps for addresses that are not on the internet ([`private.txt`](https://github.com/v2fly/geoip/blob/release/text/private.txt)), without `198.18.0.0/15`, which Surge and other tools use for virtual IPs
- Collected by hand: the names of routers and local tools that the Local DNS Mapping module of this project knows ([`Source/non_ip/direct.ts`](Source/non_ip/direct.ts)), and the ranges ([`Source/ip/lan.conf`](Source/ip/lan.conf))

### Common Mainland China Services

- Automatically generated from the list that the community keeps for the domains of mainland China ([`cn`](https://github.com/v2fly/domain-list-community/blob/master/data/cn): its services, the `.cn` domains, and what the lists of foreign companies mark as hosted there), and the domains that the Local DNS Mapping module of this project gives a DNS to ([`Source/non_ip/domestic.ts`](Source/non_ip/domestic.ts))
- Plus what is collected by hand, which the update keeps: the domains ([`Source/non_ip/domestic.conf`](Source/non_ip/domestic.conf), with the CDN domains of domestic services that go direct wherever you are) and a few addresses ([`Source/ip/domestic.conf`](Source/ip/domestic.conf))
- For matching by IP address, use the [chnroute CIDR](#chnroute-cidr) ruleset below

### Services That Should Go Direct

- Automatically generated, plus what is collected by hand, which the update keeps
- PT sites ([`category-pt`](https://github.com/v2fly/domain-list-community/blob/master/data/category-pt)), academic publishers and databases ([`category-scholar-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-scholar-!cn) and [`category-scholar-cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-scholar-cn)) and Xunlei, from the lists of the community, and the hotspot authentication (captive portal) pages and the pages of routers that the Local DNS Mapping module of this project knows ([`Source/non_ip/direct.ts`](Source/non_ip/direct.ts))
- Collected by hand ([`Source/non_ip/direct.conf`](Source/non_ip/direct.conf)): LAN cache services and other domains that no list has, and the process names of proxy tools and download tools, which no list of domains can carry
- Just use DIRECT
- The Rule section has it near the top, in front of the services: it holds exceptions inside them (`captive.apple.com` is inside `apple.com`, Google Scholar inside `google.com`) and the processes that must never be proxied

### Common Services in Other Countries and Regions

- Automatically generated from the lists that the community keeps: [`geolocation-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/geolocation-!cn), the common services from other countries and regions, such as Google, Reddit, Facebook, Twitter, Discord, and GitHub, and [`tld-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/tld-!cn), the ccTLDs and gTLDs of other countries and regions
- Plus what is collected by hand, which the update keeps: the domains that no list has ([`Source/non_ip/global.conf`](Source/non_ip/global.conf)) and the table of Google's domains and the like ([`Source/non_ip/global.ts`](Source/non_ip/global.ts))
- For these rules, just use a proxy

### chnroute CIDR

- Automatically generated
- IPv4 [raw data](https://github.com/misakaio/chnroutes2) is published by Misaka Network, Inc. under the [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) license. The Hong Kong segments announced by China Mobile International (CMI) that Misaka Network, Inc. collected by mistake (`223.118.0.0/15` and `223.120.0.0/15`) are excluded
- IPv6 raw data is published by [gaoyifan/china-operator-ip](https://github.com/gaoyifan/china-operator-ip) under the MIT license

### Files that are published but not in the Rule section

- `List/domainset/game-download.conf`, which is merged into `download.conf` as well, and `List/domainset/icloud_private_relay.conf`
- `List/ip/cdn.conf` and `List/ip/download.conf`, a few addresses, as commented lines in the IP part of the Rule section
- `List/non_ip/gitlab.conf` and `List/non_ip/cloudmounter.conf`
- The `List/non_ip/my_*.conf` lists, which came with SukkaW/Surge
- The stubs of files that were merged into others: `List/non_ip/apple_cdn.conf`, `List/non_ip/global_plus.conf` and `List/domainset/reject_sukka.conf`

## Surge Module List

- URL Redirect: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_url_redirect.sgmodule`
- URL Redirect (Minimum): `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_url_redirect_minimum.sgmodule`
- Surge Network Test Domain: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_surge_network_test_domain.sgmodule`
- MITM Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_mitm_hostnames.sgmodule`
- MITM All Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_mitm_all_hostnames.sgmodule`
- Common Always Real IP Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_common_always_realip.sgmodule`
- Redirect Google CN to Google: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/google_cn_307.sgmodule`

## Terms and License

Except for the `List/ip/china_ip.conf` file, which is shared under the CC BY-SA 2.0 license, this project is open-sourced under the AGPL-3.0 license and comes with no warranty of any kind. That is: **the author and all contributors of this project provide no technical support and are not responsible for any loss you may suffer**, including but not limited to: your software failing to start or work properly, kernel panics, your device failing to boot or work normally, hard drive damage or data loss, atomic bomb explosions, World War III, or a global CK-class reality-restructuring scenario that even the [SCP Foundation](https://scp-wiki.wikidot.com/) cannot stop.

If you are using a commercial public proxy service, be sure to read the service provider's Terms of Service (ToS) carefully first. The ToS of some public proxy providers state that using any third-party rule files is treated as automatically waiving the SLA and technical support.

The ruleset files are served from this repository through `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/`. You can also get the source code of this project and build the ruleset files yourself.

The built files (`List/`, `Modules/`, `Mock/` and `Internal/`) are rebuilt by the [Build workflow](.github/workflows/main.yml) twice a day (05:17 and 17:17 UTC) and on every push to `master`, and the workflow commits the result back to `master`. Edit the sources in `Source/` and `Build/`, not the generated files. Hand-written modules and mocks live next to the generated ones in `Modules/` and `Mock/`. To delete a published file that is no longer generated, add it to `REMOVED_FILES` in [`build-deprecate-files.ts`](Build/build-deprecate-files.ts).

## FAQ

**What is this?**

I don't know either.

**Are there rulesets for Shadowrocket, Quantumult X, Loon, or V2RayNG?**

No. And there **definitely** never will be.

**I used your rulesets and something went wrong. How do I report it?**

No, you can't.

**Can I help maintain the project and fix issues, then?**

If your Pull Request shows up in my GitHub Notification Inbox and I happen to see it, I will review it.

## License

The `List/ip/china_ip.conf` file is licensed under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The rest of the files are licensed under [AGPL-3.0](./LICENSE).

----

**Surge Ruleset** © [kuraudowelle](https://github.com/kuraudowelle), forked from [SukkaW/Surge](https://github.com/SukkaW/Surge) © [Sukka](https://github.com/SukkaW) and its [contributors](https://github.com/SukkaW/Surge/graphs/contributors).
