// All the fake life in the demo lives here: the crowd, the questions, the avatar kit.

export const AVATAR_FACES = ['🦊', '🐸', '🐙', '🦉', '🐯', '🐼', '🦄', '🐨', '🦁', '🐺', '🐢', '🐰', '🦅', '🐬', '🐝', '🦕', '👾', '🤖', '👽', '🔥']

export const AVATAR_HUES = [265, 320, 200, 150, 85, 35, 0, 230]

export const INTERESTS = [
  'AI agents',
  'Robotics',
  'Design systems',
  'Fintech',
  'Climate',
  'Gaming',
  'DevTools',
  'Music tech',
  'AR / VR',
  'Health',
  'Data viz',
  'Security',
]

export const VIBE_TAGS = [
  'Building something',
  'Hiring',
  'Job hunting',
  'Investing',
  'Just curious',
  'First event ever',
]

// arena maps to question 3's four choices so mock answers stay coherent
export const MOCK_PLAYERS = [
  { id: 'p1', name: 'Priya', face: '🦊', hue: 320, tag: 'Building agents @ stealth', interests: ['AI agents', 'Robotics', 'DevTools'], arena: 0, speed: 0.25 },
  { id: 'p2', name: 'Diego', face: '🐸', hue: 85, tag: 'Fintech founder', interests: ['Fintech', 'Data viz'], arena: 2, speed: 0.5 },
  { id: 'p3', name: 'Yuki', face: '🐙', hue: 200, tag: 'Design engineer', interests: ['Design systems', 'AR / VR', 'Gaming'], arena: 1, speed: 0.35 },
  { id: 'p4', name: 'Marcus', face: '🦉', hue: 265, tag: 'ML researcher', interests: ['AI agents', 'Data viz', 'Health'], arena: 0, speed: 0.7 },
  { id: 'p5', name: 'Zara', face: '🐯', hue: 35, tag: 'Biotech PhD → founder', interests: ['Health', 'Climate'], arena: 3, speed: 0.45 },
  { id: 'p6', name: 'Ana', face: '🐼', hue: 150, tag: 'Climate angel investor', interests: ['Climate', 'Fintech', 'Robotics'], arena: 3, speed: 0.8 },
  { id: 'p7', name: 'Sam', face: '🦄', hue: 230, tag: 'DevTools @ big co', interests: ['DevTools', 'AI agents', 'Security'], arena: 0, speed: 0.3 },
  { id: 'p8', name: 'Leila', face: '🐨', hue: 0, tag: 'Indie game dev', interests: ['Gaming', 'Music tech', 'AR / VR'], arena: 1, speed: 0.55 },
  { id: 'p9', name: 'Tomás', face: '🦁', hue: 35, tag: 'Edtech PM', interests: ['Design systems', 'Health'], arena: 1, speed: 0.65 },
  { id: 'p10', name: 'Ingrid', face: '🐺', hue: 200, tag: 'Security researcher', interests: ['Security', 'DevTools', 'AI agents'], arena: 0, speed: 0.4 },
  { id: 'p11', name: 'Kofi', face: '🐢', hue: 150, tag: 'Music tech tinkerer', interests: ['Music tech', 'Gaming'], arena: 1, speed: 0.75 },
  { id: 'p12', name: 'Mei', face: '🐰', hue: 320, tag: 'AR startup #2 hire', interests: ['AR / VR', 'Design systems', 'Robotics'], arena: 1, speed: 0.5 },
]

// Rapid-fire "SYNC OR CLASH" — match the room, ride the streak.
export const QUESTIONS = [
  {
    id: 'q1',
    kicker: 'warm-up',
    text: 'Founder morning starts with…',
    choices: [
      { label: 'Coffee', emoji: '☕', hue: 35 },
      { label: 'Tea', emoji: '🍵', hue: 150 },
    ],
    lean: [0.72, 0.28],
    time: 8000,
  },
  {
    id: 'q2',
    kicker: 'crunch time',
    text: 'Demo day is in 48h. You…',
    choices: [
      { label: 'Build the demo', emoji: '🛠️', hue: 265 },
      { label: 'Polish the deck', emoji: '📊', hue: 200 },
    ],
    lean: [0.64, 0.36],
    time: 8000,
  },
  {
    id: 'q3',
    kicker: 'pick your arena',
    text: 'Where does your heart actually live?',
    choices: [
      { label: 'AI & Robots', emoji: '🤖', hue: 265 },
      { label: 'Design & Play', emoji: '🎨', hue: 320 },
      { label: 'Money Moves', emoji: '💸', hue: 85 },
      { label: 'Deep Science', emoji: '🧬', hue: 200 },
    ],
    lean: 'arena',
    time: 10000,
  },
  {
    id: 'q4',
    kicker: 'holy war',
    text: 'Tabs or spaces?',
    choices: [
      { label: 'Tabs', emoji: '⇥', hue: 0 },
      { label: 'Spaces', emoji: '␣', hue: 200 },
    ],
    lean: [0.45, 0.55],
    time: 7000,
  },
  {
    id: 'q5',
    kicker: 'networking meta',
    text: 'How do you actually meet people?',
    choices: [
      { label: 'Cold DM energy', emoji: '🧊', hue: 200 },
      { label: 'Warm intros only', emoji: '🔥', hue: 35 },
    ],
    lean: [0.38, 0.62],
    time: 8000,
  },
  {
    id: 'q6',
    kicker: 'final call',
    text: 'It works on your machine, Friday 5pm. Ship it?',
    choices: [
      { label: 'SHIP IT', emoji: '🚀', hue: 320 },
      { label: 'Monday. Obviously.', emoji: '🛑', hue: 265 },
    ],
    lean: [0.55, 0.45],
    time: 8000,
  },
]

export const REACTIONS = ['FIRE', 'LOL', 'WOW', '100', 'EYES']

export const SESSION_CODE = 'BNCE-42'

export const JOIN_TICKER = [
  'scanned from the back row',
  'sprinted from the snack table',
  'is here for the plot',
  'brought main-character energy',
  'joined mid-handshake',
  'left a conversation for this',
]
