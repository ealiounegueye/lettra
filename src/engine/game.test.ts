import { describe, expect, it } from 'vitest'
import { makeTile } from './bag.ts'
import { formatClock } from './clock.ts'
import {
  createGame,
  cycleBlank,
  exchangeTiles,
  movePending,
  passTurn,
  place,
  playMove,
  previewPlay,
  reveal,
  tick,
} from './game.ts'
import { isWord, LEXICON, setImportedWords } from './lexicon.ts'
import { wordsInText } from './lexiconStore.ts'
import type { GameState, Tile } from './types.ts'

function must(result: { ok: true; state: GameState } | { ok: false; error: string }): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function rack(letters: string): Tile[] {
  return [...letters].map((letter, index) => makeTile(letter, `${letter}-${index}-${letter}`))
}

function base(letters: string, opponent = 'ETOILE', bag: Tile[] = []): GameState {
  const game = createGame(['A', 'B'], 10, () => 0)
  return {
    ...game,
    board: game.board.map((row) => row.map(() => null)),
    racks: [rack(letters), rack(opponent)],
    bag,
    turn: 0,
    scores: [0, 0],
    pending: [],
    passes: 0,
    phase: 'play',
    overReason: '',
    lastMove: null,
    winner: null,
    clockMs: [60_000, 60_000],
  }
}

function lay(state: GameState, letters: string, row: number, col: number, across = true): GameState {
  let next = state
  letters.split('').forEach((letter, index) => {
    const tile = next.racks[next.turn].find((item) => item.letter === letter && !next.pending.some((p) => p.tileId === item.id))
    if (!tile) throw new Error(`missing ${letter}`)
    next = must(place(next, tile.id, across ? row : row + index, across ? col + index : col, letter))
  })
  return next
}

describe('lexique', () => {
  it('accepte les mots de la partie de démo', () => {
    for (const word of ['AMI', 'MAISON', 'MAISONS', 'RI', 'VERT', 'LUNE']) {
      expect(isWord(word)).toBe(true)
    }
  })

  it('ne garde que des mots en capitales', () => {
    for (const word of LEXICON) {
      expect(word).toMatch(/^[A-Z]{2,}$/)
    }
  })

  it('reconnaît un accent du départ et un mot importé', () => {
    expect(isWord('été')).toBe(true)
    expect(setImportedWords(['zzqx', 'été'])).toBe(2)
    expect(isWord('zzqx')).toBe(true)
    setImportedWords(null)
    expect(isWord('zzqx')).toBe(false)
    expect(wordsInText('Maison\nZZQX, été')).toEqual(['Maison', 'ZZQX', 'été'])
  })
})

