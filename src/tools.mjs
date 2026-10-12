// The Leonida Lab MCP tools: plain functions over the two files the site publishes
// (/api/data.json and /data/gta6-price-index.json), so the Pages Function, the tests and
// the build gate (scripts/check-mcp.mjs) all run the same code. Every answer carries its
// status, its sources with their dates, the page it lives on and the unofficial notice.
// Nothing here adds a fact: a number is either in the data or derived the way the site derives it.

/** A question the tools can't answer as asked. The server returns it as a tool error that says what would work. */
export class ToolInputError extends Error {}

export const SITE = 'https://leonidalab.com';
const DISCLAIMER =
  'Unofficial: Leonida Lab is a fan resource, not affiliated with Rockstar Games or Take-Two Interactive. It publishes no leaked material.';

const url = (href) => `${SITE}${href}`;
const credit = (page) => `Source: Leonida Lab (${page}). ${DISCLAIMER}`;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');

/** "the UK" and "The Netherlands" are asked for by their name. */
const plain = (s) => String(s ?? '').trim().replace(/^the\s+/i, '');

/* ---------- status and sources ---------- */

// The data says "tba"; an assistant reads "not_announced" without a glossary.
const STATUS = {
  official: { status: 'official', status_label: 'Official' },
  reported: { status: 'reported', status_label: 'Reported, not confirmed' },
  tba: { status: 'not_announced', status_label: 'Not announced' },
};
/** An unknown status reads as not announced: the one direction that can't overstate a fact. */
const statusOf = (s) => STATUS[s] ?? STATUS.tba;

const statusKey = (data) => ({
  official: data.meta.statusMeaning.official,
  reported: data.meta.statusMeaning.reported,
  not_announced: data.meta.statusMeaning.tba,
});

const sourcesOf = (...lists) => {
  const seen = new Set();
  return lists
    .flat(2)
    .filter((s) => s?.url && s?.name)
    .filter((s) => !seen.has(`${s.name}|${s.url}`) && seen.add(`${s.name}|${s.url}`))
    .map((s) => ({ name: s.name, url: s.url, date: s.date ?? null }));
};

// FAQ answers that carry no source list of their own are sourced on the page they summarise.
const FAQ_PAGE = {
  'release-date': '/release-date/',
  'unlock-time': '/countdown/',
  fps: '/performance/',
  gameplay: '/gameplay/',
  price: '/editions/',
  editions: '/editions/',
  protagonists: '/characters/',
  disc: '/editions/',
  preload: '/preload/',
  crossplay: '/online/',
};

/** The sources behind a page of the site, as the data lists them. */
export function pageSources(data, href) {
  const [path, hash] = String(href).split('#');
  const e = data.editions;
  switch (path) {
    case '/faq/': {
      const item = data.faq.find((f) => f.slug === hash);
      if (!item) return [];
      return item.sources?.length ? sourcesOf(item.sources) : FAQ_PAGE[item.slug] ? pageSources(data, FAQ_PAGE[item.slug]) : [];
    }
    case '/release-date/': return sourcesOf(data.release.sources);
    case '/countdown/': return sourcesOf(data.unlockTimes.sources);
    case '/editions/':
      return hash === 'collectors-box'
        ? sourcesOf(e.collectorsBox?.sources)
        : sourcesOf(e.sources, e.preorderBonus?.source, (e.preorderBonus?.extras ?? []).map((x) => x.source));
    case '/online/': return sourcesOf(data.online.sources);
    case '/pc/': return sourcesOf(data.pc.sources);
    case '/performance/': return sourcesOf(data.performance.sources);
    case '/how-long-to-beat/': return sourcesOf(data.storyLength.sources);
    case '/soundtrack/': return sourcesOf(data.soundtrack.sources);
    case '/gameplay/': return hash === 'game-informer' ? sourcesOf(data.gameplay.coverStory?.sources) : sourcesOf(data.gameplay.showcase?.sources);
    case '/characters/': return sourcesOf(data.collectionSources?.characters);
    case '/locations/': return sourcesOf(data.collectionSources?.locations);
    case '/vehicles/': return sourcesOf(data.collectionSources?.vehicles);
    case '/preload/': return sourcesOf((data.keyDates ?? []).filter((k) => k.href === '/preload/').map((k) => k.sources));
    default: return [];
  }
}

