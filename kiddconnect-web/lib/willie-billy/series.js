/**
 * Willie & Billy — one-year series bible.
 * Two shorts a day (morning hide, night almost) and one weekly chapter.
 * Weeks 1–51 are 7 days. Week 52 is 8 days so Day 365 lands in the finale.
 */

export const SERIES = {
  title: 'Willie & Billy',
  moduleKey: 'willie-billy',
  logline:
    'Billy bets his dad, Willie, that they can hide every morning and every night for a year. If they make it, the next year happens outside, in the real world. The viewers are the seekers.',
  town: 'Marrow',
  shorts: 730,
  chapters: 52,
  days: 365,
};

export const SEASONS = [
  {
    id: 1,
    name: 'The Bet',
    from: 1,
    to: 13,
    summary: 'They learn the rules at home in Marrow. Piper does not exist yet.',
  },
  {
    id: 2,
    name: 'The Road',
    from: 14,
    to: 26,
    summary: 'They leave town. Piper stays about a day behind them, then gets a real find.',
  },
  {
    id: 3,
    name: 'Almost',
    from: 27,
    to: 39,
    summary: 'Summer. Fewer crowds, a harder game, and the second find on a train home.',
  },
  {
    id: 4,
    name: 'The Real Door',
    from: 40,
    to: 52,
    summary: 'They circle back to Marrow. The last month the backgrounds become real photos.',
  },
];

export const CHARACTERS = [
  {
    name: 'Willie',
    role: 'Dad',
    look: 'Tall. Vertical blue-and-white stripes, navy cap, mustache, brown shoes. Calm, and a little afraid Billy will get bored of him.',
  },
  {
    name: 'Billy',
    role: 'Son',
    look: 'Short. Horizontal blue-and-white stripes, cap backwards, yellow sneakers, left shoe untied. After the ballpark (Week 31) the cap has a yellow brim.',
  },
  {
    name: 'Buttons',
    role: 'Dog',
    look: 'Sits exactly where they are hiding. Goes on the road with them, then stays with Nana from Week 47.',
  },
  {
    name: 'Nana June',
    role: 'Willie’s mom',
    look: 'The only person who can always find them. It never counts. She feeds them and tells Piper almost nothing.',
  },
  {
    name: 'Piper',
    role: 'Seeker',
    look: 'A kid with a notebook of near-misses. First appears in Week 10. She is playing, not hunting them to be cruel.',
  },
];

export const RULES = [
  'They hide together, and from Week 16 they stay in sight of each other.',
  'Two hides a day: morning and night. Each one is its own episode.',
  'A find counts only when someone says both names to their faces. Being noticed is not enough.',
  'Three finds and the bet is lost.',
  'Nana finding them does not count.',
  'They never hide in roads, water, machines, or in a crowd of little kids.',
  'From Week 42 they do not hide at schools.',
  'Stripes never swap: Willie vertical, Billy horizontal.',
];

export const FINDS = [
  { week: 26, n: 1, text: 'Piper grabs Billy’s sleeve at the festival. Willie rules that a touch counts.' },
  { week: 39, n: 2, text: 'On the train she says both names. One find left.' },
  { week: 52, n: 3, text: 'Day 365, Nana’s porch. They come out. The real-world year was always the plan.' },
];

export const CONTINUITY = [
  { label: 'No Piper', detail: 'Weeks 1–9. She has not been invented yet.' },
  { label: 'Piper’s thread', detail: 'Week 10 she tapes a blue thread into the notebook. After that she only appears when the chapter says she has caught up.' },
  { label: 'Stay in sight', detail: 'From Week 16, after Willie loses Billy in the station.' },
  { label: 'Hat', detail: 'Old cap through the Week 31 ballpark. Yellow brim from the next morning.' },
  { label: 'Find count', detail: 'None, then one after Week 26, then two after Week 39, then three on Day 365.' },
  { label: 'Buttons', detail: 'On the road from Week 13. Back with Nana from Week 47.' },
  { label: 'Real plates', detail: 'Weeks 48–52 use photographs. Lock the real filming town before you make Week 48.' },
];

const ART_STYLES = ['Painted', 'Paper cut', 'Clay', 'Pencil', 'Toy blocks', 'Collage'];

