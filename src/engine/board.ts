import type { Premium } from './types.ts'

export const SIZE = 15
export const CENTER = 7

const ROWS = [
  '3..1...3...1..3',
  '.2...@...@...2.',
  '..2...1.1...2..',
  '1..2...1...2..1',
  '....2.....2....',
  '.@...@...@...@.',
  '..1...1.1...1..',
  '3..1...*...1..3',
  '..1...1.1...1..',
  '.@...@...@...@.',
  '....2.....2....',
  '1..2...1...2..1',
  '..2...1.1...2..',
  '.2...@...@...2.',
  '3..1...3...1..3',
]

const CODE: Record<string, Premium | null> = {
  '.': null,
  '3': 'tw',
  '2': 'dw',
  '1': 'dl',
  '@': 'tl',
  '*': 'dw',
}

export const PREMIUMS: (Premium | null)[][] = ROWS.map((row) =>
  [...row].map((cell) => CODE[cell] ?? null),
)

export function premiumLabel(premium: Premium | null, center: boolean): string {
  if (center) return '★'
  if (premium === 'tw') return 'TW'
  if (premium === 'dw') return 'DW'
  if (premium === 'tl') return 'TL'
  if (premium === 'dl') return 'DL'
  return ''
}

export function emptyGrid<T>(fill: T): T[][] {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => fill))
}