const NO_SOURCE_NOTE = 'Nothing has been announced, so there is no source to cite; the page tracks it.';
const withSources = (entry, sources) => ({
  ...entry,
  sources,
  ...(sources.length ? {} : { source_note: entry.status === 'not_announced' ? NO_SOURCE_NOTE : 'The sources are listed on the page.' }),
});

/* ---------- check_claim ---------- */

const PAGES = [
  { key: 'pc', href: '/pc/', name: 'PC page' },
  { key: 'performance', href: '/performance/', name: 'Frame rate page' },
  { key: 'online', href: '/online/', name: 'Online page' },
  { key: 'storyLength', href: '/how-long-to-beat/', name: 'How long to beat page' },
];

/** Every claim the tool can answer with: the tracker's lines, the FAQ, and the facts on the four big-question pages. */
export function claimEntries(data) {
  const checked = data.meta.updated;
  const out = [];
  for (const c of data.confirmed) {
    out.push({
      kind: 0,
      title: `${c.topic} ${c.claim}`,
      body: c.value ?? '',
      entry: withSources(
        { claim: `${c.topic}: ${c.claim}`, ...statusOf(c.status), found_in: "What's confirmed tracker", page: url(c.href), last_checked: checked },
        pageSources(data, c.href),
      ),
    });
  }
  for (const p of PAGES) {
    const d = data[p.key];
    if (!d) continue;
    const sources = sourcesOf(d.sources);
    if (d.answer) {
      out.push({
        kind: 1,
        title: `${d.answer.question} ${d.answer.verdict}`,
        body: [d.headline, d.intro, d.verdict].filter(Boolean).join(' '),
        entry: withSources(
          {
            claim: `${d.answer.question} ${d.answer.verdict}`,
            detail: d.headline,
            ...(d.verdict ? { context: d.verdict } : {}),
            ...statusOf(d.answer.status),
            found_in: p.name,
            page: url(p.href),
            last_checked: d.updated,
          },
          sources,
        ),
      });
    }
    for (const f of d.facts ?? []) {
      out.push({
        kind: 3,
        title: f.claim,
        body: f.detail ?? '',
        entry: withSources({ claim: f.claim, detail: f.detail, ...statusOf(f.status), found_in: p.name, page: url(p.href), last_checked: d.updated }, sources),
      });
    }
  }
  for (const f of data.faq) {
    const href = `/faq/#${f.slug}`;
    out.push({
      kind: 2,
      title: `${f.q} ${f.short ?? ''}`,
      body: f.a,
      entry: withSources(
        { claim: `${f.q} ${f.short ?? ''}`.trim(), detail: f.a, ...statusOf(f.status), found_in: 'FAQ', page: url(href), last_checked: checked },
        pageSources(data, href),
      ),
    });
  }
  return out;
}

// Words that carry no topic in a question about GTA 6.
const STOP = new Set(
  ('an the is are was were be been being it its this that these those there here of for to in on at by with from as and or but not no yes ' +
    'do does did will would can could should may might must has have had having me my we our you your they them their what which who whom why if ' +
    'then than so very just also any some about into over after before again ever still yet really actually true false fact facts confirmed confirm ' +
    'confirms official officially announced announce rumor rumour rumors rumours heard say says said saying claim claims know known get gets got ' +
    'going go come comes coming game games rockstar vi rate until whether run runs running out up down one all each every per am pm how many much').split(' '),
);