const MORNING_FORMATS = [
  'Still hunt',
  'Moving hide',
  'Slow still hunt',
  'Impostors',
  'Spot the difference',
  'Hard crowded hunt',
  'Story cold open',
];

const NIGHT_FORMATS = [
  'Story',
  'Impostors',
  'Spot the difference',
  'Moving hide',
  'Story',
  'Clue crop',
  'Tease',
];

export const CHAPTERS = [
  { week: 1, season: 1, title: 'The Bet', place: 'Their street in Marrow', beat: 'Rules go on a napkin at breakfast. Buttons eats the corner. They hide in their own town to prove the year is possible.' },
  { week: 2, season: 1, title: 'Too Tall for the Cubby', place: 'The school', beat: 'Willie gets stuck in a cubby. Buttons sits in front of the locker and almost gives them away.' },
  { week: 3, season: 1, title: 'Aisle Nine', place: 'Grocery and the mall', beat: 'Billy risks the night hide for a cereal prize. Nana covers for them.' },
  { week: 4, season: 1, title: 'Footprints', place: 'The snow park', beat: 'Their tracks give them away, so they start moving only on shoveled paths.' },
  { week: 5, season: 1, title: 'Nana Already Knows', place: 'Nana’s house and bingo night', beat: 'She can always find them and will never turn them in.' },
  { week: 6, season: 1, title: 'Do Not Touch the Bones', place: 'The museum', beat: 'A guard walks past the fossil display. Guards do not count unless they say both names.' },
  { week: 7, season: 1, title: 'The Boring Places', place: 'The bus depot', beat: 'Seekers look at the exciting thing, so Willie and Billy stand next to it.' },
  { week: 8, season: 1, title: 'Blue on Blue', place: 'The rain and the pool', beat: 'Their stripes vanish against the pool tiles. Willie worries the year will be too easy, and that Billy will get bored of him.' },
  { week: 9, season: 1, title: 'One Ticket, Two Seats', place: 'The old theater', beat: 'They hide in a movie and watch the whole thing. The bet is an excuse to spend the year together.' },
  { week: 10, season: 1, title: 'The Girl with the Notebook', place: 'The skate park', beat: 'Piper tapes a blue thread into a notebook. She does not find them.' },
  { week: 11, season: 1, title: 'Too Close', place: 'Piper’s school carnival', beat: 'She walks right past Billy. His hat falls off after she is gone. New rule: never hide in the seeker’s neighborhood.' },
  { week: 12, season: 1, title: 'The Town Line', place: 'Fields, water tower, tree lot', beat: 'Billy asks if the bet allows leaving. Willie says the bet allows anywhere.' },
  { week: 13, season: 1, title: 'We Can Come Back', place: 'Nana’s kitchen, then the town line', beat: 'They pack a small bag. Buttons comes with them. They step past the town line at night.' },
  { week: 14, season: 2, title: 'Two Seats in the Back', place: 'The night bus', beat: 'First morning hide away from home. Billy is thrilled. Willie checks the map twice.' },
  { week: 15, season: 2, title: 'Fog Is a Friend', place: 'The harbor and fish market', beat: 'Fog makes hides easy. Willie hates that he cannot see Billy.' },
  { week: 16, season: 2, title: 'Every Platform', place: 'The big train station', beat: 'Willie loses Billy between platforms. From now on they stay in sight of each other.' },
  { week: 17, season: 2, title: 'The Wrong Pig', place: 'A small county fair', beat: 'Striped shirts everywhere. Nana’s postcard says she told Piper “north.”' },
  { week: 18, season: 2, title: 'Quiet Counts', place: 'The pines', beat: 'Night hides are owls and flashlights. Billy wants one night at home and does not say it.' },
  { week: 19, season: 2, title: 'Nobody Looks Up', place: 'A college town', beat: 'A painter paints around them. Billy leaves Piper a drawing on purpose.' },
  { week: 20, season: 2, title: 'Under the Bridge', place: 'The river docks', beat: 'Piper is on the boat tour. They watch her write “I am getting closer.”' },
  { week: 21, season: 2, title: 'The Giant', place: 'The white flats', beat: 'Billy hides on a roadside statue. They argue, then do the night hide without speaking.' },
  { week: 22, season: 2, title: 'Sorry Is a Clue', place: 'A small-town parade', beat: 'Willie’s apology snack becomes the next page in Piper’s notebook. She is one day behind.' },
  { week: 23, season: 2, title: 'The Light Turns', place: 'The lighthouse coast', beat: 'The beam exposes them every few seconds. Billy thinks it is the best week of the year.' },
  { week: 24, season: 2, title: 'Which Reflection', place: 'Glass City', beat: 'Piper takes the wrong bus. They gain two days. Willie feels bad about an unfair lead.' },
  { week: 25, season: 2, title: 'Too Many Stripes', place: 'A music festival', beat: 'A band is dressed like them. Piper spots the untied shoe and grabs Billy’s sleeve. Cliffhanger.' },
  { week: 26, season: 2, title: 'One Find', place: 'A rainy overpass', beat: 'Willie counts the touch. Find one of three. No more snacks, no more drawings. They head for the hills.', find: 1 },
  { week: 27, season: 3, title: 'No Crowds', place: 'The trailheads', beat: 'A hiker says “nice shirts” and walks on. Noticed is not the same as found.' },
  { week: 28, season: 3, title: 'Billy Won’t Get Out', place: 'The lake', beat: 'Willie lets the morning hide run long. Billy could stay all summer.' },
  { week: 29, season: 3, title: 'Visiting Day', place: 'High Camp', beat: 'Other kids’ parents arrive. Billy watches, then hugs Willie in the hiding spot.' },
  { week: 30, season: 3, title: 'Keep Out', place: 'The dam', beat: 'They do not cross fences. A worker is the closest they come to real trouble.' },
  { week: 31, season: 3, title: 'Extra Innings', place: 'The valley ballpark', beat: 'Piper says “Billy” to an empty hat. It does not count. He wears a yellow-brim cap from the next morning.' },
  { week: 32, season: 3, title: 'Echo', place: 'The caves', beat: 'Talking gets you found, so they use hand signals. A quiet week.' },
  { week: 33, season: 3, title: 'The Pie Truce', place: 'The orchards', beat: 'Nana mails a pie and asks Willie to let Piper catch up a little. He does not answer.' },
  { week: 34, season: 3, title: 'Lights Out, Lights On', place: 'The night market', beat: 'The best hides of the year. Billy says out loud that he does not want the year to end.' },
  { week: 35, season: 3, title: 'The Maze', place: 'The fairgrounds', beat: 'Piper says “Billy” in the mirror maze, then grabs the wrong striped kid.' },
  { week: 36, season: 3, title: 'One Left', place: 'Highway motels', beat: 'Willie admits the real world is waiting either way. The prize was never only for winning.' },
  { week: 37, season: 3, title: 'Look Up', place: 'The balloon field', beat: 'Piper looks at the sky. They are at the ticket booth. Billy almost waves.' },
  { week: 38, season: 3, title: 'The Long Way Home', place: 'The river, downstream', beat: 'Billy recognizes a bird from home. Willie has already bought tickets toward Marrow.' },
  { week: 39, season: 3, title: 'She Said Both Names', place: 'The train toward Marrow', beat: 'Piper sits across the aisle and names them. Find two of three. She stays on the train, smiling.', find: 2 },
  { week: 40, season: 4, title: 'Not Our Street', place: 'Towns that only look like Marrow', beat: 'Every porch feels like Nana’s. Homesick comedy. Buttons sleeps more.' },
  { week: 41, season: 4, title: 'These Aren’t Costumes', place: 'Halloween town', beat: 'Everyone thinks the stripes are a costume. Piper follows a day behind in a ghost sheet.' },
  { week: 42, season: 4, title: 'We Don’t Hide at Schools Anymore', place: 'The highway and a closed recess', beat: 'Willie says the game is theirs. They do not borrow little kids’ recess.' },
  { week: 43, season: 4, title: 'The Whole Stack', place: 'A laundromat', beat: 'They read Nana’s letters. Billy decides Piper can have the last find, at home.' },
  { week: 44, season: 4, title: 'There It Is', place: 'The hill before Marrow', beat: 'They can see their water tower. They stay on the outskirts. Willie is not ready for the year to end.' },
  { week: 45, season: 4, title: 'The Town Line, Again', place: 'The same fields as Week 12', beat: 'Coming home is not the same as losing. They kept the promise to each other.' },
  { week: 46, season: 4, title: 'Same Corners', place: 'The Week 1 corners', beat: 'Store, park, bus stop. The baker never knew it was a game. Only Piper was seeking. And the audience.' },
  { week: 47, season: 4, title: 'Bad at This Now', place: 'Nana’s house', beat: 'Nana finds them instantly and it still does not count. Piper mails the notebook ahead: “see you at home.” Buttons stays.' },
  { week: 48, season: 4, title: 'The Background Went Real', place: 'Nana’s photographs', beat: 'The world becomes real photos. Willie and Billy are still drawn. In the story, these are Nana’s pictures of places like the ones they saw.' },
  { week: 49, season: 4, title: 'Our Street, For Real', place: 'The real town you will film', beat: 'Same idea, closer to the streets you will actually use next year. Lock that town before this week is made.' },
  { week: 50, season: 4, title: 'She Knows the Corners', place: 'Marrow, with Piper walking it', beat: 'Split screens all week. She walks the Day 1 spots and misses three times.' },
  { week: 51, season: 4, title: 'Threads', place: 'Every Week 1 spot', beat: 'They leave a blue thread in each spot and decide to wait on Nana’s porch.' },
  { week: 52, season: 4, title: 'Come Out', place: 'Nana’s porch', beat: 'Day 365. Piper says both names. Find three. Willie says the year together was the prize, and outside was always the plan.', find: 3 },
];

