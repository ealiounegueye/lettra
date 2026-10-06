import { describe, expect, it } from 'vitest'
import { makeTile } from './bag.ts'
import { botPlay } from './bot.ts'
import { createGame, place, playMove, reveal } from './game.ts'
import type { GameState, Tile } from './types.ts'

function tiles(letters: string, prefix: string): Tile[] {
  return [...letters].map((letter, index) => makeTile(letter, `${prefix}-${index}-${letter}`))
}

function withRacks(letters: [string, string]): GameState {
  const game = createGame(['A', 'B'], 10, () => 0)
  return {
    ...game,
    racks: [tiles(letters[0], 'a'), tiles(letters[1], 'b')],
    bag: tiles('EEEEEEE', 'bag'),
    phase: 'play',
  }
}

describe('bot', () => {
  it('ouvre avec un mot du chevalet', () => {
    const played = botPlay(withRacks(['AMISOLR', 'ETOILEX']))
    expect(played.passed).toBe(false)
    expect(played.state.scores[0]).toBeGreaterThan(0)
    expect(played.state.phase).toBe('handoff')
  })

  it('croise une lettre déjà posée', () => {
    let state = withRacks(['AMIRLTE', 'AISONLU'])
    for (const [index, letter] of [...'AMI'].entries()) {
      const tile = state.racks[0].find((item) => item.letter === letter && !state.pending.some((pending) => pending.tileId === item.id))
      if (!tile) throw new Error(letter)
      const placed = place(state, tile.id, 7, 6 + index, letter)
      if (!placed.ok) throw new Error(placed.error)
      state = placed.state
    }
    const opening = playMove(state)
    if (!opening.ok) throw new Error(opening.error)
    const reply = botPlay(reveal(opening.state))
    expect(reply.passed).toBe(false)
    expect(reply.state.scores[1]).toBeGreaterThan(0)
  })
})