// The way people ask, folded into the word the data uses.
const PHRASES = [
  [/\bgrand theft auto\s*(vi|6|six)?\b/g, ' '],
  [/\bgta\s*(vi|6|six)?\b/g, ' '],
  [/(\d+)\s*(?:fps|hz)\b/g, ' $1 fps '],
  [/\bframe[\s-]?rates?\b/g, ' fps '],
  [/\bcom(?:e|es|ing) out\b/g, ' release '],
  [/\b(?:delay(?:s|ed)?|postponed|pushed back)\b/g, ' release date '],
  [/\bmain characters?\b/g, ' protagonist '],
  [/\bstory mode\b/g, ' singleplayer '],
  [/\b(?:pc|system) (?:requirements|specs)\b/g, ' pc system requirements '],
  [/\bhow much\b/g, ' price '],
  [/\bhow long\b/g, ' length '],
  [/\bhow big\b/g, ' size '],
  [/\bwhen\b/g, ' date '],
  [/\bcross[\s-]?(?:play|platform)\b/g, ' crossplay '],
  [/\bpre[\s-]?load(?:s|ed|ing)?\b/g, ' preload '],
  [/\bpre[\s-]?order(?:s|ed|ing)?\b/g, ' preorder '],
  [/\bsingle[\s-]?player\b/g, ' singleplayer '],
  [/\bmulti[\s-]?player\b/g, ' online '],
  [/\bco[\s-]?op\b/g, ' online '],
  [/\bearly[\s-]access\b/g, ' earlyaccess '],
  [/\b(?:ps5|playstation\s?5)\s?pro\b/g, ' ps5pro '],
  [/\bplaystation\s?5\b/g, ' ps5 '],
  [/\bxbox series\s?[xs](?:\s?[|/]\s?s)?\b/g, ' xbox '],
  [/\bmicro[\s-]?transactions?\b/g, ' microtransaction '],
  [/\bshark cards?\b/g, ' microtransaction '],
  [/\bin[\s-]game purchases?\b/g, ' microtransaction '],
];

const SYNONYMS = [
  ['release', 'launch', 'launches', 'launched', 'launching', 'released', 'releasing'],
  ['price', 'cost', 'costs', 'priced', 'pricing', 'expensive', 'cheap', 'dollars', 'usd'],
  ['fps', 'frames', 'frame'],
  ['pc', 'computer', 'steam', 'windows'],
  ['disc', 'disk', 'disks', 'physical', 'boxed'],
  ['length', 'long', 'hours', 'hour', 'playtime', 'beat'],
  ['size', 'big', 'bigger', 'large', 'larger', 'gb', 'gigabytes'],
  ['rating', 'rated', 'esrb', 'pegi', 'age'],
  ['soundtrack', 'music', 'songs', 'song', 'album'],
  ['radio', 'station', 'stations'],
  ['microtransaction', 'mtx', 'spending', 'monetization', 'monetisation'],
  ['singleplayer', 'solo', 'offline'],
  ['protagonist', 'hero', 'heroes'],
  ['controller', 'dualsense'],
  ['unlock', 'unlocked', 'midnight'],
  ['language', 'subtitles', 'dubbed'],
  ['console', 'platform', 'platforms'],
];
const CANON = new Map(SYNONYMS.flatMap(([to, ...words]) => words.map((w) => [w, to])));

const stem = (w) => {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(w)) return w;
  return w.endsWith('s') ? w.slice(0, -1) : w;
};

/** The topic words of a sentence, the same way for a question and for the data it is matched against. */
export function topicWords(text) {
  let s = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  const words = s.match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? [];
  return words.filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w))).map((w) => CANON.get(w) ?? stem(w));
}

const indexes = new WeakMap();
function claimIndex(data) {
  let ix = indexes.get(data);
  if (!ix) {
    const docs = claimEntries(data).map((d) => {
      const title = new Set(topicWords(d.title));
      return { ...d, title, all: new Set([...title, ...topicWords(d.body)]) };
    });
    const df = new Map();
    for (const d of docs) for (const t of d.all) df.set(t, (df.get(t) ?? 0) + 1);
    // a word few claims use says more about which claim is meant
    const weight = (t) => Math.log((docs.length + 1) / ((df.get(t) ?? 0) + 1)) + 1;
    ix = { docs, weight };
    indexes.set(data, ix);
  }
  return ix;
}

const OTHER_TOOLS = 'release_info has dates, platforms and unlock times; price_in_country has prices by country; compare_editions has the editions; recent_changes has the news.';

