import { makeTile } from '../engine/bag.ts'
import { createGame, place, playMove, reveal } from '../engine/game.ts'
import type { GameState, Tile } from '../engine/types.ts'

function tiles(letters: string, prefix: string): Tile[] {
  return [...letters].map((letter, index) => makeTile(letter, `${prefix}-${index}-${letter}`))
}

function playWord(
  state: GameState,
  word: string,
  row: number,
  col: number,
  across: boolean,
): { state: GameState; spoken: string } {
  let next = state.phase === 'handoff' ? reveal(state) : state
  for (let index = 0; index < word.length; index += 1) {
    const letter = word[index] ?? ''
    const r = across ? row : row + index
    const c = across ? col + index : col
    if (next.board[r]?.[c]) continue
    const tile = next.racks[next.turn].find((item) => item.letter === letter && !next.pending.some((pending) => pending.tileId === item.id))
    if (!tile) throw new Error(`manque ${letter}`)
    const placed = place(next, tile.id, r, c, letter)
    if (!placed.ok) throw new Error(placed.error)
    next = placed.state
  }
  const played = playMove(next)
  if (!played.ok) throw new Error(played.error)
  return { state: played.state, spoken: played.spoken }
}

export function observedMatch(players: [string, string]): { state: GameState; lines: string[] } {
  let state = createGame(players, 10, () => 0)
  state = {
    ...state,
    racks: [tiles('AMIRLTE', 'p0'), tiles('AISONLU', 'p1')],
    bag: tiles('EEEEEEE', 'bag'),
    phase: 'play',
  }
  const first = playWord(state, 'AMI', 7, 6, true)
  const second = playWord(first.state, 'AISON', 8, 7, false)
  return {
    state: { ...second.state, clockMs: [9 * 60_000 + 22_000, 8 * 60_000 + 56_000] },
    lines: [`${players[0]} : ${first.spoken}`, `${players[1]} : ${second.spoken}`],
  }
}
