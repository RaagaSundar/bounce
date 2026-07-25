import { create } from 'zustand'
import { MOCK_PLAYERS, QUESTIONS, JOIN_TICKER } from '../data/mock'

// ─────────────────────────────────────────────────────────────────────────────
// BOUNCE session engine.
// One tab is the "authority" (the host screen, or a solo player tab faking a
// host). The authority runs the mock crowd + game clock and broadcasts state
// over a BroadcastChannel, so /host and /play in two windows sync live with
// zero backend.
// ─────────────────────────────────────────────────────────────────────────────

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bounce-session') : null
const post = (msg) => bc && bc.postMessage(msg)

let timers = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}

export const uid = () => Math.random().toString(36).slice(2, 9)

const freshPlayer = (p) => ({ score: 0, streak: 0, ...p })

export const useSession = create((set, get) => ({
  role: null, // 'host' | 'player'
  authority: false, // does this tab run the simulation?
  connected: false, // player tab: found a live host window
  phase: 'qr', // qr → lobby → countdown → question → reveal → results
  qIndex: 0,
  deadline: 0,
  players: [],
  answers: {}, // { [qIndex]: { [playerId]: { choice, ms } } }
  reveal: null, // { counts, winner, gains, matches, synced }
  connections: [],
  meId: null,
  toasts: [],
  reactions: [],

  // ── host ──────────────────────────────────────────────────────────────────
  initHost() {
    clearTimers()
    set({ role: 'host', authority: true, phase: 'qr', qIndex: 0, players: [], answers: {}, reveal: null, connections: [], toasts: [], reactions: [] })
    broadcastState()
    // the fake crowd starts trickling in once the QR poster has had its moment
    later(() => get().startJoinSim(), 5600)
  },

  startJoinSim() {
    const { authority } = get()
    if (!authority) return
    let t = 0
    MOCK_PLAYERS.forEach((mock, i) => {
      t += i === 0 ? 0 : 700 + Math.random() * 1600
      later(() => get().addPlayer(freshPlayer(mock)), t)
    })
  },

  addPlayer(player) {
    const { players, phase } = get()
    if (players.some((p) => p.id === player.id)) return
    const line = JOIN_TICKER[players.length % JOIN_TICKER.length]
    set({
      players: [...players, player],
      phase: phase === 'qr' ? 'lobby' : phase,
      toasts: [...get().toasts.slice(-4), { id: uid(), text: `${player.name} ${line}` }],
    })
    if (get().authority) broadcastState()
  },

  // ── game clock (authority only) ───────────────────────────────────────────
  startGame() {
    clearTimers()
    set({ phase: 'countdown', qIndex: 0, answers: {}, reveal: null })
    broadcastState()
    later(() => get().startQuestion(0), 3300)
  },

  startQuestion(i) {
    const q = QUESTIONS[i]
    set({ phase: 'question', qIndex: i, deadline: Date.now() + q.time, reveal: null })
    broadcastState()
    scheduleMockAnswers(get, set, i)
    later(() => get().doReveal(), q.time + 150)
  },

  recordAnswer(playerId, qIdx, choice, ms) {
    const { answers, phase, qIndex } = get()
    if (phase !== 'question' || qIdx !== qIndex) return
    const forQ = answers[qIdx] || {}
    if (forQ[playerId]) return
    set({ answers: { ...answers, [qIdx]: { ...forQ, [playerId]: { choice, ms } } } })
  },

  doReveal() {
    const { phase, qIndex, players, answers } = get()
    if (phase !== 'question') return
    const q = QUESTIONS[qIndex]
    const forQ = answers[qIndex] || {}

    const counts = q.choices.map((_, ci) => Object.values(forQ).filter((a) => a.choice === ci).length)
    const total = Object.keys(forQ).length || 1
    const winner = counts.indexOf(Math.max(...counts))
    const winnerShare = counts[winner] / total

    const gains = {}
    const synced = {}
    const updated = players.map((p) => {
      const a = forQ[p.id]
      if (!a) return { ...p, streak: 0 }
      const didSync = a.choice === winner
      const speed = Math.round(100 * Math.max(0, 1 - a.ms / q.time))
      const streak = didSync ? p.streak + 1 : 0
      let pts = 50 + speed
      if (didSync) pts += 100 + streak * 25
      if (winnerShare >= 0.6 && didSync) pts += 40 // room-sync bonus
      gains[p.id] = pts
      synced[p.id] = didSync
      return { ...p, score: p.score + pts, streak }
    })

    // who picked the same thing as whom → the connection engine
    const matches = {}
    players.forEach((p) => {
      const a = forQ[p.id]
      if (!a) return
      matches[p.id] = players.filter((o) => o.id !== p.id && forQ[o.id]?.choice === a.choice).map((o) => o.id)
    })

    set({ phase: 'reveal', players: updated, reveal: { counts, winner, winnerShare, gains, matches, synced } })
    broadcastState()

    later(() => {
      const next = qIndex + 1
      if (next < QUESTIONS.length) get().startQuestion(next)
      else get().finish()
    }, 5200)
  },

  finish() {
    const { players, answers } = get()
    const conns = computeConnections(players, answers)
    set({ phase: 'results', connections: conns })
    broadcastState()
  },

  playAgain() {
    clearTimers()
    const reset = get().players.map((p) => ({ ...p, score: 0, streak: 0 }))
    set({ phase: 'lobby', qIndex: 0, players: reset, answers: {}, reveal: null, connections: [] })
    broadcastState()
  },

  // ── player ────────────────────────────────────────────────────────────────
  initPlayer() {
    clearTimers()
    set({ role: 'player', authority: false, connected: false, phase: 'qr', players: [], answers: {}, reveal: null, connections: [], meId: null })
    post({ type: 'hello' })
    // no host window answered → this tab quietly becomes its own host
    later(() => {
      if (!get().connected && !get().authority) set({ authority: true })
    }, 1200)
  },

  joinAs(me) {
    const player = freshPlayer({ ...me, id: get().meId || uid(), isMe: true })
    set({ meId: player.id })
    if (get().authority) {
      get().addPlayer(player)
      get().startJoinSim()
      // solo mode: the invisible "host" starts the game once the room fills
      later(() => {
        if (get().authority && (get().phase === 'lobby' || get().phase === 'qr')) get().startGame()
      }, 14000)
    } else {
      post({ type: 'join', player: { ...player, isMe: undefined } })
      set({ players: [...get().players.filter((p) => p.id !== player.id), player] })
    }
  },

  answer(choice) {
    const { meId, qIndex, deadline, authority } = get()
    if (!meId) return
    const q = QUESTIONS[qIndex]
    const ms = Math.min(q.time, Math.max(150, q.time - (deadline - Date.now())))
    if (authority) get().recordAnswer(meId, qIndex, choice, ms)
    else post({ type: 'answer', playerId: meId, qIndex, choice, ms })
    // optimistic local echo so the phone reacts instantly
    const forQ = get().answers[qIndex] || {}
    if (!forQ[meId]) set({ answers: { ...get().answers, [qIndex]: { ...forQ, [meId]: { choice, ms } } } })
  },

  react(emoji) {
    const { meId, players } = get()
    const me = players.find((p) => p.id === meId)
    post({ type: 'react', emoji, name: me?.name || 'someone' })
    get().pushReaction(emoji)
  },

  pushReaction(emoji) {
    const r = { id: uid(), emoji, x: 8 + Math.random() * 84 }
    set({ reactions: [...get().reactions.slice(-24), r] })
  },
}))