export function checkClaim({ data }, { query, limit = 5 } = {}) {
  const asked = String(query ?? '').trim();
  const words = [...new Set(topicWords(asked))];
  if (!words.length) {
    throw new ToolInputError('Name the claim to check, for example "PC version", "60 FPS", "is there a disc" or "online at launch".');
  }
  const { docs, weight } = claimIndex(data);
  const total = words.reduce((n, t) => n + weight(t), 0);
  const scored = docs
    .map((d) => {
      const hit = words.filter((t) => d.all.has(t));
      const cover = hit.reduce((n, t) => n + weight(t), 0) / total;
      const inTitle = hit.filter((t) => d.title.has(t)).reduce((n, t) => n + weight(t), 0) / total;
      return { d, cover, inTitle, rank: cover + inTitle };
    })
    .sort((a, b) => b.rank - a.rank || a.d.kind - b.d.kind);
  // most of the question has to be in the claim, or a good part of it in the claim's own line
  const ranked = scored.filter((m) => m.cover >= 0.5 || m.inTitle >= 0.4);
  // a claim that only brushes the question is noise next to one that answers it, and the FAQ
  // repeats some page verdicts word for word
  const seen = new Set();
  const fresh = (m) => {
    const key = `${m.d.entry.claim}|${m.d.entry.status}`;
    return !seen.has(key) && Boolean(seen.add(key));
  };
  const max = Math.min(Math.max(1, limit), 10);
  const picked = [];
  for (const m of ranked) {
    if (picked.length >= max || m.rank < ranked[0].rank * 0.55) break;
    if (fresh(m)) picked.push(m);
  }
  // A question can hold two claims ("PC release date November 19"): the true date must not answer
  // for the PC version asked in the same breath. Every word of the question that some claim is
  // about brings its best claim along, and a word no claim mentions is named as such.
  if (picked.length) {
    for (const t of words) {
      if (picked.some((m) => m.d.title.has(t))) continue;
      const best = scored.find((m) => m.d.title.has(t) && fresh(m));
      if (best) picked.push(best);
    }
  }
  const matches = picked.map((m) => m.d.entry);
  const unmatched = words.filter((t) => !picked.some((m) => m.d.all.has(t)));
  const page = url('/confirmed/');
  if (!matches.length) {
    return {
      query: asked,
      found: false,
      message:
        `Nothing on the record at Leonida Lab matches "${asked}". That does not make it true or false: Leonida Lab tracks what Rockstar Games, ` +
        'Take-Two, Sony or Microsoft said on the record and what credible press reported, and never leaks, so a detail that only ever leaked is not here. ' +
        'Do not present it as known.',
      covered_topics: [...new Set(data.confirmed.map((c) => c.topic))],
      other_tools: OTHER_TOOLS,
      page,
      credit: credit(page),
    };
  }
  return {
    query: asked,
    found: true,
    matches,
    ...(unmatched.length
      ? {
          unmatched_words: unmatched,
          unmatched_note: 'None of the matches mentions these words, so they say nothing about them. Do not read a match as confirming them.',
        }
      : {}),
    how_to_quote:
      'Each match answers only its own claim: check that it is about what was asked. Say the status with the fact. "Reported" needs its ' +
      'attribution (who said it), and "not announced" must not be presented as known.',
    status_key: statusKey(data),
    other_tools: OTHER_TOOLS,
    all_claims: page,
    credit: credit(page),
  };
}

/* ---------- release_info ---------- */

/** Offset of `timeZone` from UTC, in ms, at the given instant (the site's src/lib/tz.ts). */
function offsetMs(timeZone, at) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime();
}

/** The UTC instant at which `dateISO` begins in `timeZone`, daylight saving included. */
export function localMidnightUTC(timeZone, dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0);
  let ts = wall - offsetMs(timeZone, new Date(wall));
  const refined = wall - offsetMs(timeZone, new Date(ts));
  if (refined !== ts) ts = refined;
  return new Date(ts);
}

// Names people use that the index spells differently, by its country code.
const COUNTRY_ALIASES = {
  US: ['usa', 'unitedstatesofamerica', 'america', 'states'],
  GB: ['uk', 'britain', 'greatbritain', 'england', 'scotland', 'wales', 'northernireland'],
  KR: ['korea', 'republicofkorea'],
  AE: ['uae', 'emirates', 'dubai'],
  NL: ['holland'],
  CZ: ['czechrepublic'],
  TR: ['turkiye'],
  BR: ['brasil'],
  DE: ['deutschland'],
  ES: ['espana'],
  IT: ['italia'],
  JP: ['nippon'],
  SA: ['ksa'],
  ZA: ['rsa'],
};

const US_KEYS = ['us', 'unitedstates', ...COUNTRY_ALIASES.US];

