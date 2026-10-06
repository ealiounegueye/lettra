import { createBag, rackPoints, shuffle } from './bag.ts'
import { CENTER, emptyGrid, PREMIUMS, SIZE } from './board.ts'
import { isWord } from './lexicon.ts'
import type { GameState, LastMove, OverReason, Placement, Result, Tile } from './types.ts'

const DIRS = [
  [0, 1],
  [1, 0],
] as const

function other(player: 0 | 1): 0 | 1 {
  return player === 0 ? 1 : 0
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < SIZE && col < SIZE
}

function boardEmpty(board: (Tile | null)[][]): boolean {
  return board.every((row) => row.every((cell) => cell === null))
}

function cloneRacks(racks: [Tile[], Tile[]]): [Tile[], Tile[]] {
  return [racks[0].slice(), racks[1].slice()]
}

export function createGame(
  players: [string, string],
  minutes: number,
  rng: () => number = Math.random,
): GameState {
  let bag = shuffle(createBag(), rng)
  const rack0 = bag.slice(0, 7)
  const rack1 = bag.slice(7, 14)
  bag = bag.slice(14)
  const clock = minutes * 60 * 1000
  return {
    board: emptyGrid<Tile | null>(null),
    racks: [rack0, rack1],
    bag,
    turn: 0,
    scores: [0, 0],
    pending: [],
    players,
    minutes,
    clockMs: [clock, clock],
    passes: 0,
    phase: 'play',
    overReason: '',
    lastMove: null,
    winner: null,
  }
}

export function formatScoreWords(words: string[], score: number): string {
  const label = words.join(', ')
  const unit = score === 1 ? 'point' : 'points'
  return `${label}, ${score} ${unit}`
}

function fail(error: string): Result<GameState> {
  return { ok: false, error }
}

function tileOnRack(rack: Tile[], tileId: string): Tile | undefined {
  return rack.find((tile) => tile.id === tileId)
}

export function place(
  state: GameState,
  tileId: string,
  row: number,
  col: number,
  letter: string,
): Result<GameState> {
  if (state.phase !== 'play') return fail('Ce n’est pas le moment de jouer.')
  if (!inBounds(row, col)) return fail('Case hors du plateau.')
  if (state.board[row][col]) return fail('Cette case est déjà prise.')
  if (state.pending.some((item) => item.row === row && item.col === col)) {
    return fail('Cette case est déjà prise.')
  }
  const tile = tileOnRack(state.racks[state.turn], tileId)
  if (!tile) return fail('Cette lettre n’est pas sur le chevalet.')
  if (state.pending.some((item) => item.tileId === tileId)) {
    return fail('Cette lettre est déjà posée.')
  }
  const face = letter.toUpperCase()
  if (!/^[A-Z]$/.test(face)) return fail('Choisis une lettre.')
  if (!tile.blank && face !== tile.letter) return fail('Lettre incorrecte.')
  const next: Placement = { row, col, tileId, letter: face }
  return { ok: true, state: { ...state, pending: [...state.pending, next] } }
}

export function lift(state: GameState, row: number, col: number): GameState {
  if (state.phase !== 'play') return state
  return {
    ...state,
    pending: state.pending.filter((item) => item.row !== row || item.col !== col),
  }
}

export function clearPending(state: GameState): GameState {
  if (state.phase !== 'play') return state
  return { ...state, pending: [] }
}