describe('partie', () => {
  it('compte le premier mot sur l’étoile, avec le mot compte double', () => {
    const laid = lay(base('AMISOLR'), 'AMI', 7, 6)
    const played = playMove(laid)
    expect(played.ok).toBe(true)
    if (!played.ok) return
    expect(played.state.scores[0]).toBe(8)
    expect(played.state.phase).toBe('handoff')
    expect(played.state.board[7][7]?.letter).toBe('M')
    expect(played.spoken).toBe('AMI, 8 points')
  })

  it('refuse un premier mot qui évite le centre', () => {
    const laid = lay(base('AMISOLR'), 'AMI', 6, 6)
    const played = playMove(laid)
    expect(played.ok).toBe(false)
  })

  it('score un croisement et une lettre compte double', () => {
    let state = must(playMove(lay(base('AMISOLR', 'RIENSLT'), 'AMI', 7, 6)))
    state = reveal(state)
    const cross = lay(state, 'R', 6, 8, false)
    const played = playMove(cross)
    expect(played.ok).toBe(true)
    if (!played.ok) return
    expect(played.state.scores[1]).toBe(3)
    expect(played.state.lastMove?.label).toBe('RI')
  })

  it('refuse un mot hors lexique et un mot isolé', () => {
    const bad = playMove(lay(base('ZZZZZZZ'), 'ZZ', 7, 6))
    expect(bad.ok).toBe(false)
    let state = must(playMove(lay(base('AMISOLR', 'OSMARCH'), 'AMI', 7, 6)))
    state = reveal(state)
    const isolated = playMove(lay(state, 'OS', 0, 0))
    expect(isolated.ok).toBe(false)
  })

  it('ajoute 50 points pour un scrabble de 7 lettres', () => {
    const laid = lay(base('MAISONS', 'ETOILEX', [makeTile('A', 'reste')]), 'MAISONS', 7, 4)
    const played = playMove(laid)
    expect(played.ok).toBe(true)
    if (!played.ok) return
    expect(played.state.scores[0]).toBe(66)
    expect(played.state.phase).toBe('handoff')
  })

  it('donne 0 point à un joker', () => {
    const game = base('MAI?ONX')
    const blank = game.racks[0].find((tile) => tile.blank)
    if (!blank) throw new Error('joker manquant')
    let state = lay({ ...game, racks: [[blank, ...game.racks[0].filter((tile) => !tile.blank)], game.racks[1]] }, 'MAI', 7, 4)
    state = must(place(state, blank.id, 7, 7, 'S'))
    state = lay(state, 'ON', 7, 8)
    const played = playMove(state)
    expect(played.ok).toBe(true)
    if (!played.ok) return
    expect(played.state.scores[0]).toBe(12)
    expect(played.state.board[7][7]?.points).toBe(0)
  })

  it('termine après deux passes et retire les jetons restants', () => {
    let state = base('AAAAAAA', 'EEEEEEE')
    state = passTurn(state)
    expect(state.phase).toBe('handoff')
    state = reveal(state)
    state = passTurn(state)
    expect(state.phase).toBe('over')
    expect(state.overReason).toBe('passes')
    expect(state.scores[0]).toBe(-7)
    expect(state.scores[1]).toBe(-7)
  })

  it('échange des jetons quand le sac est assez plein', () => {
    const bag = rack('BCDFGHIJ')
    const state = base('AMISOLR', 'ETOILEX', bag.map((tile, index) => ({ ...tile, id: `bag-${index}` })))
    const ids = state.racks[0].slice(0, 2).map((tile) => tile.id)
    const exchanged = exchangeTiles(state, ids, () => 0)
    expect(exchanged.ok).toBe(true)
    if (!exchanged.ok) return
    expect(exchanged.state.phase).toBe('handoff')
    expect(exchanged.state.racks[0]).toHaveLength(7)
    expect(exchanged.state.bag).toHaveLength(bag.length)
    expect(exchanged.state.racks[0].some((tile) => ids.includes(tile.id))).toBe(false)
  })

  it('arrête la partie quand le temps est écoulé', () => {
    const state = tick(base('AMISOLR'), 60_000)
    expect(state.phase).toBe('over')
    expect(state.overReason).toBe('time')
    expect(state.winner).toBe(1)
  })

  it('formate le chrono', () => {
    expect(formatClock(600_000)).toBe('10:00')
    expect(formatClock(1_001)).toBe('0:02')
    expect(formatClock(0)).toBe('0:00')
  })

  it('prévisualise le score et laisse déplacer une lettre', () => {
    const laid = lay(base('AMISOLR'), 'AMI', 7, 6)
    expect(previewPlay(laid)).toEqual({ score: 8, defined: true })
    const moved = movePending(laid, 7, 6, 7, 5)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.state.pending.some((item) => item.row === 7 && item.col === 5)).toBe(true)
  })

  it('laisse déplacer une lettre sur une autre ligne, et le refuse à OK', () => {
    const laid = lay(base('AMISOLR'), 'AM', 7, 6)
    const tile = laid.racks[0].find((item) => item.letter === 'I' && !laid.pending.some((pending) => pending.tileId === item.id))
    if (!tile) throw new Error('lettre manquante')
    const placed = place(laid, tile.id, 8, 8, 'I')
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    const played = playMove(placed.state)
    expect(played.ok).toBe(false)
    if (played.ok) return
    expect(played.error).toBe('Aligne les lettres sur une même ligne.')
    const shifted = movePending(placed.state, 8, 8, 9, 6)
    expect(shifted.ok).toBe(true)
  })

  it('fait tourner la lettre du joker', () => {
    const game = base('?AAAAAA')
    const blank = game.racks[0].find((tile) => tile.blank)
    if (!blank) throw new Error('joker manquant')
    const placed = must(place(game, blank.id, 7, 7, 'A'))
    expect(cycleBlank(placed, 7, 7, 1).pending[0]?.letter).toBe('B')
    expect(cycleBlank(placed, 7, 7, -1).pending[0]?.letter).toBe('Z')
  })

  it('distribue 7 jetons et un sac de 88 au départ', () => {
    const game = createGame(['Toi', 'Partenaire'], 10, () => 0.4)
    expect(game.racks[0]).toHaveLength(7)
    expect(game.racks[1]).toHaveLength(7)
    expect(game.bag).toHaveLength(88)
    expect(game.phase).toBe('play')
  })
})
