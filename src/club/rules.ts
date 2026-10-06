import type { GameState } from '../engine/types.ts'

export type Challenge = 'SINGLE' | 'DOUBLE' | '5-POINTS' | 'VOID'

export const CHALLENGE_TEXT: Record<Challenge, string> = {
  SINGLE: 'contestation simple',
  DOUBLE: 'contestation double',
  '5-POINTS': 'pénalité de 5 points pour une contestation injustifiée',
  VOID: 'coup annulé si la contestation est juste',
}

export type SeekForm = {
  minutes: number
  increment: number
  challenge: Challenge
  rated: boolean
  minRating: number
  maxRating: number
  fairplayOnly: boolean
}

export type OpenSeek = SeekForm & {
  id: string
  nick: string
  rating: number
  fairplay: boolean
}

export function findOpponent(
  form: SeekForm,
  myRating: number,
  seeks: OpenSeek[],
): { seek: OpenSeek; exact: boolean } | null {
  const fitting = seeks.filter((seek) => {
    if (seek.rating < form.minRating || seek.rating > form.maxRating) return false
    if (myRating < seek.minRating || myRating > seek.maxRating) return false
    if (form.fairplayOnly && !seek.fairplay) return false
    return true
  })
  const exact = fitting.filter((seek) =>
    seek.minutes === form.minutes &&
    seek.increment === form.increment &&
    seek.challenge === form.challenge &&
    seek.rated === form.rated,
  )
  if (exact[0]) return { seek: exact[0], exact: true }
  if (fitting[0]) return { seek: fitting[0], exact: false }
  return null
}

export function addIncrement(state: GameState, player: 0 | 1, seconds: number): GameState {
  if (seconds <= 0 || state.phase === 'over') return state
  const clockMs = state.clockMs.slice() as [number, number]
  clockMs[player] += seconds * 1000
  return { ...state, clockMs }
}

export function rateResult(
  rating: number,
  games: number,
  winner: 0 | 1 | null,
  you: 0 | 1,
): { rating: number; games: number; delta: number } {
  const swing = games < 10 ? 32 : 16
  const delta = winner === null ? 0 : winner === you ? swing : -swing
  return { rating: Math.max(0, rating + delta), games: games + 1, delta }
}

export function rateLine(before: number, after: number, delta: number): string {
  if (delta === 0) return 'Égalité. Cote inchangée.'
  const sign = delta > 0 ? '+' : ''
  return `Cote ${sign}${delta} : ${before} → ${after}.`
}
