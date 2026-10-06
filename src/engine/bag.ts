import type { Tile } from './types.ts'

/** Distribution et valeurs du scrabble francophone (102 jetons). */
const DISTRIBUTION: [string, number, number][] = [
  ['A', 9, 1],
  ['B', 2, 3],
  ['C', 2, 3],
  ['D', 3, 2],
  ['E', 15, 1],
  ['F', 2, 4],
  ['G', 2, 2],
  ['H', 2, 4],
  ['I', 8, 1],
  ['J', 1, 8],
  ['K', 1, 10],
  ['L', 5, 1],
  ['M', 3, 2],
  ['N', 6, 1],
  ['O', 6, 1],
  ['P', 2, 3],
  ['Q', 1, 8],
  ['R', 6, 1],
  ['S', 6, 1],
  ['T', 6, 1],
  ['U', 6, 1],
  ['V', 2, 4],
  ['W', 1, 10],
  ['X', 1, 10],
  ['Y', 1, 10],
  ['Z', 1, 10],
  ['?', 2, 0],
]

export const POINTS: Record<string, number> = Object.fromEntries(
  DISTRIBUTION.map(([letter, , points]) => [letter, points]),
)

export function createBag(): Tile[] {
  const tiles: Tile[] = []
  for (const [letter, count, points] of DISTRIBUTION) {
    for (let index = 0; index < count; index += 1) {
      tiles.push({
        id: `${letter}-${index}`,
        letter: letter === '?' ? '?' : letter,
        points,
        blank: letter === '?',
      })
    }
  }
  return tiles
}

export function makeTile(letter: string, id: string): Tile {
  const blank = letter === '?'
  return {
    id,
    letter,
    points: blank ? 0 : (POINTS[letter] ?? 0),
    blank,
  }
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const next = items.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    const current = next[index]
    next[index] = next[swap]
    next[swap] = current
  }
  return next
}

export function rackPoints(tiles: Tile[]): number {
  return tiles.reduce((sum, tile) => sum + tile.points, 0)
}
