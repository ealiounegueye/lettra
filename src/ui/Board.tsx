import { CENTER, PREMIUMS, premiumLabel, SIZE } from '../engine/board.ts'
import type { Placement, Tile } from '../engine/types.ts'

export type Arrow = { row: number; col: number; dir: 'across' | 'down' }

type Props = {
  board: (Tile | null)[][]
  pending: Placement[]
  rack: Tile[]
  turn: 0 | 1
  arrow: Arrow | null
  dragId: string | null
}

export function Board({ board, pending, rack, turn, arrow, dragId }: Props) {
  return (
    <div className="wb-board" role="grid" aria-label="Plateau">
      {Array.from({ length: SIZE }, (_, row) =>
        Array.from({ length: SIZE }, (_, col) => {
          const committed = board[row][col]
          const draft = pending.find((item) => item.row === row && item.col === col)
          const draftTile = draft ? rack.find((tile) => tile.id === draft.tileId) : undefined
          const letter = committed?.letter ?? draft?.letter ?? null
          const points = committed?.points ?? (draftTile ? (draftTile.blank ? 0 : draftTile.points) : null)
          const blank = committed?.blank ?? draftTile?.blank ?? false
          const owner = committed?.player ?? (draft ? turn : undefined)
          const premium = PREMIUMS[row][col]
          const center = row === CENTER && col === CENTER
          const cursor = arrow?.row === row && arrow.col === col
          return (
            <div
              key={`${row}-${col}`}
              role="gridcell"
              data-cell={`${row}-${col}`}
              data-row={row}
              data-col={col}
              className={[
                'wb-cell',
                premium ? `prem-${premium}` : '',
                center ? 'center' : '',
                letter ? 'filled' : '',
                draft ? 'draft' : '',
                cursor ? 'is-cursor' : '',
                cursor && !letter ? 'cursor-empty' : '',
              ].filter(Boolean).join(' ')}
            >
              {letter && (committed || draftTile) && (
                <span
                  className={[
                    'wb-tile',
                    `owner-${owner ?? 0}`,
                    blank ? 'is-blank' : '',
                    dragId && draftTile?.id === dragId ? 'lifting' : '',
                  ].filter(Boolean).join(' ')}
                  data-tile-id={draftTile?.id ?? committed?.id}
                  data-origin="board"
                  data-locked={committed ? '1' : '0'}
                >
                  {letter}
                  <small>{blank ? '' : points}</small>
                </span>
              )}
              {!letter && <span className="wb-prem">{premiumLabel(premium, center)}</span>}
              {cursor && <i className={`wb-arrow ${arrow.dir}`} aria-hidden="true" />}
            </div>
          )
        }),
      )}
    </div>
  )
}
