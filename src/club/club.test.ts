import { describe, expect, it } from 'vitest'
import { OPEN_SEEKS } from './roster.ts'
import { addIncrement, findOpponent, rateLine, rateResult, type SeekForm } from './rules.ts'
import { observedMatch } from './demo.ts'
import { createGame } from '../engine/game.ts'

const baseForm: SeekForm = {
  minutes: 10,
  increment: 0,
  challenge: '5-POINTS',
  rated: true,
  minRating: 0,
  maxRating: 9999,
  fairplayOnly: false,
}

describe('salon', () => {
  it('trouve une partie 10 min cotée dans la fourchette', () => {
    const found = findOpponent(baseForm, 800, OPEN_SEEKS)
    expect(found?.seek.nick).toBe('brume')
    expect(found?.exact).toBe(true)
  })

  it('respecte la fourchette haute', () => {
    const found = findOpponent(
      { ...baseForm, minutes: 15, increment: 5, challenge: 'DOUBLE', minRating: 1400, maxRating: 1800 },
      1512,
      OPEN_SEEKS,
    )
    expect(found?.seek.nick).toBe('mica')
  })

  it('ne propose personne hors fourchette', () => {
    expect(findOpponent({ ...baseForm, minRating: 2000, maxRating: 2200 }, 2100, OPEN_SEEKS)).toBeNull()
  })

  it('ajoute l’incrément tant que la partie continue', () => {
    const game = createGame(['A', 'B'], 1, () => 0)
    const next = addIncrement(game, 0, 5)
    expect(next.clockMs[0]).toBe(game.clockMs[0] + 5000)
    const done = { ...game, phase: 'over' as const }
    expect(addIncrement(done, 0, 5).clockMs[0]).toBe(game.clockMs[0])
  })

  it('fait bouger la cote provisoire plus vite', () => {
    expect(rateResult(800, 0, 0, 0)).toEqual({ rating: 832, games: 1, delta: 32 })
    expect(rateResult(800, 10, 1, 0)).toEqual({ rating: 784, games: 11, delta: -16 })
    expect(rateLine(800, 832, 32)).toBe('Cote +32 : 800 → 832.')
    expect(rateLine(800, 800, 0)).toBe('Égalité. Cote inchangée.')
  })

  it('rejoue une table observable', () => {
    const table = observedMatch(['brume', 'nord'])
    expect(table.state.scores[0]).toBeGreaterThan(0)
    expect(table.state.scores[1]).toBeGreaterThan(0)
    expect(table.state.board[7][7]?.letter).toBe('M')
    expect(table.lines).toHaveLength(2)
  })
})
