import { useEffect, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react'
import { botPlay } from '../engine/bot.ts'
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
import { addIncrement } from '../club/rules.ts'
import { speak } from '../speech.ts'
import type { Arrow } from './Board.tsx'

const SIZE = 15

export type TableSetup = {
  key: string
  players: [string, string]
  minutes: number
  incrementSec: number
  bot: boolean
  announceDefault: boolean
}

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
  overRack: boolean
  dropBefore: string | null
}

export function useTable(setup: TableSetup | null, onMove?: (line: string) => void) {
  const setupKey = setup?.key ?? ''
  const [seenKey, setSeenKey] = useState(setupKey)
  const [game, setGame] = useState(() => createGame(setup?.players ?? ['.', '.'], setup?.minutes ?? 10))
  const [selected, setSelected] = useState<string | null>(null)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [marked, setMarked] = useState<string[]>([])
  const [arrow, setArrow] = useState<Arrow | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [announce, setAnnounce] = useState(setup?.announceDefault ?? true)
  const [ghost, setGhost] = useState<Press | null>(null)
  const [thinking, setThinking] = useState(false)
  const press = useRef<Press | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const lastBlank = useRef<{ id: string; at: number } | null>(null)
  const onMoveRef = useRef(onMove)
  const setupRef = useRef(setup)
  const announceRef = useRef(announce)
  const handledBot = useRef('')

  useEffect(() => {
    onMoveRef.current = onMove
    setupRef.current = setup
    announceRef.current = announce
  })

  useEffect(() => {
    handledBot.current = ''
    press.current = null
  }, [setupKey])

  if (setupKey !== seenKey) {
    setSeenKey(setupKey)
    setSelected(null)
    setExchangeMode(false)
    setMarked([])
    setArrow(null)
    setGhost(null)
    setToast(null)
    setThinking(false)
    if (setup) setGame(createGame(setup.players, setup.minutes))
  }

  const playing = Boolean(setup) && game.phase === 'play'
  const botOn = setup?.bot ?? false
  const botKey = setup?.key
  const botIncrement = setup?.incrementSec ?? 0
  const lastLabel = game.lastMove?.label
  const scoreLeft = game.scores[0]
  const scoreRight = game.scores[1]
  const rack = game.racks[game.turn]
  const visible = rack.filter((tile) => !game.pending.some((item) => item.tileId === tile.id))
  const preview = playing ? previewPlay(game) : null
  const canExchange = game.bag.length >= 7

  useClock(setup, game, setGame)
  useBot({
    botOn,
    botKey,
    botIncrement,
    phase: game.phase,
    turn: game.turn,
    lastLabel,
    scoreLeft,
    scoreRight,
    game,
    setGame,
    setThinking,
    handledBot,
    announceRef,
    onMoveRef,
  })
  useToast(toast, setToast)
  useKeys({
    playing,
    exchangeMode,
    keyRef,
    commit,
    erase,
    flip,
    nudge,
    typeLetter,
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

  function note(line: string, spoken?: string) {
    if (spoken && announceRef.current) speak(spoken)
    onMoveRef.current?.(line)
  }

  function commit() {
    if (!setupRef.current) return
    let failed = ''
    let line = ''
    let spoken = ''
    setGame((current) => {
      if (current.phase !== 'play') return current
      const played = playMove(current)
      if (!played.ok) {
        failed = played.error
        return current
      }
      const bingo = current.pending.length === 7
      spoken = bingo ? `${played.spoken}, dont 50 de prime` : played.spoken
      line = `${current.players[current.turn]} : ${spoken}`
      return addIncrement(played.state, current.turn, setupRef.current?.incrementSec ?? 0)
    })
    if (failed) {
      showError(failed)
      return
    }
    if (line) {
      note(line, spoken)
      resetUi()
    }
  }

  function onPass() {
    if (!setupRef.current) return
    let line = ''
    setGame((current) => {
      if (current.phase !== 'play') return current
      line = `${current.players[current.turn]} passe.`
      return addIncrement(passTurn(clearPending(current)), current.turn, setupRef.current?.incrementSec ?? 0)
    })
    if (!line) return
    note(line, 'Passe')
    resetUi()
  }

  function confirmExchange() {
    if (!setupRef.current) return
    let error = ''
    let line = ''
    const ids = marked
    setGame((current) => {
      const result = exchangeTiles(current, ids)
      if (!result.ok) {
        error = result.error
        return current
      }
      line = `${current.players[current.turn]} change des jetons.`
      return addIncrement(result.state, current.turn, setupRef.current?.incrementSec ?? 0)
    })
    if (error) {
      showError(error)
      return
    }
    if (line) note(line)
    resetUi()
  }

  function rematch() {
    const current = setupRef.current
    if (!current) return
    handledBot.current = ''
    setGame(createGame(current.players, current.minutes))
    resetUi()
    setToast(null)
  }

  function revealTurn() {
    setGame((current) => reveal(current))
  }

  function shuffle() {
    setGame((current) => shuffleRack(current))
  }

  function startExchange() {
    setExchangeMode(true)
    setSelected(null)
    setMarked([])
  }

  function cancelExchange() {
    setExchangeMode(false)
    setMarked([])
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

  function tileById(id: string): Tile | undefined {
    return rack.find((tile) => tile.id === id)
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
    if (!source.tileId) return
    const slot = rackSlot(source.x, source.y, source.tileId)
    if (slot.over) {
      const parked = source.origin === 'board' && source.row !== undefined && source.col !== undefined
        ? lift(game, source.row, source.col)
        : game
      setGame(reorderRack(parked, source.tileId, slot.before))
      setSelected(null)
      return
    }
    const target = hitAt(source.x, source.y, source.tileId)
    if (!target) return
    if (source.origin === 'board' && source.row !== undefined && source.col !== undefined) {
      if (target.kind === 'cell') {
        const result = movePending(game, source.row, source.col, target.row, target.col)
        if (!result.ok) showError(result.error)
        else {
          setGame(result.state)
          follow(result.state, target.row, target.col)
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
          follow(result.state, target.row, target.col)
        }
      }
    }
  }

  function follow(state: GameState, row: number, col: number) {
    const rows = new Set(state.pending.map((item) => item.row))
    const cols = new Set(state.pending.map((item) => item.col))
    const dir: Arrow['dir'] = rows.size <= 1 ? 'across' : cols.size <= 1 ? 'down' : (arrow?.dir ?? 'across')
    const next = shift({ row, col, dir }, 1)
    setArrow(next ?? { row, col, dir })
  }

  function repeatTap(tileId: string): boolean {
    const now = Date.now()
    const previous = lastBlank.current
    if (previous && previous.id === tileId && now - previous.at < 450) {
      lastBlank.current = null
      return true
    }
    lastBlank.current = { id: tileId, at: now }
    return false
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!playing || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, textarea')) return
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
      overRack: false,
      dropBefore: null,
    }
    press.current = next
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (!current.moved && distance < 8) return
    if (!current.tileId || current.locked || exchangeMode) return
    current.moved = true
    current.x = event.clientX
    current.y = event.clientY
    const slot = rackSlot(event.clientX, event.clientY, current.tileId)
    current.overRack = slot.over
    current.dropBefore = slot.before
    setGhost({ ...current })
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
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
    if (
      current.origin === 'board'
      && !current.locked
      && current.tileId
      && current.row !== undefined
      && current.col !== undefined
      && repeatTap(current.tileId)
    ) {
      setGame(lift(game, current.row, current.col))
      setSelected(null)
      return
    }
    if (current.origin === 'rack' && current.tileId) tapRack(current.tileId)
    else if (current.row !== undefined && current.col !== undefined) tapCell(current.row, current.col, current.tileId)
  }

  function onPointerCancel() {
    press.current = null
    setGhost(null)
  }

  const ghostTile = ghost?.tileId ? tileById(ghost.tileId) : undefined
  const ghostLetter = ghost?.origin === 'board'
    ? game.pending.find((item) => item.tileId === ghost.tileId)?.letter
    : ghostTile?.blank ? '?' : ghostTile?.letter

  return {
    game,
    selected,
    exchangeMode,
    marked,
    arrow,
    toast,
    announce,
    setAnnounce,
    ghost,
    ghostTile,
    ghostLetter,
    thinking,
    playing,
    rack,
    visible,
    preview,
    canExchange,
    keyRef,
    clock: formatClock,
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    commit,
    onPass,
    confirmExchange,
    startExchange,
    cancelExchange,
    shuffle,
    rematch,
    revealTurn,
    focusKeys,
  }
}

function useClock(
  setup: TableSetup | null,
  game: GameState,
  setGame: Dispatch<SetStateAction<GameState>>,
) {
  const active = Boolean(setup) && game.phase === 'play'
  const turn = game.turn
  const key = setup?.key
  useEffect(() => {
    if (!active) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const delta = now - last
      last = now
      if (document.hidden) return
      setGame((current) => (current.phase === 'play' ? tick(current, delta) : current))
    }, 200)
    return () => window.clearInterval(id)
  }, [active, key, turn, setGame])
}

