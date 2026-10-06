import { LEXICON } from './lexicon.ts'
import { clearPending, passTurn, place, playMove, previewPlay } from './game.ts'
import type { GameState, Tile } from './types.ts'

const SIZE = 15
const CENTER = 7
const WORDS = [...LEXICON].filter((word) => word.length >= 2 && word.length <= 8)

type Step = { tileId: string; row: number; col: number; letter: string }

export type BotResult = { state: GameState; spoken: string; passed: boolean }

export function botPlay(state: GameState): BotResult {
  if (state.phase !== 'play') return { state, spoken: '', passed: false }
  const found = findBest(state)
  if (!found) return pass(state)
  let cursor = state
  for (const step of found.steps) {
    const placed = place(cursor, step.tileId, step.row, step.col, step.letter)
    if (!placed.ok) return pass(state)
    cursor = placed.state
  }
  const played = playMove(cursor)
  if (!played.ok) return pass(state)
  return { state: played.state, spoken: played.spoken, passed: false }
}

function pass(state: GameState): BotResult {
  return { state: passTurn(clearPending(state)), spoken: 'Passe', passed: true }
}

function findBest(state: GameState): { score: number; steps: Step[] } | null {
  const tiles = state.racks[state.turn]
  const letters = tiles.map((tile) => (tile.blank ? '?' : tile.letter))
  const empty = isEmpty(state.board)
  const candidates = WORDS
    .map((word) => ({ word, missing: missingCount(word, letters) }))
    .filter((item) => item.missing < item.word.length && item.missing <= 6)
    .sort((a, b) => {
      if (!empty) {
        const hookA = a.missing === 0 ? 1 : 0
        const hookB = b.missing === 0 ? 1 : 0
        return hookA - hookB || a.missing - b.missing || b.word.length - a.word.length
      }
      return a.missing - b.missing || b.word.length - a.word.length
    })
    .slice(0, 80)

  let best: { score: number; steps: Step[] } | null = null
  let scored = 0
  for (const candidate of candidates) {
    for (const across of [true, false]) {
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          const steps = align(state, tiles, candidate.word, row, col, across, empty)
          if (!steps) continue
          const score = scoreSteps(state, steps)
          if (score === null) continue
          scored += 1
          if (!best || score > best.score) best = { score, steps }
          if (best && scored >= 40 && best.score >= 12) return best
        }
      }
    }
  }
  return best
}

function missingCount(word: string, letters: string[]): number {
  const pool = letters.slice()
  let missing = 0
  for (const letter of word) {
    const exact = pool.indexOf(letter)
    if (exact >= 0) {
      pool.splice(exact, 1)
      continue
    }
    const blank = pool.indexOf('?')
    if (blank >= 0) {
      pool.splice(blank, 1)
      continue
    }
    missing += 1
  }
  return missing
}

function align(
  state: GameState,
  tiles: Tile[],
  word: string,
  row: number,
  col: number,
  across: boolean,
  empty: boolean,
): Step[] | null {
  if (empty) {
    const endRow = across ? row : row + word.length - 1
    const endCol = across ? col + word.length - 1 : col
    const covers = across ? row === CENTER && col <= CENTER && endCol >= CENTER : col === CENTER && row <= CENTER && endRow >= CENTER
    if (!covers) return null
  }
  const used = new Set<string>()
  const steps: Step[] = []
  let overlaps = false
  let touches = false
  for (let index = 0; index < word.length; index += 1) {
    const r = across ? row : row + index
    const c = across ? col + index : col
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null
    const letter = word[index] ?? ''
    const occupant = state.board[r][c]
    if (occupant) {
      if (occupant.letter !== letter) return null
      overlaps = true
      continue
    }
    if (neighborFilled(state, r, c)) touches = true
    const tile = takeTile(tiles, used, letter)
    if (!tile) return null
    used.add(tile.id)
    steps.push({ tileId: tile.id, row: r, col: c, letter })
  }
  if (steps.length === 0) return null
  if (!empty && !overlaps && !touches) return null
  return steps
}

function neighborFilled(state: GameState, row: number, col: number): boolean {
  for (const [dRow, dCol] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const r = row + dRow
    const c = col + dCol
    if (r >= 0 && c >= 0 && r < SIZE && c < SIZE && state.board[r][c]) return true
  }
  return false
}

function takeTile(tiles: Tile[], used: Set<string>, letter: string): Tile | undefined {
  return tiles.find((tile) => !used.has(tile.id) && !tile.blank && tile.letter === letter)
    ?? tiles.find((tile) => !used.has(tile.id) && tile.blank)
}

function scoreSteps(state: GameState, steps: Step[]): number | null {
  let cursor = state
  for (const step of steps) {
    const placed = place(cursor, step.tileId, step.row, step.col, step.letter)
    if (!placed.ok) return null
    cursor = placed.state
  }
  const preview = previewPlay(cursor)
  if (!preview?.defined) return null
  return preview.score
}

function isEmpty(board: (Tile | null)[][]): boolean {
  return board.every((row) => row.every((cell) => cell === null))
}