const WEEK_ONE = [
  { day: 1, slot: 'morning', format: 'Still hunt', title: 'The Bet Starts', happens: 'Cereal, the napkin, then they hide in the coats by the door.' },
  { day: 1, slot: 'night', format: 'Story', title: 'Too Dusty', happens: 'Hall closet. Billy sneezes.' },
  { day: 2, slot: 'morning', format: 'Moving hide', title: 'The Bus Didn’t Stop', happens: 'They slip behind the shelter as the bus pulls in.' },
  { day: 2, slot: 'night', format: 'Impostors', title: 'Not Every Blue Shirt', happens: 'Three blue shirts in the corner store. Only Willie has the mustache.' },
  { day: 3, slot: 'morning', format: 'Slow still hunt', title: 'Behind the Slide', happens: 'Wide winter park.' },
  { day: 3, slot: 'night', format: 'Spot the difference', title: 'The Park Blinked', happens: 'Empty park, then the same frame with them in it.' },
  { day: 4, slot: 'morning', format: 'Impostors', title: 'Story Hour', happens: 'Library. Other kids are in striped pajamas.' },
  { day: 4, slot: 'night', format: 'Moving hide', title: 'Willie Doesn’t Fit', happens: 'He tries the returns alcove and loses.' },
  { day: 5, slot: 'morning', format: 'Spot the difference', title: 'Nana’s Porch', happens: 'Rocker, then two figures.' },
  { day: 5, slot: 'night', format: 'Story', title: 'She Saw Us', happens: 'Nana opens the door, sees them, and says nothing.' },
  { day: 6, slot: 'morning', format: 'Hard crowded hunt', title: 'The Saturday Crowd', happens: 'Market, short timer.' },
  { day: 6, slot: 'night', format: 'Clue crop', title: 'One Shoe', happens: 'A tight crop: a yellow sneaker and a blue thread.' },
  { day: 7, slot: 'morning', format: 'Story cold open', title: 'One Bun', happens: 'They hide in the bakery line.' },
  { day: 7, slot: 'night', format: 'Tease', title: 'School on Monday', happens: 'Alley hide, then a one-second look at the school.' },
];