// mock crowd answers stream in over the question window
function scheduleMockAnswers(get, set, qIdx) {
  const q = QUESTIONS[qIdx]
  get()
    .players.filter((p) => !p.isMe)
    .forEach((p) => {
      const ms = 700 + p.speed * (q.time - 2200) + Math.random() * 900
      let choice
      if (q.lean === 'arena') choice = p.arena
      else {
        const r = Math.random()
        let acc = 0
        choice = q.lean.findIndex((share) => (acc += share) > r)
        if (choice < 0) choice = 0
      }
      later(() => get().recordAnswer(p.id, qIdx, choice, ms), ms)
    })
}

function computeConnections(players, answers) {
  const pairs = {}
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  Object.values(answers).forEach((forQ) => {
    const ids = Object.keys(forQ)
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (forQ[ids[i]].choice === forQ[ids[j]].choice) pairs[key(ids[i], ids[j])] = (pairs[key(ids[i], ids[j])] || 0) + 1
  })
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  return Object.entries(pairs)
    .map(([k, sameAnswers]) => {
      const [aId, bId] = k.split('|')
      const a = byId[aId]
      const b = byId[bId]
      if (!a || !b) return null
      const shared = (a.interests || []).filter((x) => (b.interests || []).includes(x))
      return { a: aId, b: bId, sameAnswers, shared, score: sameAnswers * 2 + shared.length * 3 }
    })
    .filter(Boolean)
    .sort((x, y) => y.score - x.score)
}

function broadcastState() {
  const s = useSession.getState()
  post({
    type: 'state',
    phase: s.phase,
    qIndex: s.qIndex,
    deadline: s.deadline,
    players: s.players.map(({ isMe, ...p }) => p),
    reveal: s.reveal,
    connections: s.connections,
  })
}

// dev/demo handle: lets you drive the session from the console
if (typeof window !== 'undefined') window.__bounce = useSession

if (bc) {
  bc.onmessage = ({ data }) => {
    const s = useSession.getState()
    const authority = s.authority && s.role === 'host'
    switch (data.type) {
      case 'hello':
        if (authority) broadcastState()
        break
      case 'join':
        if (authority) s.addPlayer(freshPlayer(data.player))
        break
      case 'answer':
        if (authority) s.recordAnswer(data.playerId, data.qIndex, data.choice, data.ms)
        break
      case 'react':
        if (s.role === 'host') s.pushReaction(data.emoji)
        break
      case 'state': {
        if (s.role !== 'player') break
        // a live host exists — follow it instead of self-simulating,
        // unless our solo game is already past the lobby
        if (s.authority && !['qr', 'lobby'].includes(s.phase)) break
        if (s.authority) clearTimers()
        const players = data.players.map((p) => (p.id === s.meId ? { ...p, isMe: true } : p))
        useSession.setState({
          connected: true,
          authority: false,
          phase: data.phase,
          qIndex: data.qIndex,
          deadline: data.deadline,
          players,
          reveal: data.reveal,
          connections: data.connections,
        })
        break
      }
    }
  }
}
