// The Leonida Lab database tools: search_database and get_entry, over the rows of the released game
// that /api/data.json publishes (answers, vehicles, weapons, animals, locks, radio stations, cheats, controls, money, trophies and the 100% list). Plain functions,
// like tools.mjs: the Pages Function, the tests and the build gate (scripts/check-mcp.mjs) run the same code.
//
// Self-contained on purpose: it imports only from tools.mjs, because `npm run mcp:mirror` copies the MCP
// modules to the public repo, which has no src/.
//
// What an entry says is exactly what its page states, from an explicit allowlist of fields per kind: a new
// field in the data stays out until it is added here. Never `sources`, never a date from the data, never an
// outlet's name. A row marked spoiler returns its question (when the open data has one), the flag and its page,
// and nothing else; a row with no question in the open data has no name to find it by and is never a hit. A spoiler lock
// is that second sort whatever it arrives with: no name, never indexed, never a hit, its entry the flag and the list's page.
import { ToolInputError, credit, url } from './tools.mjs';

/* ---------- status ---------- */

/** The data's own three words, in the labels an assistant reads (the five older tools keep official / reported / not_announced). */
export const STATUS_LABEL = { official: 'Confirmed', checked: 'Confirmed in the released game', reported: 'Not confirmed yet' };
/** An unknown status reads as not confirmed: the one direction that can't overstate a fact. */
const dbStatus = (s) => (Object.hasOwn(STATUS_LABEL, s) ? s : 'reported');
const statusFields = (s) => ({ status: dbStatus(s), status_label: STATUS_LABEL[dbStatus(s)] });

const STATUS_ORDER = ['official', 'checked', 'reported'];
const STATUS_KEY = {
  official: 'Confirmed: Rockstar Games, Take-Two or a platform holder has said it on the record.',
  checked: 'Confirmed in the released game: checked in the released game by more than one independent guide, or tested by Leonida Lab. Not an official statement.',
  reported: 'Not confirmed yet: one guide to the released game has it and no second one has confirmed it. Do not present it as settled.',
};

const SPOILER_LINE = 'A story spoiler: its answer is on the page, behind a fold the reader opens.';
const SPOILER_NOTE =
  'This entry is a story spoiler: Leonida Lab keeps its text behind a fold on the page, and it is not given here. Say that a spoiler exists and link the page; do not guess at it.';

/* ---------- kinds ---------- */

// The one place a kind is defined (the Contracts in docs/plans/2026-11-25-mcp-database.md). Each slice registers its kinds here.
// rows():   live rows only, spoiler rows included (they are flagged, never dropped)
// name():   what a row is called; '' when the open data has no name for it, and a row with no name is never a hit
// words():  what search matches, { title, body, minor? }; a spoiler row is matched on its name alone, whatever words() says. `minor` is a list of short
//           texts a question names a row by only by chance (a radio station's songs, each its title and artist): a word that only `minor` holds counts at half
//           weight, so a station never outranks the control or the cheat that is about the word, unless two words of the question are in one of its texts
//           (then it is that song or that artist: "Depeche Mode"). Optional: a kind without it has none.
// entry():  the allowlist for get_entry
// page():   the site path of the row's page, or of the list that holds it
const isNameless = (row) => !row.q;
/** the page that holds the story answers the open data gives no question */
const ENDINGS_HUB = '/endings/';
/** The data is checked before it ships; a malformed row is still skipped here, never a raw error in an assistant's reply. */
const list = (v) => (Array.isArray(v) ? v : []);
const liveRows = (v) => list(v).filter((r) => r && typeof r === 'object');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => (typeof v === 'string' && v.trim() ? v : undefined);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/* ---------- vehicles and weapons: what their pages state ---------- */

// The `find` of a vehicle or weapon: a line the page shows when it is confirmed (checked or official), and for a pending one nothing but a note
// that is the data's own and never leaves it. This is src/lib/find.mjs:31, copied (this file cannot import from src/); scripts/tests/mcp.test.mjs pins it.
export const findShown = (find) => Boolean(find && find.status !== 'pending' && find.line);
const NOT_CONFIRMED_HOW = 'Not confirmed yet: Leonida Lab has no confirmed way to get this one. Do not suggest where or how.';
const howToGet = (find) => (findShown(find) ? String(find.line) : NOT_CONFIRMED_HOW);

// The words of the pages (src/i18n/copy/en.json, components.vehicle / weapon / find), copied for the same reason; the tests pin them.
// A key the page has no word for is printed as it is, as the page does.
const VEHICLE_CLASS = {
  sedan: 'Sedan', coupe: 'Coupe', muscle: 'Muscle car', sports: 'Sports car', super: 'Supercar', suv: 'SUV', pickup: 'Pickup', van: 'Van', offroad: 'Off-road',
  bike: 'Bike', boat: 'Boat', aircraft: 'Aircraft', truck: 'Truck', utility: 'Utility', emergency: 'Emergency', military: 'Military', industrial: 'Industrial', transport: 'Transport',
};
const SPECIALIST = { none: 'None', tuner: 'Tuner', donks: 'Donks', hotrods: 'Hot Rods', lowriders: 'Lowriders', muscle: 'Muscle', offroad: 'Off-Road', luxury: 'Luxury' };
/** the figures the vehicle page draws as bars: the data's key, then the page's label as a key of the entry */
const VEHICLE_BARS = { speed: 'speed', acceleration: 'acceleration', asphalt: 'asphalt_handling', offroad: 'offroad_handling', strength: 'strength' };
/** the classes a player can register as their own (src/lib/vehicles.mjs KEEP_TYPES); a car or bike with a cost to register gets the page's "to keep one" line */
const KEEP_TYPES = ['sedan', 'coupe', 'muscle', 'sports', 'super', 'suv', 'pickup', 'van', 'offroad', 'bike'];
const KEEP_ONE = 'To keep one, steal it and register it as your own for {price}.';
const WEAPON_CLASS = {
  pistol: 'Pistol', revolver: 'Revolver', smg: 'Submachine gun', shotgun: 'Shotgun', assault: 'Assault rifle', tactical: 'Tactical rifle', sniper: 'Sniper rifle',
  smallgame: 'Small game rifle', mg: 'Machine gun', launcher: 'Launcher', melee: 'Melee weapon', explosive: 'Explosive',
};
const WEAPON_KIND = { sidearm: 'Sidearm', longarm: 'Longarm', equipment: 'Equipment' };
const FIRE = { semi: 'Semi-auto', auto: 'Full auto', burst: '3-round burst', pump: 'Pump action', break: 'Break action', bolt: 'Bolt action', single: 'Single shot' };
const WEAPON_BARS = { damage: 'damage', accuracy: 'accuracy', handling: 'handling', range: 'range' };
const labelOf = (map, key) => (typeof key !== 'string' ? undefined : Object.hasOwn(map, key) ? map[key] : key);
/** in-game dollars as the page prints them: "$" and the number grouped the English way */
const dollars = (n) => `$${new Intl.NumberFormat('en-US').format(n)}`;
/** a row's figures under the page's labels: only the numbers it really has, or nothing */
const bars = (stats, keys) => {
  const shown = Object.entries(keys).filter(([k]) => isNum(stats?.[k])).map(([k, name]) => [name, stats[k]]);
  return shown.length ? Object.fromEntries(shown) : undefined;
};
/** the one guide behind the sell, register and shop prices is named in the open data; the word it gets stays the data's own (never a name, never a date) */
const priceStatus = (db) => statusFields(db?.prices?.status).status_label;
const vehicleGame = (r) => (r.game && typeof r.game === 'object' ? r.game : undefined);
/** a vehicle Rockstar showed before launch has a blurb and facts of its own; the page tells it from a vehicle of the released game by the blurb */
const isShowcase = (r) => Boolean(str(r.blurb));
/** the facts of a vehicle Rockstar showed, as its page lists them: its own "How to get" is said once, in how_to_get */
const showcaseFacts = (r) =>
  list(r.facts)
    .filter((f) => f && typeof f.label === 'string' && typeof f.value === 'string' && !(r.find?.status === 'official' && f.label === 'How to get'))
    .map((f) => ({ label: f.label, value: f.value }));
const vehicleClass = (r) => (isShowcase(r) ? str(r.class) : labelOf(VEHICLE_CLASS, vehicleGame(r)?.type));
const era = (g) => (str(g?.decade) ? `${g.decade.slice(0, 4)}s` : undefined);
const withHow = (what, find) => (findShown(find) ? `${what}. ${howToGet(find)}` : what);

/* ---------- animals: what their pages state ---------- */

