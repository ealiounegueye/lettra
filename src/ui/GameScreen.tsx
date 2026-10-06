import { useEffect, useRef, useState } from 'react'
import { formatClock } from '../engine/clock.ts'
import {
  clearPending,
  createGame,
  cycleBlank,
  exchangeTiles,
  lift,
  movePending,
  passTurn,
  place,
  playMove,
  previewPlay,
  reorderRack,
  reveal,
  shuffleRack,
  tick,
} from '../engine/game.ts'
import type { GameState, Tile } from '../engine/types.ts'
import { speak } from '../speech.ts'
import { Board, type Arrow } from './Board.tsx'
import { Rack } from './Rack.tsx'

const SIZE = 15

type Press = {
  pointerId: number
  x: number
  y: number
  startX: number
  startY: number
  tileId: string | null
  locked: boolean
  origin: 'rack' | 'board' | 'cell'
  row?: number
  col?: number
  moved: boolean
}

type Props = {
  players: [string, string]
  minutes: number
  announceDefault: boolean
  onExit: () => void
}

export function GameScreen({ players, minutes, announceDefault, onExit }: Props) {
  const [game, setGame] = useState(() => createGame(players, minutes))
  const [selected, setSelected] = useState<string | null>(null)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [marked, setMarked] = useState<string[]>([])
  const [arrow, setArrow] = useState<Arrow | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [announce, setAnnounce] = useState(announceDefault)
  const [ghost, setGhost] = useState<Press | null>(null)
  const press = useRef<Press | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const lastBlank = useRef<{ id: string; at: number } | null>(null)

  const playing = game.phase === 'play'
  const rack = game.racks[game.turn]
  const visible = rack.filter((tile) => !game.pending.some((item) => item.tileId === tile.id))
  const preview = playing ? previewPlay(game) : null
  const canExchange = game.bag.length >= 7

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (game.phase !== 'play') return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const delta = now - last
      last = now
      setGame((current) => (current.phase === 'play' ? tick(current, delta) : current))
    }, 200)
    return () => window.clearInterval(id)
  }, [game.phase, game.turn])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!playing || exchangeMode) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement && target !== keyRef.current) return
      if (event.key === 'Enter') {
        event.preventDefault()
        commit()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        erase()
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        flip()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        nudge('across', 0, 1)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        nudge('across', 0, -1)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        nudge('down', 1, 0)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        nudge('down', -1, 0)
        return
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault()
        typeLetter(event.key.toUpperCase())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function showError(message: string) {
    setToast(message)
  }

  function resetUi() {
    setSelected(null)
    setExchangeMode(false)
    setMarked([])
    setArrow(null)
    setGhost(null)
    press.current = null
  }

  function focusKeys() {
    keyRef.current?.focus({ preventScroll: true })
  }

  function shift(from: Arrow, delta: number): Arrow | null {
    const row = from.row + (from.dir === 'down' ? delta : 0)
    const col = from.col + (from.dir === 'across' ? delta : 0)
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return null
    return { row, col, dir: from.dir }
  }

  function occupied(state: GameState, row: number, col: number): string | null {
    return state.board[row][col]?.letter ?? state.pending.find((item) => item.row === row && item.col === col)?.letter ?? null
  }

  function put(state: GameState, tile: Tile, row: number, col: number, letter: string) {
    const occupant = state.pending.find((item) => item.row === row && item.col === col)
    const base = occupant ? lift(state, row, col) : state
    return place(base, tile.id, row, col, letter)
  }

  function typeLetter(letter: string) {
    const spot = arrow ?? { row: 7, col: 7, dir: 'across' as const }
    if (!arrow) setArrow(spot)
    const there = occupied(game, spot.row, spot.col)
    if (there) {
      if (there !== letter) {
        showError(`Il y a déjà ${there} sur cette case.`)
        return
      }
      const next = shift(spot, 1)
      if (next) setArrow(next)
      return
    }
    const free = rack.filter((tile) => !game.pending.some((item) => item.tileId === tile.id))
    const tile = free.find((item) => !item.blank && item.letter === letter) ?? free.find((item) => item.blank)
    if (!tile) {
      showError(`Pas de ${letter} sur le chevalet.`)
      return
    }
    const result = put(game, tile, spot.row, spot.col, letter)
    if (!result.ok) {
      showError(result.error)
      return
    }
    setGame(result.state)
    setSelected(null)
    const next = shift(spot, 1)
    if (next) setArrow(next)
  }

  function erase() {
    if (!arrow) return
    const prev = shift(arrow, -1)
    if (!prev) return
    if (game.pending.some((item) => item.row === prev.row && item.col === prev.col)) {
      setGame(lift(game, prev.row, prev.col))
    }
    setArrow(prev)
  }

  function flip() {
    setArrow((current) => {
      const base = current ?? { row: 7, col: 7, dir: 'across' as const }
      return { ...base, dir: base.dir === 'across' ? 'down' : 'across' }
    })
  }

  function nudge(dir: Arrow['dir'], dRow: number, dCol: number) {
    setArrow((current) => {
      const base = current ?? { row: 7, col: 7, dir }
      return {
        row: Math.min(SIZE - 1, Math.max(0, base.row + dRow)),
        col: Math.min(SIZE - 1, Math.max(0, base.col + dCol)),
        dir,
      }
    })
    focusKeys()
  }

  function commit() {
    const played = playMove(game)
    if (!played.ok) {
      showError(played.error)
      return
    }
    setGame(played.state)
    resetUi()
    if (announce) speak(played.spoken)
  }

  function onPass() {
    setGame(passTurn(clearPending(game)))
    resetUi()
  }

  function confirmExchange() {
    const result = exchangeTiles(game, marked)
    if (!result.ok) {
      showError(result.error)
      return
    }
    setGame(result.state)
    resetUi()
  }

  function rematch() {
    setGame(createGame(players, minutes))
    resetUi()
    setToast(null)
  }

  function tileById(id: string): Tile | undefined {
    return rack.find((tile) => tile.id === id)
  }

  function tapCell(row: number, col: number, tileId: string | null) {
    const draft = game.pending.find((item) => item.row === row && item.col === col)
    if (draft && tileById(draft.tileId)?.blank) {
      const now = Date.now()
      if (lastBlank.current?.id === draft.tileId && now - lastBlank.current.at < 280) {
        setGame(cycleBlank(game, row, col, -1))
      } else {
        setGame(cycleBlank(game, row, col, 1))
      }
      lastBlank.current = { id: draft.tileId, at: now }
      focusKeys()
      return
    }
    if (draft && tileId) {
      const now = Date.now()
      if (lastBlank.current?.id === tileId && now - lastBlank.current.at < 320) {
        setGame(lift(game, row, col))
        lastBlank.current = null
        return
      }
      lastBlank.current = { id: tileId, at: now }
    }
    if (selected && !game.board[row][col] && !draft) {
      const tile = tileById(selected)
      if (!tile) return
      const result = put(game, tile, row, col, tile.blank ? 'A' : tile.letter)
      if (!result.ok) showError(result.error)
      else {
        setGame(result.state)
        setSelected(null)
        const dir = arrow?.dir ?? 'across'
        const next = shift({ row, col, dir }, 1)
        if (next) setArrow(next)
      }
      focusKeys()
      return
    }
    if (arrow && arrow.row === row && arrow.col === col) {
      setArrow({ ...arrow, dir: arrow.dir === 'across' ? 'down' : 'across' })
    } else {
      setArrow({ row, col, dir: arrow?.dir ?? 'across' })
    }
    focusKeys()
  }

  function tapRack(tileId: string) {
    if (exchangeMode) {
      setMarked((current) => (current.includes(tileId) ? current.filter((id) => id !== tileId) : [...current, tileId]))
      return
    }
    const tile = tileById(tileId)
    if (!tile) return
    if (!arrow) {
      setSelected((current) => (current === tileId ? null : tileId))
      return
    }
    let spot = arrow
    while (occupied(game, spot.row, spot.col)) {
      const next = shift(spot, 1)
      if (!next) {
        showError('Plus de place dans ce sens.')
        return
      }
      spot = next
    }
    const result = put(game, tile, spot.row, spot.col, tile.blank ? 'A' : tile.letter)
    if (!result.ok) {
      showError(result.error)
      return
    }
    setGame(result.state)
    setSelected(null)
    const next = shift(spot, 1)
    if (next) setArrow(next)
  }

  function drop(source: Press) {
    const target = hitAt(source.x, source.y, source.tileId)
    if (!source.tileId || !target) return
    if (source.origin === 'board' && source.row !== undefined && source.col !== undefined) {
      if (target.kind === 'cell') {
        const result = movePending(game, source.row, source.col, target.row, target.col)
        if (!result.ok) showError(result.error)
        else {
          setGame(result.state)
          const dir = arrow?.dir ?? 'across'
          const next = shift({ row: target.row, col: target.col, dir }, 1)
          if (next) setArrow(next)
        }
      } else {
        setGame(lift(game, source.row, source.col))
      }
      return
    }
    if (source.origin === 'rack') {
      const tile = tileById(source.tileId)
      if (!tile) return
      if (target.kind === 'cell') {
        if (game.board[target.row][target.col]) {
          showError('Cette case est déjà prise.')
          return
        }
        const result = put(game, tile, target.row, target.col, tile.blank ? 'A' : tile.letter)
        if (!result.ok) showError(result.error)
        else {
          setGame(result.state)
          setSelected(null)
          const dir = arrow?.dir ?? 'across'
          const next = shift({ row: target.row, col: target.col, dir }, 1)
          if (next) setArrow(next)
        }
      } else if (target.kind === 'rack-tile') {
        setGame(reorderRack(game, source.tileId, target.id))
      }
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!playing || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input')) return
    const tile = target.closest('[data-tile-id]') as HTMLElement | null
    const cell = target.closest('[data-cell]') as HTMLElement | null
    if (!tile && !cell) return
    const next: Press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      tileId: tile?.dataset.tileId ?? null,
      locked: tile?.dataset.locked === '1',
      origin: tile?.dataset.origin === 'rack' ? 'rack' : tile ? 'board' : 'cell',
      row: cell ? Number(cell.dataset.row) : undefined,
      col: cell ? Number(cell.dataset.col) : undefined,
      moved: false,
    }
    press.current = next
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (!current.moved && distance < 8) return
    if (!current.tileId || current.locked || exchangeMode) return
    current.moved = true
    current.x = event.clientX
    current.y = event.clientY
    setGhost({ ...current })
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const current = press.current
    press.current = null
    setGhost(null)
    if (!current || current.pointerId !== event.pointerId || !playing) return
    current.x = event.clientX
    current.y = event.clientY
    if (current.moved && current.tileId && !current.locked) {
      drop(current)
      return
    }
    if (exchangeMode && current.origin === 'rack' && current.tileId) {
      tapRack(current.tileId)
      return
    }
    if (current.origin === 'rack' && current.tileId) tapRack(current.tileId)
    else if (current.row !== undefined && current.col !== undefined) tapCell(current.row, current.col, current.tileId)
  }

  const ghostTile = ghost?.tileId ? tileById(ghost.tileId) : undefined
  const ghostLetter = ghost?.origin === 'board'
    ? game.pending.find((item) => item.tileId === ghost.tileId)?.letter
    : ghostTile?.blank ? '?' : ghostTile?.letter

  return (
    <div
      className={`phone game wb side-${game.turn}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { press.current = null; setGhost(null) }}
    >
      <header className="wb-players">
        {game.players.map((name, index) => {
          const player = index as 0 | 1
          const hot = game.phase !== 'over' && game.turn === player
          const urgent = game.phase === 'play' && hot && game.clockMs[player] < 30_000
          return (
            <div key={player} className={hot ? `wb-plate side-${player} hot` : `wb-plate side-${player}`}>
              <span>{name}</span>
              <strong>{game.scores[player]}</strong>
              <em className={urgent ? 'urgent' : ''}>{formatClock(game.clockMs[player])}</em>
            </div>
          )
        })}
      </header>

      <div className="board-slot">
        <Board
          board={game.board}
          pending={game.pending}
          rack={rack}
          turn={game.turn}
          arrow={playing ? arrow : null}
          dragId={ghost?.tileId ?? null}
        />
      </div>

      <div className="wb-status">
        <span>Sac {game.bag.length}</span>
        <span className="wb-hint">{toast ?? hint(game, Boolean(arrow))}</span>
        <strong className={preview && !preview.defined ? 'suspect' : ''}>{preview ? preview.score : ''}</strong>
        <button
          type="button"
          className={announce ? 'wb-voice on' : 'wb-voice'}
          aria-pressed={announce}
          aria-label={announce ? 'Couper la voix' : 'Annoncer les mots'}
          onClick={() => setAnnounce((value) => !value)}
        >
          ♪
        </button>
      </div>

      {game.phase === 'handoff' && (
        <section className="sheet">
          <p className="eyebrow">Au tour de</p>
          <h2>{game.players[game.turn]}</h2>
          <p>Passe le téléphone. Le chevalet reste caché.</p>
          <button type="button" className="ok" onClick={() => setGame(reveal(game))}>C’est à moi</button>
        </section>
      )}

      {game.phase === 'over' && (
        <section className="sheet">
          <p className="eyebrow">Partie terminée</p>
          <h2>{resultTitle(game)}</h2>
          <p>{resultDetail(game)}</p>
          <div className="row">
            <button type="button" className="ok" onClick={rematch}>Revanche</button>
            <button type="button" className="wb-plain" onClick={onExit}>Quitter</button>
          </div>
        </section>
      )}

      {playing && (
        <>
          <Rack
            tiles={visible}
            selected={selected}
            marked={marked}
            exchangeMode={exchangeMode}
            dragId={ghost?.tileId ?? null}
          />
          {exchangeMode && (
            <p className="wb-change">Touche les jetons à rendre, puis OK.</p>
          )}
          <div className="wb-actions">
            {exchangeMode ? (
              <>
                <button type="button" className="wb-plain" onClick={() => { setExchangeMode(false); setMarked([]) }}>Annuler</button>
                <button type="button" className="ok" onClick={confirmExchange}>OK</button>
              </>
            ) : (
              <>
                <button type="button" className="ok" onClick={commit}>OK</button>
                <button type="button" className="wb-plain" onClick={onPass}>Passer</button>
                <button
                  type="button"
                  className="wb-plain"
                  disabled={!canExchange}
                  onClick={() => { setExchangeMode(true); setSelected(null); setMarked([]) }}
                >
                  Changer
                </button>
                <button type="button" className="wb-plain" onClick={() => setGame(shuffleRack(game))}>Mélanger</button>
              </>
            )}
          </div>
        </>
      )}

      {ghost && ghostLetter && (
        <span className={`drag-ghost wb-tile owner-${game.turn}`} style={{ left: ghost.x, top: ghost.y }}>
          {ghostLetter}
          <small>{ghostTile?.blank ? '' : ghostTile?.points}</small>
        </span>
      )}

      <input
        ref={keyRef}
        className="wb-catch"
        aria-label="Taper le mot"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        value=""
        onChange={() => undefined}
      />
    </div>
  )
}

function hint(game: GameState, hasArrow: boolean): string {
  if (game.lastMove && !hasArrow) return `${game.players[game.lastMove.player]} · ${game.lastMove.label} · ${game.lastMove.score}`
  if (!hasArrow) return 'Touche la case de départ'
  return game.pending.length > 0 ? 'Flèche : sens du mot. Entrée ou OK.' : 'Tape ou glisse les lettres'
}

function resultTitle(game: GameState): string {
  if (game.winner === null) return 'Égalité'
  return `${game.players[game.winner]} gagne`
}

function resultDetail(game: GameState): string {
  if (game.overReason === 'time') {
    const loser = game.winner === 0 ? 1 : 0
    return `${game.players[loser]} n’a plus de temps.`
  }
  if (game.overReason === 'passes') return 'Deux passes de suite. Les jetons restants sont retirés.'
  if (game.overReason === 'played-out') return 'Toutes les lettres ont été posées.'
  return ''
}

function hitAt(x: number, y: number, ignoreId: string | null) {
  for (const node of document.elementsFromPoint(x, y)) {
    const el = node as HTMLElement
    const tile = el.closest('[data-tile-id]') as HTMLElement | null
    if (ignoreId && tile?.dataset.tileId === ignoreId && tile.dataset.locked !== '1') continue
    const cell = el.closest('[data-cell]') as HTMLElement | null
    if (cell?.dataset.row && cell.dataset.col) {
      return { kind: 'cell' as const, row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
    }
    const rackTile = el.closest('[data-rack-tile]') as HTMLElement | null
    if (rackTile?.dataset.tileId && rackTile.dataset.tileId !== ignoreId) {
      return { kind: 'rack-tile' as const, id: rackTile.dataset.tileId }
    }
    if (el.closest('[data-rack]')) return { kind: 'rack' as const }
  }
  return null
}