function useBot(input: {
  botOn: boolean
  botKey: string | undefined
  botIncrement: number
  phase: GameState['phase']
  turn: 0 | 1
  lastLabel: string | undefined
  scoreLeft: number
  scoreRight: number
  game: GameState
  setGame: Dispatch<SetStateAction<GameState>>
  setThinking: (value: boolean) => void
  handledBot: RefObject<string>
  announceRef: RefObject<boolean>
  onMoveRef: RefObject<((line: string) => void) | undefined>
}) {
  const {
    botOn,
    botKey,
    botIncrement,
    phase,
    turn,
    lastLabel,
    scoreLeft,
    scoreRight,
    game,
    setGame,
    setThinking,
    handledBot,
    announceRef,
    onMoveRef,
  } = input
  useEffect(() => {
    if (!botOn || phase !== 'handoff' || turn !== 1) return
    const token = `${botKey ?? ''}:${lastLabel ?? ''}:${scoreLeft}-${scoreRight}`
    if (handledBot.current === token) return
    setThinking(true)
    const snapshot = game
    const timer = window.setTimeout(() => {
      if (handledBot.current === token) return
      handledBot.current = token
      const live = reveal(snapshot)
      const played = botPlay(live)
      let next = addIncrement(played.state, 1, botIncrement)
      if (next.phase === 'handoff' && next.turn === 0) next = reveal(next)
      const said = played.passed ? 'passe.' : played.spoken
      if (announceRef.current && played.spoken) speak(played.passed ? 'Passe' : played.spoken)
      onMoveRef.current?.(`${snapshot.players[1]} : ${said}`)
      setGame(next)
      setThinking(false)
    }, 700)
    return () => {
      window.clearTimeout(timer)
      setThinking(false)
    }
  }, [botOn, botKey, botIncrement, phase, turn, lastLabel, scoreLeft, scoreRight, game, setGame, setThinking, handledBot, announceRef, onMoveRef])
}