const WEEK_FIFTY_TWO = [
  { day: 358, slot: 'morning', format: 'Still hunt', title: 'The Coats Again', happens: 'The door from Day 1. Winter light, same hooks.' },
  { day: 358, slot: 'night', format: 'Story', title: 'Piper at the Door', happens: 'She checks the coats a little later and misses them.' },
  { day: 359, slot: 'morning', format: 'Moving hide', title: 'The Shelter', happens: 'Bus stop. They know the timing now.' },
  { day: 359, slot: 'night', format: 'Impostors', title: 'Her Turn at the Stop', happens: 'Piper waits for a bus they are not on.' },
  { day: 360, slot: 'morning', format: 'Slow still hunt', title: 'The Slide in Winter', happens: 'The park from Day 3, under new snow.' },
  { day: 360, slot: 'night', format: 'Spot the difference', title: 'She Circles the Slide', happens: 'Same frame, Piper in it, them already gone.' },
  { day: 361, slot: 'morning', format: 'Impostors', title: 'Story Hour, Quiet', happens: 'The library. No pajama crowd this time. Just shelves.' },
  { day: 361, slot: 'night', format: 'Moving hide', title: 'The Returns Door', happens: 'Piper tries the alcove Willie never fit.' },
  { day: 362, slot: 'morning', format: 'Spot the difference', title: 'The Rocker', happens: 'Nana’s porch before anyone sits down.' },
  { day: 362, slot: 'night', format: 'Story', title: 'Not Tonight', happens: 'Piper walks up the steps and leaves. The porch stays empty.' },
  { day: 363, slot: 'morning', format: 'Hard crowded hunt', title: 'Saturday, Last Time', happens: 'The market. Hardest crowd of the homecoming.' },
  { day: 363, slot: 'night', format: 'Clue crop', title: 'A Thread on a Crate', happens: 'Tight crop. One blue thread. She pockets it.' },
  { day: 364, slot: 'morning', format: 'Story cold open', title: 'The Bun They Don’t Buy', happens: 'Bakery line. They hide, and they do not order.' },
  { day: 364, slot: 'night', format: 'Tease', title: 'She Asks the Baker', happens: 'The baker says he has not seen them. He is wrong, kindly.' },
  { day: 365, slot: 'morning', format: 'Hard crowded hunt', title: 'The Whole Town', happens: 'The hardest hunt of the year. All of Marrow in one frame. Both of them are in it.' },
  { day: 365, slot: 'night', format: 'Story', title: 'Come Out', happens: 'Nana’s porch. No timer. Piper says both names. They step out. Last shot: a real empty porch, two threads on the rail.' },
];

