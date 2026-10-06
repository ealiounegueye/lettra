export type Premium = 'tw' | 'dw' | 'tl' | 'dl'

export type Tile = {
  id: string
  letter: string
  points: number
  blank: boolean
  player?: 0 | 1
}

export type Placement = {
  row: number
  col: number
  tileId: string
  letter: string
}

export type LastMove = {
  player: 0 | 1
  label: string
  score: number
}

export type OverReason = '' | 'played-out' | 'passes' | 'time'

export type GameState = {
  board: (Tile | null)[][]
  racks: [Tile[], Tile[]]
  bag: Tile[]
  turn: 0 | 1
  scores: [number, number]
  pending: Placement[]
  players: [string, string]
  minutes: number
  clockMs: [number, number]
  passes: number
  phase: 'play' | 'handoff' | 'over'
  overReason: OverReason
  lastMove: LastMove | null
  winner: 0 | 1 | null
}

export type Ok<T> = { ok: true; state: T }
export type Err = { ok: false; error: string }
export type Result<T> = Ok<T> | Err
