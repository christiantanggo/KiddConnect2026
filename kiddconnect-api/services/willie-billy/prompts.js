/**
 * Spoken scripts and picture prompts for one episode or one weekly chapter.
 * Characters stay original: blue and white, dad and son. No red-and-white costume.
 */
import OpenAI from 'openai';
import {
  artStyleForWeek,
  chapterByWeek,
  episodesForWeek,
  youtubeTitle,
} from './series.js';

const ART = {
  Painted: 'gouache painting with visible brush texture and warm light',
  'Paper cut': 'layered colored-paper illustration with soft shadows between the layers',
  Clay: 'handmade clay stop-motion set and clay figures',
  Pencil: 'colored-pencil drawing on paper with light hatching',
  'Toy blocks': 'a scene built from wooden toy blocks and painted wooden figures',
  Collage: 'a paper collage of painted scraps, not photographs of real people',
  'Real photo plate': 'a realistic photograph of an ordinary small-town place, with Willie and Billy as the only illustrated figures in it',
};

function mentions(text, name) {
  return new RegExp(`\\b${name}\\b`, 'i').test(String(text || ''));
}

function characterLock(week, text) {
  const brim = week >= 32 ? 'Billy’s cap has a yellow brim.' : 'Billy’s cap is navy.';
  const together = week >= 16
    ? 'Willie and Billy can see each other.'
    : 'Willie and Billy are in the same place.';
  const lines = [
    'Original characters only. Willie is a tall adult man with a mustache, brown shoes, a navy cap, and a shirt of vertical blue and white stripes.',
    `Billy is a short boy with yellow sneakers, the left shoe untied, a shirt of horizontal blue and white stripes, and a cap worn backwards. ${brim}`,
    together,
    'They are a father and son playing a bright, safe hide-and-seek game.',
    'Do not draw red and white stripes, a bobble hat, round glasses, or a walking cane. Do not copy any existing seek-and-find character.',
    'They stand on a sidewalk or inside a public building. They are not in a road, not in water, not inside a vehicle or a machine, and not hidden in a crowd of little kids.',
  ];
  if (week >= 42) {
    lines.push('They are not at a school and not on a playground full of children.');
  }
  if (week >= 1 && week <= 46) {
    lines.push('A small scruffy dog named Buttons sits exactly where they are hiding.');
  }
  if (mentions(text, 'Nana')) {
    lines.push('Nana June is an older woman in a plain cardigan, not in stripes.');
  }
  if (week >= 10 && mentions(text, 'Piper')) {
    lines.push('Piper is a kid with a notebook, ordinary clothes, no stripes. She is playing, not threatening anyone.');
  }
  return lines.join(' ');
}

function artLine(week) {
  const name = artStyleForWeek(week);
  return `${name} style: ${ART[name] || ART.Painted}.`;
}

export function shortNarration(episode) {
  const when = episode.slot === 'morning' ? 'Morning' : 'Night';
  const findLine = episode.format === 'Clue crop'
    ? 'Do not look for the whole town. Look for one clue.'
    : episode.format === 'Spot the difference'
      ? 'The first picture is empty of them. The second picture is the same kind of place, and they have slipped in.'
      : episode.format === 'Impostors'
        ? 'Other blue shapes are a trick. Only the tall mustache is Willie. Only the untied yellow shoe is Billy.'
        : 'Find the tall vertical stripes and the short horizontal stripes.';
  return [
    `Day ${episode.day}. ${when}. ${episode.title}.`,
    episode.happens,
    findLine,
    `This is episode ${episode.episode}.`,
  ].join(' ');
}

export function shortImagePrompts(episode) {
  const chapter = episode.chapter || chapterByWeek(episode.week);
  const place = chapter?.place || 'a small town';
  const base = [
    artLine(episode.week),
    characterLock(episode.week, `${episode.title} ${episode.happens} ${chapter?.beat || ''}`),
    `Location: ${place}. Moment: ${episode.happens}`,
    'No words, no letters, no logo, no watermark.',
  ];
  const scene = base.join(' ');

  if (episode.format === 'Spot the difference') {
    return [
      `${scene} Wide view of the place with ordinary people. Willie and Billy are not in this picture. Buttons the dog is not in this picture.`,
      `${scene} The same kind of wide view. Willie and Billy are small in the frame, easy to miss, standing together.`,
    ];
  }
  if (episode.format === 'Clue crop') {
    return [`${scene} Extreme close-up of one yellow sneaker with the lace untied, or the brim of a navy cap, or a single blue thread. Not a wide shot.`];
  }
  if (episode.format === 'Impostors') {
    return [`${scene} A busy crowd with several blue and white shirts. Only one tall man has vertical stripes and a mustache. Only one short boy has horizontal stripes and an untied yellow sneaker.`];
  }
  if (episode.format === 'Moving hide') {
    return [`${scene} Willie and Billy are mid-step, moving to a new hiding spot, still in sight of each other. The rest of the scene is busy.`];
  }
  if (episode.format === 'Hard crowded hunt') {
    return [`${scene} A very crowded public place. Willie and Billy are small, together, and easy to miss.`];
  }
  if (episode.format === 'Story' || episode.format === 'Story cold open' || episode.format === 'Tease') {
    return [`${scene} A clear story moment. Willie and Billy are readable in the frame, not tiny.`];
  }
  return [`${scene} A wide still scene. Willie and Billy are small in the crowd and in sight of each other.`];
}