// Countries that keep the same clock as a region in the site's table, by that region's time zone.
// The table's own region names and cities are matched from the data; these only add the neighbours.
export const ZONE_PLACES = {
  'Pacific/Auckland': ['nz', 'wellington'],
  'Australia/Sydney': ['canberra'],
  'Asia/Tokyo': ['southkorea', 'osaka'],
  'Asia/Kolkata': ['bangalore', 'bengaluru'],
  'Asia/Dubai': ['unitedarabemirates', 'emirates', 'abudhabi'],
  'Europe/Vilnius': ['lithuania', 'finland', 'ukraine', 'latvia', 'estonia', 'romania', 'bulgaria', 'greece'],
  'Europe/Berlin': [
    'germany', 'france', 'spain', 'italy', 'netherlands', 'holland', 'belgium', 'austria', 'switzerland', 'poland', 'czechia',
    'czechrepublic', 'sweden', 'norway', 'denmark', 'hungary', 'croatia', 'slovakia', 'slovenia', 'luxembourg', 'rome', 'amsterdam',
    'warsaw', 'vienna', 'stockholm',
  ],
  'Europe/London': ['unitedkingdom', ...COUNTRY_ALIASES.GB],
  'America/Sao_Paulo': ['brasil', 'riodejaneiro'],
  'America/New_York': ['eastcoast', 'useastcoast', 'easterntime', 'nyc'],
  'America/Chicago': ['centraltime'],
  'America/Mexico_City': ['cdmx'],
  'America/Los_Angeles': ['westcoast', 'uswestcoast', 'pacifictime', 'california'],
};

function regionKeys(r) {
  const parts = [r.region, ...r.region.split(/[&,()]/), ...String(r.cities ?? '').split(',')];
  // "Australia (East)" names Australia, not the word "east"
  return [...parts.map(norm), ...(ZONE_PLACES[r.zone] ?? [])].filter((k) => k && !['east', 'west', 'central', 'north', 'south'].includes(k));
}

const unlockRow = (r) => ({
  region: r.region,
  cities: r.cities,
  time_zone: r.zone,
  local_time: r.localUnlock,
  utc: r.unlockUTC.replace(/\.\d{3}Z$/, 'Z'),
});

/** The rows of the unlock table a place name points at; empty when the table doesn't cover it. */
export function unlockFor(data, place) {
  const regions = data.unlockTimes.regions;
  const key = norm(plain(place));
  if (US_KEYS.includes(key)) return regions.filter((r) => /^US\b/.test(r.region)).map(unlockRow);
  const hit = regions.filter((r) => regionKeys(r).includes(key));
  if (hit.length) return hit.map(unlockRow);
  // a time zone the table lists ("America/New_York") is that row
  const zone = String(place).trim();
  const listed = regions.find((r) => r.zone === zone);
  if (listed) return [unlockRow(listed)];
  // any other IANA time zone ("Europe/Rome") is computed the way the site computes its own table,
  // which only holds while the rule is midnight local time
  if (data.release.unlock.mode === 'local-midnight' && /^[A-Za-z_]+(?:\/[A-Za-z_+-]+)+$/.test(zone)) {
    try {
      const date = data.unlockTimes.localDate ?? data.release.unlock.localDate;
      const utc = localMidnightUTC(zone, date).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return [{ region: zone, cities: null, time_zone: zone, local_time: `${date}T00:00:00`, utc, computed_from_time_zone: true }];
    } catch {
      return []; // not a time zone the platform knows
    }
  }
  return [];
}