const SCRIPTED = { 1: WEEK_ONE, 52: WEEK_FIFTY_TWO };

export function seasonForWeek(week) {
  return SEASONS.find((s) => week >= s.from && week <= s.to) || SEASONS[0];
}

export function chapterByWeek(week) {
  return CHAPTERS.find((c) => c.week === week) || null;
}

export function daysInWeek(week) {
  return week === 52 ? 8 : 7;
}

export function startDay(week) {
  if (week < 1 || week > 52) return null;
  if (week === 52) return 358;
  return (week - 1) * 7 + 1;
}

export function artStyleForWeek(week) {
  if (week >= 48) return 'Real photo plate';
  return ART_STYLES[(week - 1) % ART_STYLES.length];
}

export function episodeNumber(day, slot) {
  const base = (day - 1) * 2;
  return slot === 'morning' ? base + 1 : base + 2;
}

export function youtubeTitle(episode) {
  const when = episode.slot === 'morning' ? 'Morning' : 'Night';
  return `Day ${episode.day} ${when} | ${episode.title} | Willie & Billy`;
}

function generatedEpisode(chapter, day, slot, indexInWeek) {
  const format = slot === 'morning' ? MORNING_FORMATS[indexInWeek] : NIGHT_FORMATS[indexInWeek];
  const place = chapter.place;
  const titles = {
    'Still hunt': `${place}, wide`,
    'Moving hide': `They move through ${place}`,
    'Slow still hunt': `Hold on ${place}`,
    Impostors: `Other stripes in ${place}`,
    'Spot the difference': `${place} blinks`,
    'Hard crowded hunt': `The crowd at ${place}`,
    'Story cold open': chapter.title,
    Story: `Why ${place}`,
    'Clue crop': `One clue in ${place}`,
    Tease: 'Tomorrow’s door',
  };
  const happens = {
    'Still hunt': `Wide morning hunt in ${place}. ${chapter.beat}`,
    'Moving hide': `They duck and relocate inside ${place}. The viewer has to track them.`,
    'Slow still hunt': `A slower zoom through ${place}. Same pair, different pacing from the wide hunt.`,
    Impostors: `Other blue-and-white shapes in ${place}. Only Willie is vertical stripes with the mustache. Only Billy has the untied shoe.`,
    'Spot the difference': `${place} without them, then the same frame with them slipped in.`,
    'Hard crowded hunt': `Short timer. ${place} is busy. They are together and in sight of each other.`,
    'Story cold open': chapter.beat,
    Story: `Twenty seconds on why this spot, then the hide. ${chapter.beat}`,
    'Clue crop': `Tight crop in ${place}: a yellow sneaker, a navy cap, or one blue thread. Not the whole scene.`,
    Tease: `Last hide of the week in ${place}, then a one-second look at next week.`,
  };
  return {
    day,
    slot,
    format,
    title: titles[format] || chapter.title,
    happens: happens[format] || chapter.beat,
  };
}