export function chapterImagePrompts(week) {
  const chapter = chapterByWeek(week);
  const next = chapterByWeek(week === 52 ? 52 : week + 1);
  const lock = characterLock(week, `${chapter.title} ${chapter.beat} ${chapter.place}`);
  const style = artLine(week);
  const common = `${style} ${lock} No words, no letters, no logo, no watermark.`;
  const opening = `${common} A new scene that is not a hiding spot: ${chapter.beat} Place: ${chapter.place}. Willie and Billy are easy to see.`;
  const middle = `${common} The week’s place, ${chapter.place}, with Willie and Billy small in a wide view.`;
  const ending = week === 52
    ? `${common} An empty front porch at the end of the day. Nobody is standing there. Two loose blue threads rest on the rail.`
    : `${common} A doorway or a road leading toward next week’s place: ${next.place}. Willie and Billy are small, walking that way.`;
  return [opening, middle, ending];
}

function fallbackChapterNarration(week) {
  const chapter = chapterByWeek(week);
  const next = week < 52 ? chapterByWeek(week + 1) : null;
  const episodes = episodesForWeek(week);
  const days = episodes.map((ep) => {
    const when = ep.slot === 'morning' ? 'In the morning' : 'At night';
    return `${when} on day ${ep.day}, ${ep.title}. ${ep.happens}`;
  });
  const close = week === 52
    ? 'They step out onto the porch. The last picture is that porch with nobody on it, and two blue threads on the rail. Next year, they are outside.'
    : `Next week is ${next.title}, at ${next.place}.`;
  return [
    `Chapter ${week}. ${chapter.title}.`,
    chapter.beat,
    `This week they are in ${chapter.place}.`,
    ...days,
    close,
  ].join(' ');
}

export async function chapterNarration(week) {
  const chapter = chapterByWeek(week);
  const fallback = fallbackChapterNarration(week);
  const key = process.env.OPENAI_API_KEY;
  if (!key || !chapter) return fallback;
  const next = week < 52 ? chapterByWeek(week + 1) : null;
  const episodes = episodesForWeek(week).map((ep) => (
    `Day ${ep.day} ${ep.slot}: ${ep.title}. ${ep.format}. ${ep.happens}`
  )).join('\n');
  const piper = week < 10
    ? 'Piper does not exist yet. Do not mention her.'
    : 'Piper may appear only if this week’s beat already includes her.';
  const ending = week === 52
    ? 'End on Nana’s porch, both names spoken, and the real empty porch with two blue threads. Say that next year they are outside.'
    : `End by pointing at next week: ${next.title}, ${next.place}.`;
  try {
    const openai = new OpenAI({ apiKey: key });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: [
            'You write spoken narration for an original father-and-son hide-and-seek series called Willie and Billy.',
            'Willie is tall with vertical blue and white stripes, a navy cap, and a mustache. Billy is short with horizontal blue and white stripes, a backwards cap, yellow sneakers, and one shoe untied.',
            'Never mention Waldo, red and white stripes, a bobble hat, or glasses.',
            'A find counts only when someone says both names to their faces. Do not invent a find that the week beat does not already contain.',
            'Nana finding them never counts.',
            'They never hide in roads, water, machines, or crowds of little kids.',
            week >= 42 ? 'From this week they do not hide at schools.' : '',
            piper,
            'Write about 900 to 1100 words of plain spoken English. No stage directions, no headings, no bullet list.',
            'Open on a new scene that is not one of the shorts. Tell how the week went. Use the shorts as the middle of the story, not the whole story.',
            ending,
          ].filter(Boolean).join(' '),
        },
        {
          role: 'user',
          content: `Week ${week}: ${chapter.title}\nPlace: ${chapter.place}\nBeat: ${chapter.beat}\n\nShorts this week:\n${episodes}`,
        },
      ],
    });
    const text = String(completion.choices?.[0]?.message?.content || '').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 350) return fallback;
    return text;
  } catch (err) {
    console.warn('[WillieBilly] Chapter narration fell back:', err.message);
    return fallback;
  }
}

export function youtubeDescription(episode) {
  return [
    youtubeTitle(episode),
    episode.happens,
    'Willie and Billy. Find both of them. The tall one wears vertical stripes. The short one wears horizontal stripes.',
    `Episode ${episode.episode}.`,
  ].join('\n\n');
}
