import type { Tile } from '../engine/types.ts'

type Props = {
  tiles: Tile[]
  selected: string | null
  marked: string[]
  exchangeMode: boolean
  dragId: string | null
  dropBefore?: string | null
}

export function Rack({ tiles, selected, marked, exchangeMode, dragId, dropBefore }: Props) {
  return (
    <div className={['wb-rack', dropBefore === null ? 'drop-end' : ''].filter(Boolean).join(' ')} data-rack="1" role="list" aria-label="Chevalet">
      {tiles.map((tile) => {
        const active = exchangeMode ? marked.includes(tile.id) : selected === tile.id
        return (
          <span
            key={tile.id}
            role="listitem"
            data-tile-id={tile.id}
            data-rack-tile={tile.id}
            data-origin="rack"
            data-locked="0"
            className={[
              'wb-tile',
              active ? 'on' : '',
              tile.blank ? 'is-blank' : '',
              dragId === tile.id ? 'lifting' : '',
              dropBefore === tile.id ? 'slot' : '',
            ].filter(Boolean).join(' ')}
            aria-label={tile.blank ? 'Joker' : `${tile.letter}, ${tile.points} points`}
          >
            {tile.blank ? '?' : tile.letter}
            <small>{tile.blank ? '' : tile.points}</small>
          </span>
        )
      })}
    </div>
  )
}
