import type { OpenSeek } from './rules.ts'

export type Player = {
  nick: string
  rating: number
  fairplay: boolean
}

export const ROSTER: Player[] = [
  { nick: 'brume', rating: 842, fairplay: true },
  { nick: 'nord', rating: 1104, fairplay: true },
  { nick: 'calebasse', rating: 756, fairplay: false },
  { nick: 'ortie', rating: 1330, fairplay: true },
  { nick: 'liane', rating: 690, fairplay: true },
  { nick: 'gouffre', rating: 980, fairplay: false },
  { nick: 'mica', rating: 1512, fairplay: true },
  { nick: 'saule', rating: 804, fairplay: true },
  { nick: 'nereide', rating: 1220, fairplay: true },
  { nick: 'pomme', rating: 640, fairplay: false },
  { nick: 'volute', rating: 990, fairplay: true },
  { nick: 'kiosque', rating: 870, fairplay: true },
]

export const OPEN_SEEKS: OpenSeek[] = [
  { id: 'brume-10', nick: 'brume', rating: 842, minutes: 10, increment: 0, challenge: '5-POINTS', rated: true, fairplay: true, fairplayOnly: false, minRating: 0, maxRating: 9999 },
  { id: 'nord-10', nick: 'nord', rating: 1104, minutes: 10, increment: 0, challenge: '5-POINTS', rated: true, fairplay: true, fairplayOnly: false, minRating: 900, maxRating: 1400 },
  { id: 'saule-10', nick: 'saule', rating: 804, minutes: 10, increment: 0, challenge: 'VOID', rated: true, fairplay: true, fairplayOnly: false, minRating: 0, maxRating: 9999 },
  { id: 'liane-5', nick: 'liane', rating: 690, minutes: 5, increment: 0, challenge: 'SINGLE', rated: true, fairplay: true, fairplayOnly: false, minRating: 0, maxRating: 1200 },
  { id: 'gouffre-10', nick: 'gouffre', rating: 980, minutes: 10, increment: 0, challenge: '5-POINTS', rated: false, fairplay: false, fairplayOnly: false, minRating: 0, maxRating: 9999 },
  { id: 'mica-15', nick: 'mica', rating: 1512, minutes: 15, increment: 5, challenge: 'DOUBLE', rated: true, fairplay: true, fairplayOnly: true, minRating: 1400, maxRating: 1800 },
  { id: 'ortie-20', nick: 'ortie', rating: 1330, minutes: 20, increment: 10, challenge: 'DOUBLE', rated: true, fairplay: true, fairplayOnly: false, minRating: 1000, maxRating: 1600 },
]

export const TABLES: { id: string; players: [string, string]; minutes: number }[] = [
  { id: 't1', players: ['brume', 'nord'], minutes: 10 },
  { id: 't2', players: ['ortie', 'liane'], minutes: 15 },
]

export function playerByNick(nick: string): Player | undefined {
  return ROSTER.find((player) => player.nick === nick)
}