export function episodesForWeek(week) {
  const chapter = chapterByWeek(week);
  if (!chapter) return [];
  const scripted = SCRIPTED[week];
  if (scripted) {
    return scripted.map((ep) => ({
      ...ep,
      episode: episodeNumber(ep.day, ep.slot),
      week,
    }));
  }
  const first = startDay(week);
  const count = daysInWeek(week);
  const episodes = [];
  for (let i = 0; i < count; i += 1) {
    const day = first + i;
    for (const slot of ['morning', 'night']) {
      episodes.push({
        ...generatedEpisode(chapter, day, slot, i),
        episode: episodeNumber(day, slot),
        week,
      });
    }
  }
  return episodes;
}

export function weekRangeLabel(week) {
  const first = startDay(week);
  const last = first + daysInWeek(week) - 1;
  const eps = episodesForWeek(week);
  return {
    days: `Days ${first}–${last}`,
    episodes: `Episodes ${eps[0].episode}–${eps[eps.length - 1].episode}`,
  };
}

export function longformBrief(week) {
  const chapter = chapterByWeek(week);
  const next = chapterByWeek(week === 52 ? 1 : week + 1);
  if (!chapter) return null;
  const ending = week === 52
    ? 'End on the real empty porch and the card: next year, they’re outside.'
    : `End by pointing at next week: ${next.title}, ${next.place}.`;
  return {
    title: `Chapter ${chapter.week}: ${chapter.title}`,
    runtime: '8–12 minutes',
    rules: [
      'Open on a new scene that is not in any short.',
      'Narrate how the week actually went.',
      'Use clips from the shorts for less than a third of the runtime.',
      ending,
    ],
    beat: chapter.beat,
  };
}

export function findStatus(week) {
  if (week >= 52) return 'Three finds. The bet is over.';
  if (week >= 39) return 'Two finds. One left.';
  if (week >= 26) return 'One find. Two left.';
  return 'No finds yet.';
}

export function searchSeries(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { chapters: [], episodes: [] };
  const asNum = /^\d+$/.test(q) ? Number(q) : null;
  const chapters = [];
  const episodes = [];

  for (const chapter of CHAPTERS) {
    const range = weekRangeLabel(chapter.week);
    const chapterHay = `${chapter.title} ${chapter.place} ${chapter.beat} ${range.days} ${range.episodes}`.toLowerCase();
    const weekHit = asNum === chapter.week || chapterHay.includes(q);
    if (weekHit && asNum == null) chapters.push(chapter);

    for (const ep of episodesForWeek(chapter.week)) {
      const exact = asNum != null && (asNum === ep.day || asNum === ep.episode);
      const hay = `${ep.title} ${ep.happens} ${ep.format} ${youtubeTitle(ep)}`.toLowerCase();
      if (exact || (asNum == null && hay.includes(q))) {
        episodes.push({ ...ep, chapterTitle: chapter.title });
      }
    }
    if (asNum === chapter.week) chapters.push(chapter);
  }

  return {
    chapters: chapters.slice(0, 12),
    episodes: episodes.slice(0, 24),
  };
}

export function assertSeries() {
  if (CHAPTERS.length !== 52) throw new Error(`expected 52 chapters, got ${CHAPTERS.length}`);
  let shorts = 0;
  let lastEpisode = 0;
  for (let week = 1; week <= 52; week += 1) {
    const eps = episodesForWeek(week);
    const expected = daysInWeek(week) * 2;
    if (eps.length !== expected) throw new Error(`week ${week} has ${eps.length} episodes`);
    shorts += eps.length;
    lastEpisode = eps[eps.length - 1].episode;
  }
  if (shorts !== 730 || lastEpisode !== 730) {
    throw new Error(`expected 730 shorts ending at 730, got ${shorts} ending ${lastEpisode}`);
  }
  const finale = episodesForWeek(52).find((ep) => ep.day === 365 && ep.slot === 'night');
  if (!finale || finale.episode !== 730) throw new Error('Day 365 night is not episode 730');
  return { shorts, lastEpisode };
}