export function releaseInfo({ data }, { place } = {}) {
  const rel = data.release;
  const unlock = data.unlockTimes;
  const asked = place == null ? '' : String(place).trim();
  const rows = asked ? unlockFor(data, asked) : unlock.regions.map(unlockRow);
  const page = url('/release-date/');
  // the unlock hour's status and source are read from the data, so the day Rockstar publishes
  // the hours the advice below changes with them
  const unlockStatus = statusOf(unlock.status ?? rel.unlock.status);
  const unlockSource = sourcesOf(unlock.sources)[0]?.name;
  return {
    game: 'Grand Theft Auto VI',
    release_date: { date: rel.dateISO, display: rel.displayDate, ...statusOf('official'), sources: sourcesOf(rel.sources), page },
    platforms: rel.platforms.map((p) => ({ name: p.name, ...statusOf(p.status), ...(p.note ? { note: p.note } : {}) })),
    unlock_time: {
      ...unlockStatus,
      rule: rel.unlock.summary,
      caveat: rel.unlock.caveat,
      first_unlock: rel.unlock.firstUnlockNote,
      ...(asked ? { place: asked } : {}),
      ...(asked && !rows.length
        ? {
            place_not_in_table:
              `The unlock table has no row for "${asked}". The rule above applies to every region.` +
              (rel.unlock.mode === 'local-midnight' ? ' Pass an IANA time zone such as "Europe/Rome" for the exact UTC instant.' : ''),
            regions_in_table: unlock.regions.map((r) => r.region),
          }
        : { regions: rows }),
      note: unlock.note,
      sources: sourcesOf(unlock.sources),
      page: url('/countdown/'),
      last_checked: unlock.updated,
    },
    key_dates: (data.keyDates ?? []).map((k) => ({
      date: k.date,
      title: k.title,
      detail: k.detail,
      ...statusOf(k.status),
      sources: sourcesOf(k.sources),
      page: url(k.href),
    })),
    how_to_quote:
      'The release date is official, and each platform carries its own status. ' +
      (unlockStatus.status === 'official'
        ? 'The unlock time is official.'
        : `The unlock time is ${unlockStatus.status_label.toLowerCase()}: say so${unlockSource ? `, and name the source (${unlockSource})` : ''}.`),
    status_key: statusKey(data),
    credit: credit(page),
  };
}

/* ---------- price_in_country ---------- */

// the tool's schema lets only these two through
const PLATFORMS = { playstation: 'PlayStation', xbox: 'Xbox' };