function useToast(toast: string | null, setToast: (value: string | null) => void) {
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(id)
  }, [toast, setToast])
}

function useKeys(args: {
  playing: boolean
  exchangeMode: boolean
  keyRef: RefObject<HTMLInputElement | null>
  commit: () => void
  erase: () => void
  flip: () => void
  nudge: (dir: Arrow['dir'], dRow: number, dCol: number) => void
  typeLetter: (letter: string) => void
}) {
  const ref = useRef(args)
  useEffect(() => {
    ref.current = args
  })
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const current = ref.current
      if (!current.playing || current.exchangeMode) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button') && target !== current.keyRef.current) return
      if (event.key === 'Enter') {
        event.preventDefault()
        current.commit()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        current.erase()
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        current.flip()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        current.nudge('across', 0, 1)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        current.nudge('across', 0, -1)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        current.nudge('down', 1, 0)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        current.nudge('down', -1, 0)
        return
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault()
        current.typeLetter(event.key.toUpperCase())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function rackSlot(x: number, y: number, ignoreId: string | null): { over: boolean; before: string | null } {
  const rack = document.querySelector('[data-rack]')
  if (!rack) return { over: false, before: null }
  const box = rack.getBoundingClientRect()
  const over = x >= box.left - 8 && x <= box.right + 8 && y >= box.top - 12 && y <= box.bottom + 12
  if (!over) return { over: false, before: null }
  const tiles = [...rack.querySelectorAll<HTMLElement>('[data-rack-tile]')]
  for (const tile of tiles) {
    const id = tile.dataset.tileId
    if (!id || id === ignoreId) continue
    const tileBox = tile.getBoundingClientRect()
    if (x < tileBox.left + tileBox.width / 2) return { over: true, before: id }
  }
  return { over: true, before: null }
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