// The words of the animal pages (src/i18n/copy/en.json: components.animal, pages.animals, pages.animal), copied for the same reason; the tests pin them.
const LOG_TAB = {
  hunting: 'Hunting', fishing: 'Fishing', mammals: 'Mammals', pets: 'Cats & Dogs', reptiles: 'Reptiles & Amphibians', birds: 'Birds', aquatic: 'Aquatic', other: 'Other',
};
const HABITAT = { coastal: 'Coast', forest: 'Forest', urban: 'City', wetland: 'Wetland' };
const LURE = {
  'small-fresh': 'Small freshwater lure', 'medium-fresh': 'Medium freshwater lure', 'small-salt': 'Small saltwater lure',
  'medium-salt': 'Medium saltwater lure', 'large-salt': 'Large saltwater lure', 'candy-cane': 'Candy cane lure',
};
const NEAR_AREA = 'near {area}';
const HARD_TO_FIND = 'Hard to find';
/** how an animal goes into the log, as the animal's page says it: a fish is caught, any other animal is studied, a cat or a dog can be petted too */
const HOW_TO_LOG = {
  study: 'Look at an animal through your binoculars and hold R1 (RB on Xbox) until the circle fills. Its name, picture and details go into the log.',
  catch: 'A fish goes into the Fishing tab when you land it. Each one takes its own lure, sold at the Ammu-Nation stores that show a fish under Features on the map.',
  pet: 'Aim at a friendly cat or dog with L2 (LT) and praise it until it comes closer, then pet it. Pet treats from grocery and convenience stores let you feed it too.',
};
const logSteps = (r) => (r.tab === 'fishing' ? [HOW_TO_LOG.catch] : r.tab === 'pets' ? [HOW_TO_LOG.study, HOW_TO_LOG.pet] : [HOW_TO_LOG.study]);
const andList = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' });
/** where to fish, as the page prints it: "Cottonmouth Lake, Mariana County", "Leonida Straits, near Mariana County" (`near` places it beside the county) */
const bestSpot = (r) => {
  const area = str(r.area) ? (r.near === true ? NEAR_AREA.replace('{area}', r.area) : r.area) : '';
  const where = [str(r.spot), area].filter(Boolean).join(', ');
  return where ? where[0].toLocaleUpperCase('en-US') + where.slice(1) : undefined;
};
/** the facts the animal's page draws in its Details box, in its labels' order */
const animalFacts = (r) => {
  const habitats = list(r.habitats).map((h) => labelOf(HABITAT, h)).filter(Boolean);
  return { tab: labelOf(LOG_TAB, r.tab), lure: labelOf(LURE, r.lure), spot: bestSpot(r), habitats, weapon: str(r.weapon) };
};
const animalLine = (r) => {
  const f = animalFacts(r);
  const parts = [
    f.tab && `Log tab: ${f.tab}`, f.lure && `Lure: ${f.lure}`, f.spot && `Best spot: ${f.spot}`,
    f.habitats.length && `Habitat: ${andList.format(f.habitats)}`, f.weapon && `Recommended weapon: ${f.weapon}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join('. ')}.` : 'An animal in the wildlife log.';
};
/** Bret's target deck the animal is asked for in, as the page lists it: its number, its name and every animal the deck holds */
const deckOf = (r, data) => {
  const deck = isNum(r.deck) ? liveRows(data.animalCollection?.decks?.list).find((d) => d.n === r.deck) : undefined;
  return deck && str(deck.name) ? compact({ number: deck.n, name: deck.name, animals: list(deck.animals).filter((a) => str(a)) }) : undefined;
};

/* ---------- locks: what their pages state ---------- */

// The words of the safe-code pages (pages.safe and pages.safes in en.json), copied; the tests pin them.
const LOCK_LABEL = { safe: 'Safe', keypad: 'Door keypad', password: 'Computer password' };
/** what a reader searches for, as the page's title says it ("<name> safe code") */
const LOCK_WHAT = { safe: 'safe code', keypad: 'keypad code', password: 'password' };
const JOB_LABEL = { mission: 'Story mission', operation: 'Illegal Operation', robbery: 'Robbery', free: 'Open world' };
/** the three kinds of lock, as the list says them: a set code is the same for every player, a code that changes is new every time, the third has none */
const CODE_TYPE = { fixed: 'Set code: the same for every player', random: 'Changes every time', none: 'No code' };
const codeType = (r) => (r.kind === 'fixed' ? CODE_TYPE.fixed : r.kind === 'random' ? CODE_TYPE.random : CODE_TYPE.none);
/** the same, as the words a question uses for it: the label before the colon, not the sentence that explains it ("the same for every player") */
const codeWords = (r) => codeType(r).split(':')[0];
/** the region of a lock that covers places all over the state; a lock no two sites place in a region has none (src/lib/safes.mjs) */
const EVERYWHERE = 'leonida';
const EVERYWHERE_NAME = 'All over Leonida';
const LOCK_LIST = '/safe-codes/';
/** a reported lock is not on the list's rows: it is one line under "Not confirmed yet", at the foot of the list */
const LOCK_UNCONFIRMED = '/safe-codes/#not-confirmed-yet';
/** a lock is a spoiler when naming its job gives a story turn away: the open data keeps only its number and slug, and so do these tools */
const isSpoilerLock = (r) => r.spoiler === true;
/** the region's name as the page prints it (data/locations.json, which the open data carries); a row is searched by the same name made from its slug, as a row's words have no data to read */
const regionName = (data, slug) => (!str(slug) ? undefined : slug === EVERYWHERE ? EVERYWHERE_NAME : str(liveRows(data?.locations).find((l) => l.slug === slug)?.name) ?? slug);
const regionWords = (slug) => (!str(slug) ? '' : slug === EVERYWHERE ? EVERYWHERE_NAME : slug.replace(/-/g, ' '));
const SPOILER_LOCKS_NOTE =
  'Some locks are story spoilers. Leonida Lab keeps their codes, the place the game shows each code and the job each belongs to behind a fold on the list page, ' +
  'and none of it is given here: these locks are not named and no search finds them. Say that spoiler locks exist and how many, link the page and do not guess at them.';
/** what a search that hits a lock says of the spoiler locks: a spoiler is never named, so their number and the list's page are all there is to say */
const spoilerLocks = (data) => {
  const count = liveRows(data.safes?.items).filter(isSpoilerLock).length;
  return count ? { count, note: SPOILER_LOCKS_NOTE, page: url(LOCK_LIST) } : undefined;
};

/* ---------- radio stations: what their pages state ---------- */

// pages.station and components.radio in en.json: what a station plays, as a short label
const GENRE = {
  pop: 'Pop', eighties: '80s pop', rap: 'Rap', southernrap: 'Southern rap classics', rnb: 'R&B', latin: 'Modern Latin', latinclassic: 'Classic Latin', haitian: 'Haitian music',
  african: 'African music', reggae: 'Reggae and dub', house: 'House and techno', indie: 'Indie and dance', classicrock: 'Classic rock', softrock: 'Soft rock', metal: 'Metal',
  country: 'Country', blues: 'Blues', jazz: 'Jazz', classical: 'Classical', worldpop: 'Pop from around the world', eclectic: 'Eclectic', talk: 'Talk radio',
};
/** a host as the page words them: the performer, and the character they play on air when there is one ("Bad Bunny as El Martillo") */
const hostOf = (h) => (h && typeof h === 'object' && str(h.name) ? compact({ name: h.name, as: str(h.as) }) : undefined);
const hostsOf = (hosts) => {
  const out = list(hosts).map(hostOf).filter(Boolean);
  return out.length ? out : undefined;
};
const hostText = (h) => (h.as ? `${h.name} as ${h.as}` : h.name);
const songOf = (s) => (s && typeof s === 'object' && str(s.title) ? compact({ title: s.title, artist: str(s.artist) }) : undefined);
const songsList = (songs) => {
  const out = list(songs).map(songOf).filter(Boolean);
  return out.length ? out : undefined;
};
/** every song a station plays, its shows' included, each once: src/lib/radio.mjs songsOf, copied; the page's "Songs" is how many */
const stationSongs = (r) => {
  const seen = new Set();
  return [...list(r.songs), ...liveRows(r.shows).flatMap((w) => list(w.songs))].map(songOf).filter((s) => {
    if (!s) return false;
    const key = `${s.title}|${s.artist ?? ''}`;
    return seen.has(key) ? false : seen.add(key);
  });
};
const stationShows = (r) => liveRows(r.shows).filter((w) => str(w.name));
const stationHosts = (r) => [...list(r.hosts), ...stationShows(r).flatMap((w) => list(w.hosts))].map(hostOf).filter(Boolean);
/** the page's facts box, as one line */
const stationLine = (r) => {
  const hosts = list(r.hosts).map(hostOf).filter(Boolean);
  const shows = stationShows(r);
  const n = stationSongs(r).length;
  return [
    `Genre: ${labelOf(GENRE, r.genre) ?? 'Radio'}`, hosts.length && `Hosts: ${hosts.map(hostText).join(', ')}`, shows.length && `Shows: ${shows.map((w) => w.name).join(', ')}`, n && `Songs: ${n}`,
  ].filter(Boolean).join('. ') + '.';
};

/* ---------- cheats, controls, money, trophies and the 100% list: what their pages state ---------- */

/** a fixed phrase ends in a full stop; a row's own sentence may or may not */
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
const plain = (n) => new Intl.NumberFormat('en-US').format(n);
/** a controls move or a line of the 100% list links one page (a string), a way to make money up to three (a list) */
const oneOrMany = (see) => (typeof see === 'string' ? [see] : see);
/** The page of a row the open data holds back (an answer with no question, a spoiler lock) is a page of its own that no other row links: its address would name it. */
const heldPages = (data) => new Set([
  ...liveRows(data?.answers?.items).filter((r) => r.spoiler === true && isNameless(r) && str(r.slug)).map((r) => `/answers/${r.slug}/`),
  ...liveRows(data?.safes?.items).filter((r) => r.spoiler === true && str(r.slug)).map((r) => `/safe-codes/${r.slug}/`),
]);
const pathOf = (s) => {
  const p = s.split(/[?#]/)[0];
  return p.endsWith('/') ? p : `${p}/`;
};
/** the site paths of a row's `see`, absolute, without a page that is held back */
const notHeld = (data, see) => {
  const held = heldPages(data);
  return list(see).filter((s) => typeof s === 'string' && !held.has(pathOf(s))).map(url);
};
/** site paths a row links to, absolute; anything that is not a site path, and any held page, is dropped */
const seeUrls = (see, data) => {
  const held = heldPages(data);
  const out = list(see).filter((s) => typeof s === 'string' && /^\/[a-z0-9/#-]*$/.test(s) && !held.has(pathOf(s))).map(url);
  return out.length ? out : undefined;
};

// The words of the cheats page (pages.cheats in en.json), copied for the same reason; the tests pin them.
const CHEAT_CATEGORY = { player: 'Player', weapons: 'Weapons', vehicles: 'Vehicles', wanted: 'Wanted level', world: 'World', fun: 'Just for fun', filters: 'Screen filters' };
const CHEAT_BUTTON = { UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right', CROSS: 'Cross', CIRCLE: 'Circle', SQUARE: 'Square', TRIANGLE: 'Triangle' };
/** a dash under "How to unlock" means that is not confirmed yet (the page says so under the table) */
const CHEAT_UNLOCK_BLANK = 'Not confirmed yet';
/** a cheat the game lists whose buttons are not confirmed yet is a row with no sequence (the data's noCodeMeaning, in our words): never an invented code */
const CHEAT_NO_CODE = 'Code not confirmed yet: the game lists this cheat, but its buttons are not confirmed yet. Do not guess them.';
/** the page draws a sequence as its buttons' names, "Up, Right, Down"; the cheats page's own names, so a pad's face button is its PlayStation name */
const sequence = (seq) => {
  const out = list(seq).filter((t) => typeof t === 'string' && t).map((t) => labelOf(CHEAT_BUTTON, t));
  return out.length ? out.join(', ') : undefined;
};
const cheatButtons = (r) => compact({ ps5: sequence(r.ps5), xbox: sequence(r.xbox), phone: str(r.phone) });
const cheatUnlock = (r) => str(r.unlock) ?? CHEAT_UNLOCK_BLANK;

// The words of the controls page (pages.controls in en.json): its groups, and what a move that only one pad can do says.
const CONTROL_GROUP = {
  driving: 'Driving', bikes: 'Bikes', water: 'In the water', air: 'In the air', combat: 'Combat', onfoot: 'On foot', gear: 'Phone and gear', tips: "What the game doesn't tell you",
};
const CONTROL_ONLY = { ps5: 'PS5 only', xbox: 'Xbox only' };
const CONTROL_TIP = 'A tip: it has no buttons.';
/** the page shows a move that is confirmed, and one players report apart under "not confirmed yet"; any other row is not on the page */
const controlShown = (r) => r.status === 'checked' || r.status === 'reported';
/** a sentence names a button in braces ("hold {L2}"); search reads the button's own name */
const unbraced = (text) => String(text ?? '').replace(/\{([A-Z0-9-]+)\}/g, '$1');

// The words of the money page (pages.money in en.json): how it prints what a way pays, and what it is counted per.
const MONEY_PER = { job: 'per job', car: 'per car', win: 'per win', animal: 'per animal' };
const MONEY_NO_PAY = 'No set amount';
const MONEY_TIPS = '/money/#tips-h';
const MONEY_LIST = '/money/';
/** what one go pays, as the page prints it: "$5,000 to $45,000", "$205,000+", "About $20,000", "Up to $9,000", then what it is counted per */
const payText = (p) => {
  if (!p || typeof p !== 'object' || !isNum(p.to)) return undefined;
  const base = isNum(p.from) ? `${dollars(p.from)} to ${dollars(p.to)}` : p.plus === true ? `${dollars(p.to)}+` : p.about === true ? `About ${dollars(p.to)}` : `Up to ${dollars(p.to)}`;
  const per = labelOf(MONEY_PER, p.per);
  return per ? `${base} ${per}` : base;
};
const fromChapter = (r) => (isNum(r.chapter) ? `From Chapter ${r.chapter}` : undefined);
/** a method and a tip are two shapes of one kind; a tip marked spoiler is the second sort of lock: no name, never indexed, its entry the flag and the list */
const isSpoilerTip = (w) => w.row.spoiler === true;
const moneyRows = (data) => [
  ...liveRows(data.money?.methods).filter((r) => str(r.id)).map((row) => ({ shape: 'method', row })),
  ...liveRows(data.money?.tips).filter((r) => str(r.id)).map((row) => ({ shape: 'tip', row })),
];

// The words of the trophies page (trophies.* in src/i18n/tracker/en.json): a trophy has a grade on PlayStation and a Gamerscore on Xbox, one list for both.
const TROPHY_GRADE = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
const TROPHY_MYTHIC = 'Mythic';
const TROPHY_GROUP = {
  completion: 'Platinum and 100%', story: 'Story', strangers: 'Strangers', crime: 'Crime', activities: 'Activities', exploring: 'Exploring and collecting', money: 'Money and property', secrets: 'Secrets',
};
const TROPHY_GRADE_NOTE =
  'On PlayStation a trophy has a grade (platinum, gold, silver or bronze); on Xbox the same entry is an achievement worth a score in G, the Gamerscore, and the platinum is Mythic.';
const TROPHY_HIDDEN_NOTE =
  'This is a hidden trophy, and a story spoiler: its name and what it asks for are behind a fold on the page, and they are not given here. Its number, grade, score and group are. ' +
  'The grade is the PlayStation trophy grade; the score is the Xbox Gamerscore in G, and the platinum is Mythic. Say that a hidden trophy exists and link the page; do not guess at it.';
const TROPHY_HIDDEN_COUNT =
  '{hidden} of the {total} trophies are hidden. Their names and what they ask for are story spoilers, kept behind a fold on the page and not given here. ' +
  'No search finds a hidden trophy; get_entry with kind trophy and the slug hidden-<number>, the number being its place on the list (hidden_numbers lists them), gives its number, grade, score and group.';
const isHiddenTrophy = (r) => r.hidden === true;
/** the Xbox score as the page prints it: "30 G", or Mythic for the platinum */
const trophyScore = (r) => (r.grade === 'platinum' ? TROPHY_MYTHIC : isNum(r.g) ? `${plain(r.g)} G` : undefined);
const trophyLine = (r) => `${labelOf(TROPHY_GRADE, r.grade) ?? 'Trophy'} trophy${trophyScore(r) ? ` (Xbox: ${trophyScore(r)})` : ''}. ${str(r.how) ?? ''}`.trim();

// The words of the 100% list (completion.* in src/i18n/tracker/en.json): its groups, and a line's share of the game's 100%.
const COMPLETION_GROUP = { story: 'Story and tasks', robberies: 'Robberies and fencing', exploring: 'Exploring and collecting', activities: 'Activities', discovery: 'Discovery' };
const completionShare = (r) => (isNum(r.weight) ? `${plain(r.weight)}%` : undefined);
/** a line whose figure is not settled says so in its own `how`; the tools never give a number for it */
const isOpenLine = (r) => r.open === true;

const KINDS = {
  answer: {
    rows: (data) => liveRows(data.answers?.items),
    slug: (r) => r.slug,
    name: (r) => r.q ?? '',
    words: (r) => ({ title: r.q ?? '', body: [r.short, r.a, ...list(r.steps), ...list(r.notes)].filter(Boolean).join(' ') }),
    line: (r) => (r.spoiler ? SPOILER_LINE : r.short),
    status: (r) => r.status,
    entry: (r, data) => {
      const rows = liveRows(data.answers?.items);
      // the page links the answers it relates to by their question; one the open data holds no question for is not named
      const related = list(r.related).map((s) => rows.find((x) => x.slug === s)).filter((x) => x?.q).map((x) => ({ slug: x.slug, name: x.q }));
      return {
        topic: r.topic,
        short: r.short,
        answer: r.a,
        ...(list(r.steps).length ? { steps: r.steps } : {}),
        ...(list(r.notes).length ? { notes: r.notes } : {}),
        ...(related.length ? { related } : {}),
        ...(notHeld(data, r.see).length ? { see_also: notHeld(data, r.see) } : {}),
      };
    },
    // a story question the endings hub holds has no question in the open data: its page is the hub
    page: (r) => (isNameless(r) ? ENDINGS_HUB : `/answers/${r.slug}/`),
    spoiler: (r) => r.spoiler === true,
  },
  // Every vehicle has a page (the retired and held-back ones are not in the open rows). Its figures are what the page draws; a fact the data keeps
  // for itself (`left`, `sources`, `added`, the note of an unsettled find) is not on the page and not here.
  vehicle: {
    rows: (data) => liveRows(data.vehicles),
    slug: (r) => r.slug,
    name: (r) => String(r.name ?? ''),
    words: (r) => {
      const g = vehicleGame(r);
      return {
        // a maker is part of what a vehicle is called ("Grotti", "the Vapid Ganado"), though many names leave it out; its class (Supercar, Bike, Boat) is what it is
        title: [r.name, str(g?.brand), vehicleClass(r)].filter(Boolean).join(' '),
        body: [
          g && g.name !== r.name ? str(g.name) : '', vehicleClass(r), g && isShowcase(r) ? labelOf(VEHICLE_CLASS, g.type) : '',
          g?.specialist !== 'none' ? labelOf(SPECIALIST, g?.specialist) : '', era(g),
          str(r.blurb), ...showcaseFacts(r).map((f) => f.value), findShown(r.find) ? howToGet(r.find) : '',
        ].filter(Boolean).join(' '),
      };
    },
    line: (r) => {
      if (isShowcase(r)) return r.blurb;
      const brand = str(vehicleGame(r)?.brand);
      return withHow([vehicleClass(r) ?? 'Vehicle', brand ? `by ${brand}` : ''].filter(Boolean).join(' '), r.find);
    },
    status: (r) => r.status,
    entry: (r, data) => {
      const g = vehicleGame(r);
      const showcase = isShowcase(r);
      const pays = isNum(g?.sell) || isNum(g?.register);
      const details = showcase ? showcaseFacts(r) : [];
      return compact({
        brand: str(g?.brand),
        class: vehicleClass(r),
        class_in_game: showcase && g ? labelOf(VEHICLE_CLASS, g.type) : undefined,
        era: era(g),
        mod_specialist: labelOf(SPECIALIST, g?.specialist),
        description: showcase ? r.blurb : undefined,
        details: details.length ? details : undefined,
        stats: bars(g?.stats, VEHICLE_BARS),
        ratings: bars(g?.rating, { road: 'on_road', offroad: 'off_road' }),
        sell_value: isNum(g?.sell) ? dollars(g.sell) : undefined,
        cost_to_register: isNum(g?.register) ? dollars(g.register) : undefined,
        // one guide's figures: the status of the row does not cover them, so they carry their own word
        prices_status_label: pays ? priceStatus(data.vehicleDatabase) : undefined,
        how_to_get: howToGet(r.find),
        keep_one: isNum(g?.register) && KEEP_TYPES.includes(g.type) ? KEEP_ONE.replace('{price}', dollars(g.register)) : undefined,
      });
    },
    page: (r) => `/vehicles/${r.slug}/`,
  },
  weapon: {
    rows: (data) => liveRows(data.weapons),
    slug: (r) => r.slug,
    name: (r) => String(r.name ?? ''),
    words: (r) => ({
      title: [r.name, labelOf(WEAPON_CLASS, r.type)].filter(Boolean).join(' '),
      body: [
        str(r.brand), str(r.model), labelOf(WEAPON_CLASS, r.type), labelOf(WEAPON_KIND, r.kind), labelOf(FIRE, r.fire), str(r.caliber),
        ...list(r.variants).map((v) => str(v?.name)), findShown(r.find) ? howToGet(r.find) : '',
      ].filter(Boolean).join(' '),
    }),
    line: (r) => withHow([labelOf(WEAPON_CLASS, r.type) ?? 'Weapon', str(r.brand) ? `by ${r.brand}` : ''].filter(Boolean).join(' '), r.find),
    status: (r) => r.status,
    entry: (r, data) => {
      const variants = liveRows(r.variants).filter((v) => str(v.name));
      const pays = isNum(r.price) || variants.some((v) => isNum(v.price));
      return compact({
        brand: str(r.brand),
        class: labelOf(WEAPON_CLASS, r.type),
        carried_as: labelOf(WEAPON_KIND, r.kind),
        fire_style: labelOf(FIRE, r.fire),
        caliber: str(r.caliber),
        magazine: isNum(r.mag) ? r.mag : undefined,
        shop_price: isNum(r.price) ? dollars(r.price) : undefined,
        prices_status_label: pays ? priceStatus(data.weaponDatabase) : undefined,
        stats: bars(r.stats, WEAPON_BARS),
        variants: variants.length
          ? variants.map((v) => compact({
            name: v.name,
            stats: bars(v.stats, WEAPON_BARS),
            magazine: isNum(v.mag) ? v.mag : undefined,
            price: isNum(v.price) ? dollars(v.price) : undefined,
            ultimate_edition: v.ultimate ? true : undefined,
          }))
          : undefined,
        how_to_get: howToGet(r.find),
      });
    },
    page: (r) => `/weapons/${r.slug}/`,
  },
  // The wildlife log. An animal's page states its log tab, how it goes into the log, the lure and the best spot of a fish, the habitat and the weapon
  // the game recommends for a hunting animal, Bret's deck and a hard-to-find animal's rarity. The data's own `sources`, `added` and `art` stay out.
  animal: {
    rows: (data) => liveRows(data.animals),
    slug: (r) => r.slug,
    name: (r) => String(r.name ?? ''),
    // what the page states, as values: the tab, the lure, the spot, the habitats and the weapon, and the page's own words for what it is and how it goes in the log
    // ("animal", "Catch it", "Study it", Bret's deck, hard to find). Never the labels it prints them under ("Best spot", "Log tab", "Habitat"): every animal has them,
    // so they would make every animal an answer to "best".
    words: (r) => {
      const f = animalFacts(r);
      return {
        title: String(r.name ?? ''),
        body: [
          f.tab, f.lure, f.spot, ...f.habitats, f.weapon, 'Animal in the wildlife log.', r.tab === 'fishing' ? 'Catch it.' : 'Study it.',
          isNum(r.deck) ? "Bret's target deck." : '', r.rare === true ? HARD_TO_FIND : '',
        ].filter(Boolean).join(' '),
      };
    },
    line: animalLine,
    status: (r) => r.status,
    entry: (r, data) => {
      const f = animalFacts(r);
      return compact({
        log_tab: f.tab,
        how_to_log: logSteps(r),
        lure: f.lure,
        best_spot: f.spot,
        habitat: f.habitats.length ? f.habitats : undefined,
        recommended_weapon: f.weapon,
        bret_target_deck: deckOf(r, data),
        rarity: r.rare === true ? HARD_TO_FIND : undefined,
      });
    },
    page: (r) => `/animals/${r.slug}/`,
  },
  // Locks. A spoiler lock has no name in the open data (only its number and slug), and these tools hold that line whatever a row carries: it is never
  // indexed, never a hit, and its entry is the flag and the list's page. A search that hits a lock says how many spoiler locks there are.
  // A confirmed lock has a page of its own, with its code where it is a set code. A lock one guide has is one line on the list under "Not confirmed yet":
  // its name and its code, and that is all this entry says of it.
  safe: {
    rows: (data) => liveRows(data.safes?.items),
    slug: (r) => r.slug,
    name: (r) => (isSpoilerLock(r) ? '' : String(r.name ?? '')),
    words: (r) => {
      if (isSpoilerLock(r)) return { title: '', body: '' };
      const code = r.kind === 'fixed' ? str(r.code) : undefined;
      if (r.status !== 'checked') return { title: [r.name, str(r.aka)].filter(Boolean).join(' '), body: [codeWords(r), code].filter(Boolean).join(' ') };
      return {
        title: [r.name, str(r.aka), labelOf(LOCK_LABEL, r.lock)].filter(Boolean).join(' '),
        body: [
          labelOf(LOCK_LABEL, r.lock), labelOf(LOCK_WHAT, r.lock), codeWords(r), code, regionWords(r.region), str(r.area), str(r.where), str(r.clue), str(r.how), str(r.inside),
        ].filter(Boolean).join(' '),
      };
    },
    // a hit says what the lock is and where, never the code: the entry has it, and the page is the citation
    line: (r) => {
      if (r.status !== 'checked') return codeType(r);
      const what = `${labelOf(LOCK_LABEL, r.lock) ?? 'Lock'} with ${r.kind === 'fixed' ? 'a set code' : r.kind === 'random' ? 'a code that changes every time' : 'no code'}.`;
      return str(r.where) ? `${what} ${r.where}` : what;
    },
    status: (r) => r.status,
    entry: (r, data) => {
      const fixed = r.kind === 'fixed';
      const code = { code_type: codeType(r), code: fixed ? str(r.code) : undefined };
      if (r.status !== 'checked') return compact(code);
      const rows = liveRows(data.safes?.items);
      const area = str(r.area);
      const region = regionName(data, r.region);
      // the page links the locks related to this one that have a page and a name: a spoiler lock has neither in the open data
      const related = list(r.related).map((s) => rows.find((x) => x.slug === s)).filter((x) => x && !isSpoilerLock(x) && x.status === 'checked' && str(x.name)).map((x) => ({ slug: x.slug, name: x.name }));
      return compact({
        lock: labelOf(LOCK_LABEL, r.lock),
        ...code,
        how_to_open: fixed ? undefined : str(r.how),
        where_the_game_shows_the_code: str(r.clue),
        where: str(r.where),
        area,
        region,
        inside: str(r.inside),
        job: labelOf(JOB_LABEL, r.job?.type),
        ...(related.length ? { related } : {}),
        ...(notHeld(data, r.see).length ? { see_also: notHeld(data, r.see) } : {}),
      });
    },
    page: (r) => (isSpoilerLock(r) ? LOCK_LIST : r.status === 'checked' ? `${LOCK_LIST}${r.slug}/` : LOCK_UNCONFIRMED),
    spoiler: isSpoilerLock,
  },
  // The stations of the radio (podcasts have no page of their own and are not here). The list comes from Rockstar's own credits, so a station is
  // `official` (Confirmed); the rows carry no status of their own and the credits page that names them is the data's record, not an answer's.
  radio: {
    rows: (data) => liveRows(data.radioStations),
    slug: (r) => r.slug,
    name: (r) => String(r.name ?? ''),
    // The hosts, the shows and the genre are what a station is; its songs and the artists are minor: hundreds of words, and a question that shares one with a
    // station ("how do I jump", "how do I swim") is almost never about that station, so a word only a song or an artist holds counts at half weight.
    words: (r) => ({
      title: [r.name, labelOf(GENRE, r.genre)].filter(Boolean).join(' '),
      body: [
        'radio station', labelOf(GENRE, r.genre), stationHosts(r).length ? 'Hosts' : '', ...stationHosts(r).flatMap((h) => [h.name, h.as]), ...stationShows(r).map((w) => w.name),
        stationSongs(r).length ? 'Songs' : '',
      ].filter(Boolean).join(' '),
      minor: stationSongs(r).map((s) => [s.title, s.artist].filter(Boolean).join(' ')),
    }),
    line: stationLine,
    status: () => 'official',
    entry: (r) => {
      const shows = stationShows(r).map((w) => compact({ name: w.name, hosts: hostsOf(w.hosts), songs: songsList(w.songs) }));
      const n = stationSongs(r).length;
      return compact({
        genre: labelOf(GENRE, r.genre),
        hosts: hostsOf(r.hosts),
        shows: shows.length ? shows : undefined,
        song_count: n || undefined,
        songs: songsList(r.songs),
      });
    },
    page: (r) => `/radio/${r.slug}/`,
  },
  // The cheats page lists every cheat the game has: its effect (the row's title on the page), how it is earned and its buttons, grouped by category. A row with no
  // buttons is a cheat the game lists whose buttons are not confirmed yet: the entry says so and never invents them. `name` is what the game calls it (the open
  // data's own field; the page titles the row by its effect), so a question in either words finds it. Each row has an anchor on the page.
  cheat: {
    rows: (data) => liveRows(data.cheats?.codes).filter((r) => str(r.id)),
    slug: (r) => r.id,
    name: (r) => String(r.name ?? ''),
    // A row IS a cheat, so the word cheat is its title and what it is called is its body: a question that shares a word with a cheat's name ("pistol", "bike") must not push the
    // vehicles and weapons out of the answer, and a question about a safe's code must not find a cheat (the word code is only in the body). A row is still found by its name:
    // the name is an exact match, and its words are all in the body.
    words: (r) => ({
      title: 'cheat',
      body: [r.name, r.effect, 'code', labelOf(CHEAT_CATEGORY, r.category), str(r.unlock)].filter(Boolean).join(' '),
    }),
    // a hit says what the cheat does and how it is earned, never the buttons: the entry has them, and the page is the citation
    line: (r) => [
      sentence(str(r.effect) ?? String(r.name ?? 'A cheat')), labelOf(CHEAT_CATEGORY, r.category) && `Category: ${labelOf(CHEAT_CATEGORY, r.category)}.`,
      `How to unlock: ${sentence(cheatUnlock(r))}`, Object.keys(cheatButtons(r)).length ? '' : 'Code not confirmed yet.',
    ].filter(Boolean).join(' '),
    status: (r) => r.status,
    entry: (r) => {
      const buttons = cheatButtons(r);
      return compact({
        category: labelOf(CHEAT_CATEGORY, r.category),
        effect: str(r.effect),
        unlock: cheatUnlock(r),
        ...buttons,
        code_note: Object.keys(buttons).length ? undefined : CHEAT_NO_CODE,
      });
    },
    page: (r) => `/cheats/#${r.id}`,
  },
  // The controls page: every move with its buttons in PlayStation names, grouped by where you use it, and the tips the game never explains (no buttons).
  // The input is the data's own string and stays in PlayStation names: the page draws the Xbox buttons from it one to one, and the data's note says how.
  control: {
    rows: (data) => liveRows(data.controls?.moves).filter((r) => str(r.id) && controlShown(r)),
    slug: (r) => r.id,
    name: (r) => String(r.name ?? ''),
    // What a move is called and the question it answers ("How do you open the trunk in GTA 6?", the page's FAQ data) are body words, found by an exact name or by the question's
    // words: a bare noun ("pistol", "motorcycle") belongs to the weapons and vehicles that are named after it, not to a move that mentions it.
    words: (r) => ({
      title: '',
      body: ['control controls button buttons', r.name, str(r.q), labelOf(CONTROL_GROUP, r.group), unbraced(r.what), str(r.input)].filter(Boolean).join(' '),
    }),
    line: (r) => `${labelOf(CONTROL_GROUP, r.group) ?? 'Controls'}. ${str(r.input) ? `Input, in PlayStation names: ${r.input}.` : CONTROL_TIP}`,
    status: (r) => r.status,
    entry: (r, data) => compact({
      type: str(r.input) ? 'Move' : CONTROL_TIP,
      group: labelOf(CONTROL_GROUP, r.group),
      what: str(r.what),
      input: str(r.input),
      inputs_note: str(r.input) ? str(data.controls?.inputNote) : undefined,
      only_on: Object.hasOwn(CONTROL_ONLY, r.only) ? CONTROL_ONLY[r.only] : undefined,
      see_also: seeUrls(oneOrMany(r.see), data),
    }),
    page: (r) => `/controls/#${r.id}`,
  },
  // The money page: the ways to make money in the story (what one go pays, when it opens, how, one tip) and the tips on keeping it. Neither shape has a status of
  // its own: the data lists a way or a tip on two independent reads, so `checked`. A tip marked spoiler arrives as its id alone (no title, no text): it is the second
  // sort of lock, never indexed, never a hit, its entry the flag and the list. Mission names are the page's, as it states them; none is added here.
  money: {
    rows: moneyRows,
    slug: (w) => w.row.id,
    name: (w) => (isSpoilerTip(w) ? '' : String((w.shape === 'tip' ? w.row.title : w.row.name) ?? '')),
    words: (w) => {
      const r = w.row;
      if (isSpoilerTip(w)) return { title: '', body: '' };
      // like the controls: what a way or a tip is called, and its question, are body words (an exact name still finds it); the title says what kind of row it is
      return w.shape === 'tip'
        ? { title: 'money tip', body: [r.title, str(r.text), str(r.q)].filter(Boolean).join(' ') }
        : { title: 'way to make money', body: [r.name, str(r.q), fromChapter(r), str(r.unlock), str(r.how), str(r.tip)].filter(Boolean).join(' ') };
    },
    line: (w) => {
      const r = w.row;
      if (w.shape === 'tip') return str(r.text) ?? 'A tip on keeping what you make.';
      return [payText(r.pay) ?? MONEY_NO_PAY, fromChapter(r), str(r.how)].filter(Boolean).map(sentence).join(' ');
    },
    status: () => 'checked',
    entry: (w, data) => {
      const r = w.row;
      if (w.shape === 'tip') return compact({ text: str(r.text), see_also: seeUrls(r.see, data) });
      return compact({ pay: payText(r.pay) ?? MONEY_NO_PAY, chapter: fromChapter(r), unlock: str(r.unlock), how: str(r.how), tip: str(r.tip), see_also: seeUrls(r.see, data) });
    },
    page: (w) => (isSpoilerTip(w) ? MONEY_LIST : w.shape === 'tip' ? MONEY_TIPS : `${MONEY_LIST}#${w.row.id}`),
    spoiler: isSpoilerTip,
  },
  // Every trophy and achievement, one list for both consoles: the grade on PlayStation, the score in G on Xbox. A hidden trophy arrives as its number, grade, score and
  // group (no id, no name, no requirement): its slug is `hidden-<number>`, it has no name, so it is never indexed and never a hit, and its entry is those four facts,
  // the flag and the page's group. Whatever else a hidden row arrives with, none of it is read.
  trophy: {
    rows: (data) => liveRows(data.trophies?.items).filter((r) => (isHiddenTrophy(r) ? isNum(r.n) : str(r.id))),
    slug: (r) => (isHiddenTrophy(r) ? `hidden-${r.n}` : r.id),
    name: (r) => (isHiddenTrophy(r) ? '' : String(r.name ?? '')),
    // "trophy" and "achievement" are one list, so a question in either word finds it
    words: (r) => ({
      title: 'trophy',
      body: [r.name, labelOf(TROPHY_GRADE, r.grade), labelOf(TROPHY_GROUP, r.group), str(r.how)].filter(Boolean).join(' '),
    }),
    line: trophyLine,
    status: () => 'checked',
    entry: (r, data) => {
      const all = KINDS.trophy.rows(data);
      const hidden = all.filter(isHiddenTrophy).length;
      return compact({
        number: isNum(r.n) ? r.n : undefined,
        how: str(r.how),
        grade: labelOf(TROPHY_GRADE, r.grade),
        score: trophyScore(r),
        group: labelOf(TROPHY_GROUP, r.group),
        grade_note: TROPHY_GRADE_NOTE,
        // the page counts them in its title ("the hidden ones"); a hidden trophy is not found by a search, so this is where an assistant learns how many there are and how to ask for one
        hidden_trophies: hidden ? TROPHY_HIDDEN_COUNT.replace('{hidden}', plain(hidden)).replace('{total}', plain(all.length)) : undefined,
        // which numbers: they are the open data's own (the page lists each hidden trophy by its number), so an assistant need not guess at hidden-<n>
        hidden_numbers: hidden ? all.filter(isHiddenTrophy).map((x) => x.n).sort((a, b) => a - b) : undefined,
      });
    },
    // a hidden trophy's group has a section on the page, and its fold is in it
    page: (r) => (isHiddenTrophy(r) ? `/trophies/#group-${r.group}` : `/trophies/#${r.id}`),
    spoiler: isHiddenTrophy,
    spoilerFields: (r) => compact({ number: r.n, grade: labelOf(TROPHY_GRADE, r.grade), score: trophyScore(r), group: labelOf(TROPHY_GROUP, r.group) }),
    spoilerNote: TROPHY_HIDDEN_NOTE,
  },
  // The game's own 100% list: each line, what it asks for and its share of the game's 100%. Lines carry no status of their own, so `checked`; a line whose figure is open
  // (not settled) is `reported`, says so in its own words and has no target or total here: the tools never give a number the data has not settled.
  completion: {
    rows: (data) => liveRows(data.completion?.items).filter((r) => str(r.id)),
    slug: (r) => r.id,
    name: (r) => String(r.label ?? ''),
    words: (r) => ({
      title: '100% completion',
      body: [r.label, 'checklist', labelOf(COMPLETION_GROUP, r.group), str(r.how)].filter(Boolean).join(' '),
    }),
    line: (r) => [sentence(str(r.how) ?? String(r.label ?? '')), completionShare(r) && `${completionShare(r)} of the game's 100%.`].filter(Boolean).join(' '),
    status: (r) => (isOpenLine(r) ? 'reported' : 'checked'),
    entry: (r, data) => compact({
      number: isNum(r.n) ? r.n : undefined,
      group: labelOf(COMPLETION_GROUP, r.group),
      how: str(r.how),
      share_of_100: completionShare(r),
      target: r.kind === 'count' && !isOpenLine(r) && isNum(r.target) ? r.target : undefined,
      total: r.kind === 'count' && !isOpenLine(r) && isNum(r.total) ? r.total : undefined,
      see_also: seeUrls(oneOrMany(r.see), data),
    }),
    page: (r) => `/checklist/#${r.id}`,
  },
};

export const KIND_NAMES = Object.keys(KINDS);
const kindList = () => KIND_NAMES.join(', ');

function resolveKind(kind) {
  const k = String(kind ?? '').trim().toLowerCase();
  if (!Object.hasOwn(KINDS, k)) throw new ToolInputError(`"${String(kind ?? '').trim()}" is not a kind in the database. The kinds are: ${kindList()}.`);
  return k;
}

/** Every live row of every kind, as the build gate walks them: its name (empty when the open data has none), whether it is a spoiler, and its page. */
export function databaseRows(data) {
  return KIND_NAMES.flatMap((kind) => {
    const def = KINDS[kind];
    return def.rows(data).map((row) => ({ kind, slug: def.slug(row), name: def.name(row), spoiler: def.spoiler?.(row) === true, page: url(def.page(row)) }));
  });
}

/** How many live rows each kind holds, for a miss that says what is covered. */
const coveredKinds = (data) => Object.fromEntries(KIND_NAMES.map((k) => [k, KINDS[k].rows(data).length]));

/* ---------- search ---------- */

// The database reads a question with its own words, not the claim index's (tools.mjs): that index drops "run", "up", "down" and "out" as filler, turns "how long"
// into length and "when" into date, and a player asking "how do I run" or "how do I get up" has to be heard. Same method (stemmed, singular words; a question
// and a row meet on the same word), its own lists. The claim index never sees any of this.
const STOP = new Set(
  ('an the is are was were be been being it its this that these those there here of for to in on at by with from as and or but not no yes ' +
    'do does did will would can could should may might must has have had having me my we our you your they them their what which who whom why if ' +
    'then than so very just also any some about into over after before again ever still yet really actually true false fact facts confirmed confirm ' +
    'confirms official officially announced announce rumor rumour rumors rumours heard say says said saying claim claims know known get gets got ' +
    'going go come comes coming game games rockstar vi until whether one all each every per am pm how many much when ' +
    // verbs and adjectives that name no topic of a row ("take cover", "the best car", "what should I use")
    'take takes taking best use uses used using').split(' '),
);
// The way people ask, folded into the word the data uses.
const PHRASES = [
  [/\bgrand theft auto\s*(vi|6|six)?\b/g, ' '],
  [/\bgta\s*(vi|6|six)?\b/g, ' '],
  [/\bhip[\s-]?hop\b/g, ' rap '],
  [/\bget rid of\b/g, ' lose '],
  // "how long does it take" asks for a time, not for a row with the word long in it ("A Long Road")
  [/\bhow long\b/g, ' '],
];
const stem = (w) => {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(w)) return w;
  return w.endsWith('s') ? w.slice(0, -1) : w;
};
// Written in the form the stem gives back (singular), so a question and a row meet on the same word. The first word of a line is the one the data uses.
const SYNONYMS = [
  ['vehicle', 'car', 'automobile'],
  ['weapon', 'gun', 'firearm'],
  ['money', 'cash'],
  // the answer is "lose the police"; a player says wanted level, heat or stars (the pages and the cheats say them too, and fold the same way)
  ['police', 'cop', 'wanted', 'heat', 'star'],
  ['lose', 'escape', 'evade'],
  ['save', 'autosave'],
  // the pages say Bike (and Motorcycle on the one Rockstar showed), Pistol and Submachine gun: people ask for the other word
  ['bike', 'motorcycle', 'motorbike'],
  ['pistol', 'handgun'],
  ['submachine', 'smg'],
  // the vehicle classes and the weapon class the data has (Aircraft, Launcher): people ask for the thing. A helicopter is not folded in:
  // the one aircraft the data has is a plane, and a plane is not what that question asks for
  ['aircraft', 'airplane', 'aeroplane', 'plane'],
  ['launcher', 'rpg', 'bazooka'],
  // a shop line says "Sold at"; people ask where to buy it, and what it costs
  ['buy', 'purchase', 'sold'],
  ['cost', 'price', 'pricing'],
  // the pages say code; a player asks for the combination or the passcode of a safe
  ['code', 'passcode', 'combination'],
  // the wildlife log's tabs are Hunting and Fishing; a player asks where to hunt or fish
  ['hunting', 'hunt', 'hunter'],
  ['fishing', 'fish'],
  // the radio pages say hosts; a player asks who the DJ is. The pages say radio station; a player says station
  ['host', 'dj'],
  ['radio', 'station'],
  // the trophies page says trophies and achievements for one list: a player asks for either
  ['trophy', 'achievement'],
];
const CANON = new Map(SYNONYMS.flatMap(([to, ...words]) => words.map((w) => [w, to])));
const wordsOf = (text) => {
  let s = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  return (s.match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? []).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w))).map((w) => CANON.get(stem(w)) ?? CANON.get(w) ?? stem(w));
};
/** A question with nothing in it to read (empty, or only punctuation or letters the search has no words for) is an error that says what would work; filler alone is a miss. */
const hasLetters = (text) => /[a-z0-9]/.test(String(text ?? '').toLowerCase().normalize('NFKD'));
// question words the claim index keeps and a row is never named by ("where" and "find" ask; every vehicle and weapon page has its stats)
const ASKING = new Set(['where', 'find', 'stat']);

// A word that names a kind of row is a request for that kind ("cheat", "weapon", "car", "station", "lock"), not a topic some row has to hold: a row of that kind counts it
// as met, and as half the question, so what else the question says picks the row. It is a word in the form `wordsOf` gives back.
const KIND_HINT = new Map(
  Object.entries({
    answer: 'answer', vehicle: 'vehicle', weapon: 'weapon', animal: 'animal', safe: 'safe', lock: 'safe', radio: 'radio',
    cheat: 'cheat', control: 'control', button: 'control', money: 'money', trophy: 'trophy',
  }).filter(([, kind]) => Object.hasOwn(KINDS, kind)),
);
/** how much more the share of the question a row says counts than what its name has of it */
const COVER_WEIGHT = 2.2;
/** when the question is nothing but a kind ("weapons", "what weapon should I use"), the rows of that kind come before every other row that holds the word */
const KIND_ONLY_BONUS = 2;
/** a question that is a row's own name, word for word, is that row's */
const EXACT_BONUS = 2.5;
/** a float sum is never compared with a bare ===: a threshold or a tie is read to this many places */
const EPS = 1e-9;
const rounded = (n) => Math.round(n * 1e9) / 1e9;

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

const indexes = new WeakMap();
function databaseIndex(data) {
  let ix = indexes.get(data);
  if (!ix) {
    const docs = [];
    for (const kind of KIND_NAMES) {
      const def = KINDS[kind];
      for (const row of def.rows(data)) {
        const name = def.name(row);
        // no name in the open data (a story answer on the endings hub, a spoiler lock): nothing to find it by, never a hit
        if (!name) continue;
        // a spoiler is found by its name and by nothing it holds
        const w = def.spoiler?.(row) ? { title: name, body: '' } : def.words(row);
        const title = new Set(wordsOf(w.title));
        const body = new Set(wordsOf(w.body));
        // a word only a minor text holds counts at half weight; each text keeps its own words, for a question that is one of them
        const units = list(w.minor).map((u) => new Set(wordsOf(u))).filter((u) => u.size);
        const minor = new Set(units.flatMap((u) => [...u]).filter((t) => !title.has(t) && !body.has(t)));
        const all = new Set([...title, ...body, ...minor]);
        docs.push({ kind, def, row, name, title, minor, units, all, nameWords: new Set(wordsOf(name)), order: docs.length });
      }
    }
    const df = new Map();
    for (const d of docs) for (const t of d.all) df.set(t, (df.get(t) ?? 0) + 1);
    // a word few rows use says more about which row is meant
    const weight = (t) => Math.log((docs.length + 1) / ((df.get(t) ?? 0) + 1)) + 1;
    ix = { docs, weight, known: new Set(df.keys()) };
    indexes.set(data, ix);
  }
  return ix;
}

const hitOf = (d) => {
  const spoiler = d.def.spoiler?.(d.row) === true;
  return {
    kind: d.kind,
    slug: d.def.slug(d.row),
    name: d.name,
    line: d.def.line(d.row),
    ...(spoiler ? { spoiler: true } : statusFields(d.def.status(d.row))),
    page: url(d.def.page(d.row)),
  };
};

const OTHER_TOOLS =
  'check_claim checks a claim about the release (a PC version, 60 FPS, a disc); release_info has dates, platforms and unlock times; ' +
  'price_in_country has prices by country; compare_editions has the editions; recent_changes has the news.';

const HOW_TO_QUOTE =
  'Each hit is one row of the Leonida Lab database. Check that it is about what was asked: a hit that only shares a word is not an answer. ' +
  'Quote its status_label as given: "Not confirmed yet" is not settled and must not be presented as known. A hit marked spoiler gives part of ' +
  'the story away: say that it exists, link its page and do not guess its text. Call get_entry with its kind and slug for the whole row. ' +
  'Words listed in unmatched_words appear in no hit, so the hits say nothing about them. Cite Leonida Lab and link the page.';

/** what a miss says of the story answers the endings hub holds: they have no question to be found by, so a story question that finds nothing is not "not confirmed" */
const SPOILER_ANSWERS_NOTE =
  'Leonida Lab holds answers about the story, the endings among them, as story spoilers behind folds on its endings hub. ' +
  'They have no question to search by and none of them is given here, so if the question is about the story this miss does not mean it is not confirmed: ' +
  'say that these story answers exist and how many, link the page and do not guess at them.';
/** the answers held on the endings hub: the open data gives them no question (rows with spoiler true and no q) */
const heldAnswers = (data) => KINDS.answer.rows(data).filter((r) => r.spoiler === true && isNameless(r));
const spoilerAnswers = (data) => {
  const count = heldAnswers(data).length;
  return count ? { count, note: SPOILER_ANSWERS_NOTE, page: url(ENDINGS_HUB) } : undefined;
};

/** what is left to do with a long list: only what would change it (a limit already at 10 or a kind already named is not offered) */
const moreText = (rest, limit, only) => {
  const how = [limit < 10 ? 'raise limit (up to 10)' : '', only ? '' : 'name a kind'].filter(Boolean).join(' or ');
  return `${rest} more ${rest === 1 ? 'match' : 'matches'}${how ? `: ${how}` : ''}.`;
};

export function searchDatabase({ data }, { query, kind, limit = 5 } = {}) {
  const asked = String(query ?? '').trim();
  if (asked.length > 200) throw new ToolInputError('Keep the question to 200 characters.');
  const only = kind == null ? null : resolveKind(kind);
  if (!hasLetters(asked)) {
    throw new ToolInputError('Say what you are looking for in English (the database is in English), for example "how do I save", "lose the police" or "keep a stolen car".');
  }
  const spoken = [...new Set(wordsOf(asked))];
  // a word that only asks ("where is the Cheetah", "the stats of the Kalinga") names no row: it is dropped when something else is left
  const words = spoken.some((w) => !ASKING.has(w)) ? spoken.filter((w) => !ASKING.has(w)) : spoken;
  const { docs, weight, known } = databaseIndex(data);
  const pool = only ? docs.filter((d) => d.kind === only) : docs;
  // a word no row uses is named as unmatched; it never counts against the rows that answer the rest of the question. A word that names a kind is always read.
  const usable = words.filter((t) => known.has(t) || KIND_HINT.has(t));
  const page = url('/');
  const miss = () => ({
    query: asked,
    found: false,
    message:
      `Nothing in the Leonida Lab database matches "${asked}"${only ? ` among the ${only} entries` : ''}. That does not make it true or false: ` +
      'the database holds what Leonida Lab has confirmed in the released game, so a detail that is missing here is not confirmed here. Do not present it as known.',
    covered_kinds: coveredKinds(data),
    // a player who asks for a lock and finds none is told that spoiler locks exist, or the miss would read as "there is no such lock"
    ...(only === 'safe' && spoilerLocks(data) ? { spoiler_locks: spoilerLocks(data) } : {}),
    // the same for a story question: its answers are held, so finding none says nothing about them
    ...((only === null || only === 'answer') && spoilerAnswers(data) ? { spoiler_answers: spoilerAnswers(data) } : {}),
    other_tools: OTHER_TOOLS,
    page,
    credit: credit(page),
  });
  if (!usable.length) return miss();

  const asking = new Set(words);
  // The words of the question that are not a kind's name are what the rows are matched on. A word that names a kind ("a cheat", "a weapon", "a station") asks for
  // that kind: it weighs as much as everything else the question says, a row of the kind has it met, and any other row has it only if it says it.
  const topics = usable.filter((t) => !KIND_HINT.has(t));
  const topicWeight = topics.reduce((n, t) => n + weight(t), 0);
  const w = (t) => (KIND_HINT.has(t) ? Math.max(weight(t), topicWeight) : weight(t));
  const total = usable.reduce((n, t) => n + w(t), 0);
  const scored = pool
    .map((d) => {
      const mine = usable.filter((t) => KIND_HINT.get(t) === d.kind);
      const hit = usable.filter((t) => mine.includes(t) || d.all.has(t));
      // two words of the question in one song's title or artist: it is that song or artist, and its words count in full
      const together = d.units.some((u) => topics.filter((t) => u.has(t)).length >= 2);
      const cover = hit.reduce((n, t) => n + w(t) * (d.minor.has(t) && !mine.includes(t) && !together ? 0.5 : 1), 0) / total;
      // a word that names a kind is not a point for a row's name, whichever row it is: a car answer is not closer to "how much does Randy pay for cars" than the way to make money that is
      // Randy's, and a station is not closer to "station" for being called "Radio"
      const inName = (t) => d.title.has(t) && !KIND_HINT.has(t);
      const inTitle = hit.filter(inName).reduce((n, t) => n + w(t), 0) / total;
      // how much of the row's own name the question uses: "save" is the answer called "save", not every answer that mentions it
      const titleSize = d.title.size - usable.filter((t) => d.title.has(t) && KIND_HINT.has(t)).length;
      const precision = titleSize > 0 ? usable.filter(inName).length / titleSize : 0;
      const exact = norm(d.name) === norm(asked) ? 1 : 0;
      const content = hit.filter((t) => !KIND_HINT.has(t)).reduce((n, t) => n + w(t), 0);
      // Cover first, the name second: a row that says every word of the question ("sniper rifle": a weapon) beats one that says one word and has it in its name
      // (a station called The Sniper of La Perle), and a row whose name holds most of the question beats a row that only mentions all of it
      const base = cover + inTitle + 0.5 * precision + exact + (mine.length && !topics.length ? KIND_ONLY_BONUS : 0);
      // `base` says how close a row is to what was asked; `rank` puts the rows in order: the share of the question a row says counts more, an exact name more still
      const rank = rounded(base + (COVER_WEIGHT - 1) * cover + (EXACT_BONUS - 1) * exact);
      // ties: a row named only with the question's words, then one whose name has every word of it, then the more settled row, then the shorter row (a station's songs make it the longest), then the kind order
      const tight = d.nameWords.size > 0 && [...d.nameWords].every((t) => asking.has(t)) ? 1 : 0;
      const holds = usable.every((t) => d.nameWords.has(t) || mine.includes(t)) ? 1 : 0;
      // a row has to say what the question asks for: a question that names a kind ("trophies") is not answered by a row of another kind that only shares the other words
      const meets = usable.every((t) => !KIND_HINT.has(t) || mine.includes(t) || d.all.has(t));
      const sure = STATUS_ORDER.indexOf(dbStatus(d.def.status(d.row)));
      // a spoiler row is indexed by its name alone, which makes it the shortest row there is: on a tie it comes after the rows that say something
      const spoilerRow = d.def.spoiler?.(d.row) === true ? 1 : 0;
      return { d, cover, inTitle, content, kind: mine.length > 0, base, rank, tight, holds, sure, spoilerRow, passes: (cover >= 0.5 - EPS && meets) || inTitle >= 0.4 - EPS };
    })
    .sort((a, b) => b.rank - a.rank || b.tight - a.tight || b.holds - a.holds || a.sure - b.sure || a.spoilerRow - b.spoilerRow || a.d.all.size - b.d.all.size || a.d.order - b.d.order);
  // most of the question has to be in the row, or a good part of it in the row's own name
  const passing = scored.filter((m) => m.passes);
  // a row that holds none of the question's words is there only because of its kind ("a cheat"): it shows when no row holds one, since then the kind is all there is to give
  const anyContent = passing.some((m) => m.content > 0);
  const ranked = topics.length ? passing.filter((m) => m.content > 0 || (!anyContent && m.kind)) : passing;
  if (!ranked.length) return miss();
  // a row that only brushes the question is noise next to one that answers it
  const best = Math.max(...ranked.map((m) => m.base));
  const close = ranked.filter((m) => m.base >= best * 0.55);
  const max = Math.min(Math.max(1, Math.floor(limit) || 5), 10);
  const picked = close.slice(0, max);
  // A question can name two things ("Cheetah and the Buffalo"): every word of it that some row is named by
  // brings that row's best match along.
  for (const t of usable) {
    if (picked.length >= max) break;
    if (KIND_HINT.has(t) || picked.some((m) => m.d.title.has(t))) continue;
    const named = scored.find((m) => m.d.title.has(t) && !picked.includes(m) && m.passes);
    if (named) picked.push(named);
  }
  // a word that names a kind is met by a hit of that kind
  const unmatched = words.filter((t) => !picked.some((m) => m.d.all.has(t) || KIND_HINT.get(t) === m.d.kind));
  const rest = close.length - picked.filter((m) => close.includes(m)).length;
  // a search that hits a lock says how many locks are story spoilers: none of them is a hit, and the list is where they are
  const locks = picked.some((m) => m.d.kind === 'safe') ? spoilerLocks(data) : undefined;
  return {
    query: asked,
    found: true,
    hits: picked.map((m) => hitOf(m.d)),
    ...(rest > 0 ? { more: moreText(rest, max, only) } : {}),
    ...(unmatched.length ? { unmatched_words: unmatched } : {}),
    ...(locks ? { spoiler_locks: locks } : {}),
    how_to_quote: HOW_TO_QUOTE,
    status_key: STATUS_KEY,
    kinds_searched: only ? [only] : KIND_NAMES,
    other_tools: OTHER_TOOLS,
    credit: credit(page),
  };
}

/* ---------- get_entry ---------- */

export function getEntry({ data }, { kind, slug } = {}) {
  const k = resolveKind(kind);
  const def = KINDS[k];
  const wanted = String(slug ?? '').trim().toLowerCase();
  const row = wanted ? def.rows(data).find((r) => def.slug(r) === wanted) : undefined;
  if (!row) {
    throw new ToolInputError(`There is no ${k} with the slug "${String(slug ?? '').trim()}". Call search_database to find the slug of the entry you mean.`);
  }
  const page = url(def.page(row));
  const name = def.name(row);
  if (def.spoiler?.(row)) {
    // a kind may say more of its spoiler rows than the flag: a hidden trophy's number, grade, score and group (never a name or what it asks for)
    return { kind: k, slug: def.slug(row), ...(name ? { name } : {}), spoiler: true, ...(def.spoilerFields?.(row) ?? {}), note: def.spoilerNote ?? SPOILER_NOTE, page, credit: credit(page) };
  }
  return {
    kind: k,
    slug: def.slug(row),
    name,
    ...statusFields(def.status(row)),
    ...def.entry(row, data),
    page,
    status_key: STATUS_KEY,
    credit: credit(page),
  };
}

