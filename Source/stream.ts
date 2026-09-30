/**
 * A list of the community (https://github.com/v2fly/domain-list-community/tree/master/data), and what is taken of it.
 * The options are the ones of the build of the lists: `must` takes the entries that have an attribute (`@!cn`
 * marks what is meant for abroad), `ban` leaves them out, `skip` leaves an included list out, and `select`
 * keeps the hostnames that it says yes to.
 */
export interface StreamList {
  list: string,
  must?: string[],
  ban?: string[],
  skip?: string[],
  select?: (hostname: string) => boolean
}

/**
 * The services are not written down here with their domains: the domains come from the lists of the community,
 * on every build, and follow them. What stays here is which list is which service, and where the services are
 * sorted into regions, which is for the ones whose catalog depends on where the client is.
 *
 * A service with no list of the community that is about it, and only it, is not here. The lists of a whole
 * company (Fox, Naver, CBS, NBCUniversal, TVB) would send all of the company to the policy of a streaming service.
 */
export interface StreamService {
  name: string,
  /** The lists that hold the domains of the service: a name alone is the whole list */
  lists: Array<string | StreamList>,
  /** The autonomous systems that announce the addresses of the service, which is what its owner routes to itself */
  asns?: number[]
}

const ABEMA_TV: StreamService = { name: 'AbemaTV', lists: ['abema'] };

const AMAZON_PRIME_VIDEO: StreamService = {
  name: 'Amazon Prime Video',
  // the list of Amazon has all of Amazon (AWS, shopping, ...), this one is the video
  lists: [{ list: 'primevideo', ban: ['cn'] }]
};

const APPLE_TV: StreamService = { name: 'Apple TV', lists: ['apple-tvplus'] };

const BAHAMUT: StreamService = { name: 'Bahamut', lists: ['bahamut'] };

const BBC: StreamService = { name: 'BBC', lists: ['bbc'] };

const BILIBILI_INTL: StreamService = {
  name: 'Bilibili International',
  // the rest of the list is the Bilibili of mainland China
  lists: [{ list: 'bilibili', must: ['!cn'] }]
};

const DAZN: StreamService = { name: 'DAZN', lists: ['dazn'] };

const DEEZER: StreamService = { name: 'Deezer', lists: ['deezer'] };

const DISNEY_PLUS: StreamService = {
  name: 'Disney+',
  // with what Disney groups with it: Hulu, ESPN, Hotstar, Star+, ...
  lists: [{ list: 'disney', ban: ['cn'] }]
};

const DISCOVERY_PLUS: StreamService = { name: 'Discovery+', lists: ['discoveryplus'] };

const DMM: StreamService = { name: 'DMM', lists: ['dmm'] };

const HBO: StreamService = { name: 'HBO Go / HBO Now / HBO Max / Max / HBO Asia', lists: ['hbo'] };

const HULU: StreamService = { name: 'Hulu', lists: ['hulu'] };

const IQIYI_GLOBAL: StreamService = {
  name: 'iQiyi Global',
  // the rest of the list is the iQiyi of mainland China
  lists: [{ list: 'iqiyi', must: ['!cn'] }]
};

const KKBOX: StreamService = { name: 'KKBOX', lists: ['kkbox'] };

const KKTV: StreamService = { name: 'KKTV', lists: ['kktv'] };

const LINE_TV: StreamService = {
  name: 'Line TV',
  // the list is LINE, the messenger, which has no part in this
  lists: [{ list: 'line', select: hostname => hostname.includes('linetv') }]
};

const LITV: StreamService = { name: 'LiTV', lists: ['litv'] };

const MYTV_SUPER: StreamService = { name: 'myTV Super', lists: ['mytvsuper'] };

const NETFLIX: StreamService = {
  name: 'Netflix',
  lists: ['netflix'],
  // Netflix Streaming Services
  asns: [2906]
};

const NICONICO: StreamService = { name: 'niconico', lists: ['niconico'] };

const NHK: StreamService = { name: 'NHK', lists: ['nhk'] };

const PBS: StreamService = { name: 'PBS', lists: ['pbs'] };

const PLUTO_TV: StreamService = { name: 'Pluto TV', lists: ['plutotv'] };

const PORNHUB: StreamService = { name: 'Pornhub', lists: ['pornhub'] };

const SHOWTIME: StreamService = { name: 'SHOWTIME', lists: ['showtimeanytime'] };

const SOUNDCLOUD: StreamService = { name: 'SoundCloud', lists: ['soundcloud'] };

const SPOTIFY: StreamService = { name: 'Spotify', lists: ['spotify'] };

const TIDAL: StreamService = { name: 'TIDAL', lists: ['tidal'] };

const TUBI_TV: StreamService = { name: 'Tubi TV', lists: ['tubi'] };

const TVER: StreamService = { name: 'TVer', lists: ['tver'] };

const TWITCH: StreamService = { name: 'Twitch', lists: ['twitch'] };

const VIU: StreamService = { name: 'Viu / ViuTV', lists: ['viu'] };

export const ALL: StreamService[] = [
  ABEMA_TV, AMAZON_PRIME_VIDEO, APPLE_TV,
  BAHAMUT, BBC, BILIBILI_INTL,
  DAZN, DEEZER, DISNEY_PLUS, DISCOVERY_PLUS, DMM,
  HBO, HULU,
  IQIYI_GLOBAL,
  KKBOX, KKTV,
  LINE_TV, LITV,
  MYTV_SUPER,
  NETFLIX, NICONICO, NHK,
  PBS, PLUTO_TV, PORNHUB,
  SHOWTIME, SOUNDCLOUD, SPOTIFY,
  TIDAL, TUBI_TV, TVER, TWITCH,
  VIU
];

export const NORTH_AMERICA: StreamService[] = [
  HULU,
  PLUTO_TV,
  DISCOVERY_PLUS,
  TUBI_TV,
  SHOWTIME
];

export const EU: StreamService[] = [
  BBC
];

export const HK: StreamService[] = [
  VIU,
  MYTV_SUPER,
  BILIBILI_INTL
];

export const TW: StreamService[] = [
  KKTV,
  LITV,
  LINE_TV,
  BAHAMUT
];

export const JP: StreamService[] = [
  DMM,
  ABEMA_TV,
  NICONICO,
  NHK,
  TVER
];

/** Naver TV, which was the only one, is part of the list of Naver as a whole, which is not a streaming service */
export const KR: StreamService[] = [];