/** True when one word is the other with a single letter dropped. */
function oneLetterApart(a, b) {
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (long.length - short.length !== 1) return false;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

/** The country code a name, code or common alias stands for, from the markets the index has. */
export function resolveCountry(prices, input) {
  const key = norm(plain(input));
  if (!key) throw new ToolInputError('Name a country, for example "Brazil", "UK" or "JP".');
  const markets = new Map(prices.rows.map((r) => [r.country_code, r.country]));
  const keys = [...markets].map(([code, name]) => ({ code, name, keys: [norm(name), ...(COUNTRY_ALIASES[code] ?? [])] }));
  const exact = keys.find((c) => c.keys.includes(key)) ?? (key.length === 2 ? keys.find((c) => c.code.toLowerCase() === key) : null);
  if (exact) return exact.code;
  // one dropped or doubled letter ("Brazl") is an answer; a swapped letter is not, because it can be
  // another country ("Chine" is China, not Chile). Anything else is a miss that names the markets.
  const near = keys.filter((c) => key.length >= 5 && c.keys.some((k) => oneLetterApart(key, k)));
  if (near.length === 1) return near[0].code;
  const unpriced = (prices.listed_without_price ?? []).find((x) => norm(x.name) === key || x.iso2?.toLowerCase() === key);
  if (unpriced) {
    throw new ToolInputError(`${unpriced.name} has a ${unpriced.store} listing for GTA VI but no price on it yet, so the price index has no figure for it.`);
  }
  throw new ToolInputError(
    `The price index has no store listing for "${String(input).trim()}". It covers ${markets.size} markets: ${[...markets.values()].sort().join(', ')}.`,
  );
}

function resolvePlatform(input) {
  const platform = PLATFORMS[norm(input)];
  if (!platform) throw new ToolInputError(`"${String(input).trim()}" is not a store in the index. Use "playstation" or "xbox", or leave it out for both.`);
  return platform;
}

const BASIS = {
  final: 'What you pay at checkout, tax included.',
  before_tax: 'Listed before tax. Tax is added at checkout at a rate that varies by place, so you pay more than this.',
  unconfirmed: 'The listed price. Whether tax is added at checkout could not be confirmed, so you may pay more than this.',
};

/**
 * What the buyer pays, as far as it is confirmed (the site's rule, src/lib/priceIndex.ts): the listed
 * price where tax is inside it, the after-tax price where one national rate is added on top, else the
 * listed price, marked. The dataset carries the Standard after-tax figures; Ultimate applies the same rate.
 */
function paid(prices, r, edition) {
  const std = edition === 'standard';
  const list = std ? r.standard_price : r.ultimate_price;
  const listUsd = std ? r.standard_usd : r.ultimate_usd;
  const rate = r.tax_in_listed_price === 'excluded' ? r.tax_rate_pct : null;
  const k = rate == null ? 1 : 1 + rate / 100;
  const local = std && rate != null && r.standard_price_final != null ? r.standard_price_final : r2(list * k);
  const usd = listUsd == null ? null : std && rate != null && r.standard_usd_final != null ? r.standard_usd_final : r2(listUsd * k);
  const us = prices.rows.find((x) => x.country_code === 'US' && x.platform === 'PlayStation');
  const usBase = us ? (std ? us.standard_usd : us.ultimate_usd) : null;
  return {
    local,
    usd,
    list,
    rate,
    basis: r.tax_in_listed_price === 'included' || rate != null ? 'final' : r.tax_in_listed_price === 'excluded' ? 'before_tax' : 'unconfirmed',
    vsUs: usd == null || usBase == null ? null : r1((usd / usBase - 1) * 100),
  };
}

function editionPrice(prices, r, edition) {
  const p = paid(prices, r, edition);
  return {
    you_pay: p.local,
    currency: r.currency,
    you_pay_usd: p.usd,
    basis: p.basis,
    ...(p.rate != null ? { listed_price: p.list, tax_added_at_checkout_pct: p.rate } : {}),
    // only a final price is set against the US: a price before tax would look cheaper than it is
    ...(p.vsUs == null || p.basis !== 'final' || r.country_code === 'US' ? {} : { vs_us_list_price_pct: p.vsUs }),
  };
}

function listingOf(prices, r) {
  const standard = editionPrice(prices, r, 'standard');
  const rate = standard.tax_added_at_checkout_pct;
  return {
    store: `${r.platform} Store`,
    standard,
    ultimate: editionPrice(prices, r, 'ultimate'),
    basis_meaning: BASIS[standard.basis],
    // a note that quotes an older price would contradict the figures: where a rate is applied, state the rate
    tax: rate != null ? `${rate}% tax is added at checkout; the figures here include it.` : r.tax_note,
    tax_evidence: r.tax_evidence ?? null,
    ...(r.currency === 'USD' ? {} : { exchange_rate: { usd_per_unit: r.fx_usd_per_unit, source: r.fx_source, date: r.fx_date } }),
    ...(r.on_sale ? { on_sale: true } : {}),
    ...statusOf('official'),
    source: { name: `${r.platform} Store listing, ${r.country}`, url: r.source_url, date: prices.meta.version },
  };
}

export function priceInCountry({ prices }, { country, platform } = {}) {
  const code = resolveCountry(prices, country);
  const wanted = platform ? resolvePlatform(platform) : null;
  const all = prices.rows.filter((r) => r.country_code === code);
  const rows = all.filter((r) => !wanted || r.platform === wanted);
  const name = all[0].country;
  if (!rows.length) {
    throw new ToolInputError(`The price index has no ${wanted} Store listing for ${name}. It has: ${all.map((r) => `${r.platform} Store`).join(', ')}.`);
  }
  const page = url('/data/price-index/');
  const us = prices.rows.find((r) => r.country_code === 'US' && r.platform === 'PlayStation');
  const listings = rows.map((r) => listingOf(prices, r));

  // two stores are only compared on what the buyer pays; a price before tax may not stay cheaper at the till
  let stores = null;
  if (listings.length === 2) {
    const [a, b] = listings.map((l) => ({ store: l.store, ...l.standard }));
    if (a.basis !== 'final' || b.basis !== 'final') {
      stores = 'Not comparable: at least one store lists its price before tax or with tax unconfirmed, so the lower listed price may not be the lower price at checkout.';
    } else if (a.you_pay_usd != null && b.you_pay_usd != null) {
      const [low, high] = a.you_pay_usd <= b.you_pay_usd ? [a, b] : [b, a];
      stores = low.you_pay_usd === high.you_pay_usd
        ? 'Both stores charge the same for the Standard Edition at checkout.'
        : `The ${low.store} is cheaper at checkout for the Standard Edition, by US$${r2(high.you_pay_usd - low.you_pay_usd).toFixed(2)}.`;
    }
  }

  return {
    country: name,
    country_code: code,
    listings,
    ...(stores ? { store_comparison: stores } : {}),
    us_reference: us
      ? `US list price: $${us.standard_usd.toFixed(2)} Standard, $${us.ultimate_usd.toFixed(2)} Ultimate, before sales tax (which varies by state).`
      : null,
    how_to_quote:
      'Quote "you_pay" with its basis. Call a price cheaper only when the basis is "final"; a price listed before tax, or with tax unconfirmed, can cost more at checkout. ' +
      'US dollar figures are conversions at the official exchange rate given with each listing, not what a store charges.',
    ...(rows.some((r) => r.high_inflation) ? { inflation_note: 'Inflation in this market is above 25% a year, so the price and its dollar value move quickly.' } : {}),
    prices_as_of: prices.meta.version,
    page,
    license: prices.meta.license,
    credit: credit(page),
  };
}

/* ---------- compare_editions ---------- */

export function compareEditions({ data }) {
  const e = data.editions;
  const page = url('/editions/');
  const item = (x) => ({ item: x.item, ...statusOf(x.status) });
  const [std, ult] = ['standard', 'ultimate'].map((slug) => e.editions.find((x) => x.slug === slug));
  const bonus = e.preorderBonus;
  const box = e.collectorsBox;
  return {
    editions: e.editions.map((x) => ({
      name: x.name,
      price_usd: x.priceUSD,
      price: statusOf(x.priceStatus),
      summary: x.summary,
      includes: (x.includes ?? []).map(item),
      ...(x.upgradeNote ? { upgrade: { text: x.upgradeNote.text, ...statusOf(x.upgradeNote.status) } } : {}),
    })),
    ...(std && ult ? { price_difference_usd: r2(ult.priceUSD - std.priceUSD) } : {}),
    ultimate_bonuses: e.ultimateContents
      ? {
          note: e.ultimateContents.note,
          items: e.ultimateContents.items.map((x) => ({ name: x.name, category: x.category, summary: x.summary, ...statusOf(x.status) })),
          source: sourcesOf(e.ultimateContents.source)[0] ?? null,
          last_checked: e.ultimateContents.checked,
        }
      : null,
    preorder_bonus: bonus
      ? {
          name: bonus.name,
          ...statusOf(bonus.status),
          summary: bonus.summary,
          items: bonus.items ?? [],
          source: sourcesOf(bonus.source)[0] ?? null,
          platform_extras: (bonus.extras ?? []).map((x) => ({ platform: x.platform, item: x.item, ...statusOf(x.status), source: sourcesOf(x.source)[0] ?? null })),
        }
      : null,
    physical_copies: e.format ? { headline: e.format.headline, facts: (e.format.facts ?? []).map(item) } : null,
    collectors_box: box
      ? {
          name: box.name,
          what_it_is: box.kind,
          ...statusOf(box.status),
          summary: box.summary,
          prices: (box.prices ?? []).map((p) => ({ where: p.label, price: p.value, ...statusOf(p.status) })),
          facts: (box.facts ?? []).map(item),
          sources: sourcesOf(box.sources),
          page: url('/editions/#collectors-box'),
        }
      : null,
    prices_elsewhere: 'These are the US list prices. For what a buyer pays in another country, call price_in_country.',
    sources: sourcesOf(e.sources),
    page,
    last_checked: e.updated,
    status_key: statusKey(data),
    credit: credit(page),
  };
}

/* ---------- recent_changes ---------- */

const CHANGE_TYPE = {
  official: STATUS.official,
  reported: STATUS.reported,
  site: { status: 'site_update', status_label: 'A change to Leonida Lab itself, not a game fact' },
};

export function recentChanges({ data }, { since, limit = 10 } = {}) {
  if (since != null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new ToolInputError('since must be a date like 2026-10-01.');
  const page = url('/changelog/');
  const all = [...data.changelog].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const inRange = all.filter((x) => !since || x.date >= since);
  const changes = inRange.slice(0, Math.min(Math.max(1, limit), 30)).map((x) => {
    const source = sourcesOf(x.source)[0] ?? null;
    const type = CHANGE_TYPE[x.type] ?? CHANGE_TYPE.site;
    return {
      date: x.date,
      title: x.title,
      summary: x.summary,
      ...type,
      source,
      // older entries carry no link of their own
      ...(source || type === CHANGE_TYPE.site ? {} : { source_note: 'This entry has no source link; the changelog and the pages it led to carry the sources.' }),
    };
  });
  return {
    count: changes.length,
    ...(since ? { since } : {}),
    ...(inRange.length > changes.length ? { more: `${inRange.length - changes.length} older entries; raise limit or see the changelog.` } : {}),
    changes,
    latest_entry: all[0]?.date ?? null,
    page,
    status_key: statusKey(data),
    credit: credit(page),
  };
}