export function movePending(
  state: GameState,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): Result<GameState> {
  if (state.phase !== 'play') return fail('Ce n’est pas le moment de jouer.')
  if (fromRow === toRow && fromCol === toCol) return { ok: true, state }
  const moving = state.pending.find((item) => item.row === fromRow && item.col === fromCol)
  if (!moving) return fail('Cette lettre n’est pas posée.')
  if (!inBounds(toRow, toCol)) return fail('Case hors du plateau.')
  if (state.board[toRow][toCol]) return fail('Cette case est déjà prise.')
  const occupant = state.pending.find((item) => item.row === toRow && item.col === toCol)
  const pending = state.pending.map((item) => {
    if (item.tileId === moving.tileId) return { ...item, row: toRow, col: toCol }
    if (occupant && item.tileId === occupant.tileId) return { ...item, row: fromRow, col: fromCol }
    return item
  })
  return { ok: true, state: { ...state, pending } }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function cycleBlank(state: GameState, row: number, col: number, step: 1 | -1): GameState {
  if (state.phase !== 'play') return state
  const index = state.pending.findIndex((item) => item.row === row && item.col === col)
  if (index < 0) return state
  const item = state.pending[index]
  const tile = tileOnRack(state.racks[state.turn], item.tileId)
  if (!tile?.blank) return state
  const current = ALPHABET.indexOf(item.letter)
  const next = ALPHABET[(Math.max(current, 0) + step + 26) % 26]
  const pending = state.pending.slice()
  pending[index] = { ...item, letter: next }
  return { ...state, pending }
}

export function reorderRack(state: GameState, tileId: string, beforeId: string | null): GameState {
  if (state.phase !== 'play') return state
  const racks = cloneRacks(state.racks)
  const rack = racks[state.turn]
  const index = rack.findIndex((tile) => tile.id === tileId)
  if (index < 0) return state
  const [tile] = rack.splice(index, 1)
  if (!beforeId || beforeId === tileId) rack.push(tile)
  else {
    const dest = rack.findIndex((item) => item.id === beforeId)
    rack.splice(dest < 0 ? rack.length : dest, 0, tile)
  }
  racks[state.turn] = rack
  return { ...state, racks }
}

export function shuffleRack(state: GameState, rng: () => number = Math.random): GameState {
  if (state.phase !== 'play') return state
  const racks = cloneRacks(state.racks)
  racks[state.turn] = shuffle(racks[state.turn], rng)
  return { ...state, racks }
}

function withPending(state: GameState): (Tile | null)[][] {
  const board = state.board.map((row) => row.slice())
  const rack = state.racks[state.turn]
  for (const item of state.pending) {
    const tile = tileOnRack(rack, item.tileId)
    if (!tile) continue
    board[item.row][item.col] = { ...tile, letter: item.letter, player: state.turn }
  }
  return board
}

type FormedWord = { text: string; cells: { row: number; col: number }[]; key: string }

function expand(
  board: (Tile | null)[][],
  row: number,
  col: number,
  dRow: number,
  dCol: number,
): FormedWord {
  let startRow = row
  let startCol = col
  while (inBounds(startRow - dRow, startCol - dCol) && board[startRow - dRow][startCol - dCol]) {
    startRow -= dRow
    startCol -= dCol
  }
  const cells: { row: number; col: number }[] = []
  let text = ''
  let cursorRow = startRow
  let cursorCol = startCol
  while (inBounds(cursorRow, cursorCol) && board[cursorRow][cursorCol]) {
    cells.push({ row: cursorRow, col: cursorCol })
    text += board[cursorRow][cursorCol]!.letter
    cursorRow += dRow
    cursorCol += dCol
  }
  return { text, cells, key: `${startRow},${startCol},${dRow},${dCol}` }
}

function formedWords(board: (Tile | null)[][], pending: Placement[]): FormedWord[] {
  const seen = new Set<string>()
  const words: FormedWord[] = []
  for (const item of pending) {
    for (const [dRow, dCol] of DIRS) {
      const word = expand(board, item.row, item.col, dRow, dCol)
      if (word.cells.length < 2 || seen.has(word.key)) continue
      seen.add(word.key)
      words.push(word)
    }
  }
  return words
}

function lineHasGap(board: (Tile | null)[][], pending: Placement[]): boolean {
  const rows = new Set(pending.map((item) => item.row))
  if (rows.size === 1) {
    const row = pending[0].row
    const values = pending.map((item) => item.col)
    const min = Math.min(...values)
    const max = Math.max(...values)
    for (let col = min; col <= max; col += 1) {
      if (!board[row][col]) return true
    }
    return false
  }
  const col = pending[0].col
  const values = pending.map((item) => item.row)
  const min = Math.min(...values)
  const max = Math.max(...values)
  for (let row = min; row <= max; row += 1) {
    if (!board[row][col]) return true
  }
  return false
}

function touchesExisting(board: (Tile | null)[][], pending: Placement[]): boolean {
  for (const item of pending) {
    for (const [dRow, dCol] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const row = item.row + dRow
      const col = item.col + dCol
      if (inBounds(row, col) && board[row][col]) return true
    }
  }
  return false
}

function scoreWord(word: FormedWord, before: (Tile | null)[][], after: (Tile | null)[][]): number {
  let letters = 0
  let multiplier = 1
  for (const cell of word.cells) {
    const tile = after[cell.row][cell.col]!
    let points = tile.points
    if (!before[cell.row][cell.col]) {
      const premium = PREMIUMS[cell.row][cell.col]
      if (premium === 'dl') points *= 2
      if (premium === 'tl') points *= 3
      if (premium === 'dw') multiplier *= 2
      if (premium === 'tw') multiplier *= 3
    }
    letters += points
  }
  return letters * multiplier
}

function winnerOf(scores: [number, number]): 0 | 1 | null {
  if (scores[0] === scores[1]) return null
  return scores[0] > scores[1] ? 0 : 1
}

function finish(state: GameState, reason: OverReason): GameState {
  if (reason === 'time') {
    return {
      ...state,
      phase: 'over',
      overReason: reason,
      pending: [],
      winner: other(state.turn),
      clockMs: state.clockMs.map((value, index) => (index === state.turn ? 0 : value)) as [number, number],
    }
  }
  const left = rackPoints(state.racks[0])
  const right = rackPoints(state.racks[1])
  const scores: [number, number] = [state.scores[0] - left, state.scores[1] - right]
  if (state.racks[0].length === 0) scores[0] += right
  if (state.racks[1].length === 0) scores[1] += left
  return {
    ...state,
    phase: 'over',
    overReason: reason,
    pending: [],
    scores,
    winner: winnerOf(scores),
  }
}

function handoff(state: GameState, lastMove: LastMove): GameState {
  return {
    ...state,
    turn: other(state.turn),
    phase: 'handoff',
    pending: [],
    lastMove,
  }
}

export type MoveResult =
  | { ok: true; state: GameState; spoken: string }
  | { ok: false; error: string }

type Assessment =
  | { ok: true; score: number; words: FormedWord[]; defined: boolean; after: (Tile | null)[][] }
  | { ok: false; error: string }

function sameLine(pending: Placement[]): boolean {
  if (pending.length <= 1) return true
  const rows = new Set(pending.map((item) => item.row))
  const cols = new Set(pending.map((item) => item.col))
  return rows.size === 1 || cols.size === 1
}

function assess(state: GameState): Assessment {
  if (state.pending.length === 0) return { ok: false, error: 'Pose au moins une lettre.' }
  if (!sameLine(state.pending)) return { ok: false, error: 'Aligne les lettres sur une même ligne.' }
  const before = state.board
  const after = withPending(state)
  if (lineHasGap(after, state.pending)) return { ok: false, error: 'Il y a un trou dans le mot.' }
  const first = boardEmpty(before)
  if (first && !state.pending.some((item) => item.row === CENTER && item.col === CENTER)) {
    return { ok: false, error: 'Le premier mot doit passer par l’étoile.' }
  }
  if (!first && !touchesExisting(before, state.pending)) {
    return { ok: false, error: 'Le mot doit toucher une lettre déjà posée.' }
  }
  const words = formedWords(after, state.pending)
  if (words.length === 0) return { ok: false, error: 'Ce coup ne forme pas de mot.' }
  const defined = words.every((word) => isWord(word.text))
  let score = words.reduce((sum, word) => sum + scoreWord(word, before, after), 0)
  if (state.pending.length === 7) score += 50
  return { ok: true, score, words, defined, after }
}

export function previewPlay(state: GameState): { score: number; defined: boolean } | null {
  const judged = assess(state)
  if (!judged.ok) return null
  return { score: judged.score, defined: judged.defined }
}

export function playMove(state: GameState): MoveResult {
  if (state.phase !== 'play') return { ok: false, error: 'Ce n’est pas le moment de jouer.' }
  const judged = assess(state)
  if (!judged.ok) return judged
  if (!judged.defined) {
    const missing = judged.words.find((word) => !isWord(word.text))
    return { ok: false, error: `« ${missing?.text ?? ''} » n’est pas dans le lexique de départ.` }
  }
  const { score, words, after } = judged
  const used = new Set(state.pending.map((item) => item.tileId))
  const racks = cloneRacks(state.racks)
  racks[state.turn] = racks[state.turn].filter((tile) => !used.has(tile.id))
  const drawn = state.bag.slice(0, state.pending.length)
  racks[state.turn] = [...racks[state.turn], ...drawn]
  const bag = state.bag.slice(drawn.length)
  const scores: [number, number] = [...state.scores]
  scores[state.turn] += score
  const labels = [...words].sort((a, b) => b.text.length - a.text.length).map((word) => word.text)
  const lastMove: LastMove = { player: state.turn, label: labels.join(' · '), score }
  const spoken = formatScoreWords(labels, score)
  const historyState: GameState = {
    ...state,
    board: after,
    racks,
    bag,
    scores,
    passes: 0,
    pending: [],
    lastMove,
  }
  if (racks[state.turn].length === 0) {
    return { ok: true, state: finish(historyState, 'played-out'), spoken }
  }
  return { ok: true, state: handoff(historyState, lastMove), spoken }
}

export function passTurn(state: GameState): GameState {
  if (state.phase !== 'play') return state
  const passes = state.passes + 1
  const cleared: GameState = { ...state, pending: [], passes }
  const lastMove: LastMove = { player: state.turn, label: 'Passe', score: 0 }
  if (passes >= 2) return finish({ ...cleared, lastMove }, 'passes')
  return handoff(cleared, lastMove)
}

export function exchangeTiles(
  state: GameState,
  ids: string[],
  rng: () => number = Math.random,
): Result<GameState> {
  if (state.phase !== 'play') return fail('Ce n’est pas le moment de jouer.')
  if (ids.length === 0) return fail('Choisis au moins un jeton à échanger.')
  if (state.bag.length < 7) return fail('Il faut au moins 7 jetons dans le sac.')
  const unique = [...new Set(ids)]
  const rack = state.racks[state.turn]
  if (unique.some((id) => !rack.some((tile) => tile.id === id))) {
    return fail('Ces jetons ne sont pas sur le chevalet.')
  }
  if (state.pending.some((item) => unique.includes(item.tileId))) {
    return fail('Retire d’abord les lettres posées sur le plateau.')
  }
  const given = rack.filter((tile) => unique.includes(tile.id))
  const kept = rack.filter((tile) => !unique.includes(tile.id))
  let bag = shuffle([...state.bag, ...given], rng)
  const drawn = bag.slice(0, given.length)
  bag = bag.slice(given.length)
  const racks = cloneRacks(state.racks)
  racks[state.turn] = [...kept, ...drawn]
  const lastMove: LastMove = { player: state.turn, label: 'Échange', score: 0 }
  const next = handoff({ ...state, racks, bag, pending: [], passes: 0 }, lastMove)
  return { ok: true, state: next }
}

export function reveal(state: GameState): GameState {
  if (state.phase !== 'handoff') return state
  return { ...state, phase: 'play' }
}

export function tick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== 'play') return state
  const left = state.clockMs[state.turn] - deltaMs
  const clockMs = state.clockMs.slice() as [number, number]
  clockMs[state.turn] = Math.max(0, left)
  const next = { ...state, clockMs }
  if (left <= 0) return finish(next, 'time')
  return next
}
