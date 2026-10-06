import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { observedMatch } from '../club/demo.ts'
import { loadProfile, provisional, saveProfile, type Profile } from '../club/profile.ts'
import { OPEN_SEEKS, playerByNick, ROSTER, TABLES } from '../club/roster.ts'
import {
  CHALLENGE_TEXT,
  findOpponent,
  rateLine,
  rateResult,
  type Challenge,
  type OpenSeek,
} from '../club/rules.ts'
import { emptyGrid } from '../engine/board.ts'
import { formatClock } from '../engine/clock.ts'
import { lexiconNote, setImportedWords } from '../engine/lexicon.ts'
import { clearImportedLexicon, loadImportedLexicon, saveImportedLexicon, wordsInText } from '../engine/lexiconStore.ts'
import type { GameState, Tile } from '../engine/types.ts'
import { speak } from '../speech.ts'
import { Board } from './Board.tsx'
import { hint, resultDetail, resultTitle } from './caption.ts'
import { Rack } from './Rack.tsx'
import { useTable, type TableSetup } from './useTable.ts'

const EMPTY_BOARD = emptyGrid<Tile | null>(null)
const MINUTES = [1, 2, 3, 5, 10, 15, 20, 25, 30]
const CHALLENGES: Challenge[] = ['SINGLE', 'DOUBLE', '5-POINTS', 'VOID']

type Tool = 'seek' | 'matcher' | 'duplicate' | 'observe' | 'players' | 'settings' | 'help'
type Line = { id: number; kind: 'room' | 'you'; text: string }
type Match = {
  key: string
  players: [string, string]
  ratings: [number | null, number | null]
  minutes: number
  incrementSec: number
  rated: boolean
  challenge: Challenge
  kind: 'seek' | 'local' | 'duplicate'
  bot: boolean
}
type Watch = { id: string; state: GameState; players: [string, string] }

function welcome(nick: string): Line[] {
  return [
    { id: 1, kind: 'room', text: `${nick} entre dans le salon.` },
    { id: 2, kind: 'room', text: 'Lexique de départ : des mots courants, pas une liste de tournoi.' },
    { id: 3, kind: 'room', text: '.' },
  ]
}

function padClock(ms: number): string {
  const [minutes, seconds] = formatClock(ms).split(':')
  return `${(minutes ?? '0').padStart(2, '0')}:${seconds ?? '00'}`
}

function markOnce(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
    return true
  } catch {
    return true
  }
}

function rateTag(value: number | null, games?: number): string {
  if (value === null) return '(—)'
  if (games !== undefined && provisional(games)) return `(${value} prov.)`
  return `(${value})`
}

export function ClubScreen() {
  const loaded = useState(loadProfile)[0]
  const [profile, setProfile] = useState<Profile>(loaded)
  const [inRoom, setInRoom] = useState(loaded.nick.length >= 2)
  const [nickDraft, setNickDraft] = useState(loaded.nick)
  const [nickError, setNickError] = useState('')
  const [lines, setLines] = useState<Line[]>(() => (loaded.nick ? welcome(loaded.nick) : []))
  const [draft, setDraft] = useState('')
  const [tool, setTool] = useState<Tool>('seek')
  const [minutes, setMinutes] = useState(10)
  const [increment, setIncrement] = useState(0)
  const [challenge, setChallenge] = useState<Challenge>('5-POINTS')
  const [rated, setRated] = useState(true)
  const [minRating, setMinRating] = useState(0)
  const [maxRating, setMaxRating] = useState(9999)
  const [fairplayOnly, setFairplayOnly] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [searching, setSearching] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [watching, setWatching] = useState<Watch | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [lexiconLabel, setLexiconLabel] = useState('liste de départ')
  const [lexiconBusy, setLexiconBusy] = useState(false)
  const [lexiconError, setLexiconError] = useState('')
  const lineId = useRef(4)
  const logRef = useRef<HTMLDivElement>(null)
  const talkRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<number | null>(null)
  const matchRef = useRef<Match | null>(match)
  const profileRef = useRef(profile)
  matchRef.current = match
  profileRef.current = profile

  const setup: TableSetup | null = match
    ? {
        key: match.key,
        players: match.players,
        minutes: match.minutes,
        incrementSec: match.incrementSec,
        bot: match.bot,
        announceDefault: profile.announce,
      }
    : null

  const table = useTable(setup, (line) => {
    if (!matchRef.current) return
    push(line)
  })
  const gameRef = useRef(table.game)
  gameRef.current = table.game

  const setAnnounce = table.setAnnounce
  useEffect(() => {
    setAnnounce(profile.announce)
  }, [profile.announce, setAnnounce])

  useEffect(() => {
    const node = logRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [lines, inRoom])

  useEffect(() => () => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
  }, [])

  useEffect(() => {
    let gone = false
    loadImportedLexicon()
      .then((words) => {
        if (gone || words.length === 0) return
        setImportedWords(words)
        setLexiconLabel(lexiconNote())
      })
      .catch(() => { /* le lexique de départ reste en place */ })
    return () => { gone = true }
  }, [])

  useEffect(() => {
    if (!match || table.game.phase !== 'over') return
    if (!markOnce(`lettra-settled-${match.key}`)) return
    const game = gameRef.current
    const current = profileRef.current
    if (game.winner === null) push('Égalité.')
    else push(`${game.players[game.winner]} gagne, ${game.scores[0]} à ${game.scores[1]}.`)
    const detail = resultDetail(game)
    if (detail) push(detail)
    if (match.rated && match.kind === 'seek') {
      const result = rateResult(current.rating, current.games, game.winner, 0)
      const next = { ...current, rating: result.rating, games: result.games }
      setProfile(next)
      saveProfile(next)
      push(rateLine(current.rating, result.rating, result.delta))
      if (next.announce && game.winner !== null) speak(`${game.players[game.winner]} gagne`)
    } else if (match.kind !== 'duplicate') {
      push('Partie libre. Cote inchangée.')
    }
  }, [match, table.game.phase])

  function push(text: string, kind: Line['kind'] = 'room') {
    const id = lineId.current
    lineId.current += 1
    setLines((current) => [...current.slice(-99), { id, kind, text }])
  }

  function insertNick(nick: string) {
    setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${nick} `)
    talkRef.current?.focus()
  }

  function send(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    push(`${profile.nick} : ${text}`, 'you')
    if (profile.announce) speak(text)
    setDraft('')
  }

  function toggleVoice() {
    const next = { ...profile, announce: !profile.announce }
    setProfile(next)
    saveProfile(next)
  }

  function begin(next: Omit<Match, 'key'>) {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    setSearching(false)
    setWatching(null)
    const created: Match = { ...next, key: `${Date.now()}-${next.players[1]}` }
    matchRef.current = created
    setMatch(created)
    setTool('seek')
    const mode = created.rated ? 'cotée' : 'libre'
    push(`Partie contre ${created.players[1]}. ${created.minutes} min, +${created.incrementSec} s, ${created.challenge}, ${mode}.`)
    if (profile.announce) speak(`Partie contre ${created.players[1]}`)
  }

  function search() {
    if (match) {
      push('Une partie est déjà en cours.')
      return
    }
    if (minRating > maxRating) {
      push('La fourchette de cote est inversée.')
      return
    }
    if (fairplayOnly && !profile.fairplay) {
      push('Signe l’accord fairplay dans les réglages pour cette recherche.')
      return
    }
    setSearching(true)
    const form = { minutes, increment, challenge, rated, minRating, maxRating, fairplayOnly }
    push(`Recherche : ${minutes} min, +${increment} s, ${challenge}, ${rated ? 'cotée' : 'libre'}.`)
    if (profile.announce) speak('Recherche d’une partie')
    searchTimer.current = window.setTimeout(() => {
      setSearching(false)
      if (matchRef.current) return
      const found = findOpponent(form, profileRef.current.rating, OPEN_SEEKS)
      if (!found) {
        push('Personne dans cette fourchette.')
        return
      }
      if (!found.exact) push(`${found.seek.nick} accepte une partie dans ta fourchette.`)
      begin({
        players: [profileRef.current.nick, found.seek.nick],
        ratings: [profileRef.current.rating, found.seek.rating],
        minutes: found.exact ? minutes : found.seek.minutes,
        incrementSec: found.exact ? increment : found.seek.increment,
        rated: found.exact ? rated : found.seek.rated,
        challenge: found.exact ? challenge : found.seek.challenge,
        kind: 'seek',
        bot: true,
      })
    }, 800)
  }

  function cancelForm() {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    if (searching) {
      setSearching(false)
      push('Recherche annulée.')
      return
    }
    setMinutes(10)
    setIncrement(0)
    setChallenge('5-POINTS')
    setRated(true)
    setMinRating(0)
    setMaxRating(9999)
    setFairplayOnly(false)
    setAdvanced(false)
  }

  function acceptSeek(seek: OpenSeek) {
    if (match) {
      push('Une partie est déjà en cours.')
      return
    }
    if (profile.rating < seek.minRating || profile.rating > seek.maxRating) {
      push('Ta cote est hors de sa fourchette.')
      return
    }
    if (seek.fairplay && !profile.fairplay) {
      push(`${seek.nick} demande l’accord fairplay. Tu peux le signer dans les réglages.`)
      return
    }
    begin({
      players: [profile.nick, seek.nick],
      ratings: [profile.rating, seek.rating],
      minutes: seek.minutes,
      incrementSec: seek.increment,
      rated: seek.rated,
      challenge: seek.challenge,
      kind: 'seek',
      bot: true,
    })
  }

  function defy(nick: string, rating: number, fairplay: boolean) {
    if (match) {
      push('Une partie est déjà en cours.')
      return
    }
    if (fairplayOnly && !fairplay) {
      push(`${nick} n’a pas signé l’accord fairplay.`)
      return
    }
    if (fairplayOnly && !profile.fairplay) {
      push('Signe l’accord fairplay dans les réglages.')
      return
    }
    begin({
      players: [profile.nick, nick],
      ratings: [profile.rating, rating],
      minutes,
      incrementSec: increment,
      rated,
      challenge,
      kind: 'seek',
      bot: true,
    })
  }

  function startLocal() {
    if (match) {
      push('Une partie est déjà en cours.')
      return
    }
    begin({
      players: [profile.nick, 'Partenaire'],
      ratings: [profile.rating, null],
      minutes,
      incrementSec: increment,
      rated: false,
      challenge,
      kind: 'local',
      bot: false,
    })
    push('Deux joueurs, un téléphone. Passe l’appareil à chaque coup.')
  }

  function startDuplicate() {
    if (match) {
      push('Une partie est déjà en cours.')
      return
    }
    begin({
      players: [profile.nick, 'Salle'],
      ratings: [profile.rating, null],
      minutes,
      incrementSec: 0,
      rated: false,
      challenge: 'VOID',
      kind: 'duplicate',
      bot: false,
    })
    push('Duplicate : pose un seul mot, puis OK.')
  }

  function openTable(id: string, players: [string, string]) {
    if (match) {
      push('Termine ou annule la partie en cours.')
      return
    }
    if (watching?.id === id) return
    const observed = observedMatch(players)
    setWatching({ id, state: observed.state, players })
    setTool('observe')
    push(`Tu observes ${players[0]} contre ${players[1]}.`)
    for (const line of observed.lines) push(line)
  }

  function abandon() {
    if (!match) return
    const nick = profile.nick
    matchRef.current = null
    setMatch(null)
    setTool('seek')
    push(`Partie annulée par ${nick}.`)
  }

  function leave() {
    matchRef.current = null
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    setSearching(false)
    setMatch(null)
    setWatching(null)
    setInRoom(false)
  }

  function enter(event: FormEvent) {
    event.preventDefault()
    const nick = nickDraft.trim()
    if (!/^[A-Za-z0-9_]{2,16}$/.test(nick)) {
      setNickError('2 à 16 lettres, chiffres ou _.')
      return
    }
    const next = { ...profile, nick }
    setProfile(next)
    saveProfile(next)
    setNickError('')
    lineId.current = 4
    setLines(welcome(nick))
    setInRoom(true)
  }

  function saveNick() {
    const nick = profile.nick.trim()
    if (!/^[A-Za-z0-9_]{2,16}$/.test(nick)) {
      setNickError('2 à 16 lettres, chiffres ou _.')
      return
    }
    setNickError('')
    const next = { ...profile, nick }
    saveProfile(next)
    setProfile(next)
  }

  async function onLexiconFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLexiconBusy(true)
    setLexiconError('')
    try {
      const words = wordsInText(await file.text())
      const count = setImportedWords(words)
      if (count === 0) {
        setLexiconError('Aucun mot lisible dans ce fichier.')
        return
      }
      await saveImportedLexicon(words)
      setLexiconLabel(lexiconNote())
      push(`Liste importée : ${count.toLocaleString('fr-FR')} mots.`)
    } catch {
      setLexiconError('Impossible de lire ce fichier.')
    } finally {
      setLexiconBusy(false)
    }
  }

  async function removeLexicon() {
    setImportedWords(null)
    setLexiconLabel(lexiconNote())
    setLexiconError('')
    try {
      await clearImportedLexicon()
    } catch {
      setLexiconError('La liste est retirée pour cette visite.')
    }
    push('Liste importée retirée.')
  }

  const game = table.game
  const showLive = Boolean(match) && !watching
  const board = watching ? watching.state.board : showLive ? game.board : EMPTY_BOARD
  const pending = showLive ? game.pending : []
  const boardRack = showLive ? game.racks[game.turn] : []
  const boardTurn = showLive ? game.turn : 0
  const showRack = match !== null && !watching && game.phase !== 'over' && (
    match.kind === 'local' ? game.phase === 'play' : game.phase === 'play' || table.thinking
  )
  const showActions = match !== null && !watching && game.phase === 'play' && (!match.bot || game.turn === 0)
  const rackSide = match && match.kind === 'local' ? game.turn : 0
  const rackTiles = match && (match.bot || match.kind === 'duplicate')
    ? game.racks[0].filter((tile) => !game.pending.some((item) => item.tileId === tile.id))
    : table.visible

  const leftName = watching ? watching.players[0] : showLive ? game.players[0] : profile.nick
  const rightName = watching ? watching.players[1] : showLive ? game.players[1] : null
  const leftRating = watching ? (playerByNick(watching.players[0])?.rating ?? null) : profile.rating
  const rightRating = watching
    ? (playerByNick(watching.players[1])?.rating ?? null)
    : (match?.ratings[1] ?? null)
  const scores = watching ? watching.state.scores : showLive ? game.scores : [0, 0] as [number, number]
  const clocks = watching ? watching.state.clockMs : showLive ? game.clockMs : null
  const hotTurn = watching
    ? (watching.state.phase === 'over' ? null : watching.state.turn)
    : (showLive && game.phase !== 'over' ? game.turn : null)

  if (!inRoom) {
    return (
      <div className="club club-door">
        <form className="door-card" onSubmit={enter}>
          <p className="eyebrow">Salon</p>
          <h1>Lettra</h1>
          <p>Entre avec un pseudo. La partie, la pendule et le salon sont sur cet appareil.</p>
          <label>
            Pseudo
            <input
              value={nickDraft}
              maxLength={16}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setNickDraft(event.target.value)}
            />
          </label>
          {nickError && <p className="club-error">{nickError}</p>}
          <button type="submit" className="club-go">Entrer</button>
        </form>
      </div>
    )
  }

  return (
    <div className={['club', showLive ? 'club-live' : 'club-lobby', tool === 'seek' ? 'club-plate' : 'club-sheet', chatOpen ? 'chat-open' : ''].filter(Boolean).join(' ')}>
      <nav className="club-bar" aria-label="Salon">
        <button type="button" className={tool === 'seek' ? 'on' : ''} aria-pressed={tool === 'seek'} aria-label="Plateau" onClick={() => { setWatching(null); setChatOpen(false); setTool('seek') }}><IconBoard /></button>
        <button type="button" className={chatOpen ? 'on' : ''} aria-pressed={chatOpen} aria-label="Discussion" onClick={() => { setChatOpen((open) => !open); talkRef.current?.focus() }}><IconWindow /></button>
        <button type="button" className={tool === 'players' ? 'on' : ''} aria-pressed={tool === 'players'} aria-label="Joueurs" onClick={() => setTool('players')}><IconPeople /></button>
        <button type="button" className={tool === 'observe' ? 'on' : ''} aria-pressed={tool === 'observe'} aria-label="Tables" onClick={() => setTool('observe')}><IconTable /></button>
        <button type="button" className={tool === 'settings' ? 'on' : ''} aria-pressed={tool === 'settings'} aria-label="Réglages" onClick={() => setTool('settings')}><IconGear /></button>
        <button type="button" className={tool === 'help' ? 'on' : ''} aria-pressed={tool === 'help'} aria-label="Aide" onClick={() => setTool('help')}><IconHelp /></button>
        <button type="button" className="club-leave" aria-label="Quitter le salon" onClick={leave}><IconLeave /></button>
      </nav>

      <div className="club-heads">
        <Head
          side="left"
          name={leftName}
          rating={rateTag(leftRating, watching ? undefined : profile.games)}
          score={scores[0]}
          clock={clocks ? padClock(clocks[0]) : null}
          hot={hotTurn === 0}
          urgent={Boolean(showLive && game.phase === 'play' && game.turn === 0 && game.clockMs[0] < 30_000)}
        />
        <Head
          side="right"
          name={rightName ?? '—'}
          rating={rightName ? rateTag(rightRating) : '(—)'}
          score={scores[1]}
          clock={clocks && rightName ? padClock(clocks[1]) : null}
          hot={hotTurn === 1}
          urgent={Boolean(showLive && game.phase === 'play' && game.turn === 1 && game.clockMs[1] < 30_000)}
          empty={!rightName}
        />
      </div>

      <div
        className={`club-table wb side-${rackSide}`}
        {...(showLive ? table.bind : {})}
      >
        <div className="club-boardwrap">
          <Board
            board={board}
            pending={pending}
            rack={boardRack}
            turn={boardTurn}
            arrow={showLive && table.playing ? table.arrow : null}
            dragId={table.ghost?.tileId ?? null}
          />
        </div>

        {showLive && (
          <p className="club-status">
            <span>Sac {game.bag.length}</span>
            <span>{table.thinking ? `${game.players[1]} réfléchit…` : (table.toast ?? hint(game, Boolean(table.arrow)))}</span>
            <strong className={table.preview && !table.preview.defined ? 'suspect' : ''}>{table.preview ? table.preview.score : ''}</strong>
          </p>
        )}

        {showRack && (
          <div className={table.thinking ? 'club-rack wait' : 'club-rack'}>
            <Rack
              tiles={rackTiles}
              selected={table.selected}
              marked={table.marked}
              exchangeMode={table.exchangeMode}
              dragId={table.ghost?.tileId ?? null}
              dropBefore={table.ghost?.overRack ? table.ghost.dropBefore : undefined}
            />
          </div>
        )}

        {showActions && (
          table.exchangeMode ? (
            <div className="wb-actions">
              <button type="button" className="wb-plain" onClick={table.cancelExchange}>Annuler</button>
              <button type="button" className="ok" onClick={table.confirmExchange}>OK</button>
            </div>
          ) : (
            <div className="wb-actions">
              <button type="button" className="ok" onClick={table.commit}>OK</button>
              <button type="button" className="wb-plain" onClick={table.onPass}>Passer</button>
              <button type="button" className="wb-plain" disabled={!table.canExchange} onClick={table.startExchange}>Changer</button>
              <button type="button" className="wb-plain" onClick={table.shuffle}>Mélanger</button>
            </div>
          )
        )}

        {showLive && game.phase === 'handoff' && match?.kind === 'local' && (
          <section className="sheet">
            <p className="eyebrow">Au tour de</p>
            <h2>{game.players[game.turn]}</h2>
            <p>Passe le téléphone. Le chevalet reste caché.</p>
            <button type="button" className="ok" onClick={table.revealTurn}>C’est à moi</button>
          </section>
        )}

        {showLive && game.phase === 'handoff' && match?.kind === 'duplicate' && (
          <section className="sheet">
            <p className="eyebrow">Duplicate</p>
            <h2>{game.lastMove?.score ?? 0}</h2>
            <p>{game.lastMove?.label}</p>
            <div className="row">
              <button type="button" className="ok" onClick={() => match && begin({ ...match, players: match.players, ratings: match.ratings, minutes: match.minutes, incrementSec: 0, rated: false, challenge: 'VOID', kind: 'duplicate', bot: false })}>Autre donne</button>
              <button type="button" className="wb-plain" onClick={abandon}>Quitter</button>
            </div>
          </section>
        )}

        {showLive && game.phase === 'over' && (
          <section className="sheet">
            <p className="eyebrow">Partie terminée</p>
            <h2>{resultTitle(game)}</h2>
            <p>{resultDetail(game)} {game.scores[0]} – {game.scores[1]}</p>
            <div className="row">
              {match && match.kind !== 'duplicate' && (
                <button type="button" className="ok" onClick={() => begin({ ...match, players: match.players, ratings: [profile.rating, match.ratings[1]], minutes: match.minutes, incrementSec: match.incrementSec, rated: match.rated, challenge: match.challenge, kind: match.kind, bot: match.bot })}>Revanche</button>
              )}
              <button type="button" className="wb-plain" onClick={() => { matchRef.current = null; setMatch(null); setTool('seek') }}>Salon</button>
            </div>
          </section>
        )}

        {table.ghost && table.ghostLetter && (
          <span className={`drag-ghost wb-tile owner-${boardTurn}`} style={{ left: table.ghost.x, top: table.ghost.y }}>
            {table.ghostLetter}
            <small>{table.ghostTile?.blank ? '' : table.ghostTile?.points}</small>
          </span>
        )}
        <input
          ref={table.keyRef}
          className="wb-catch"
          aria-label="Taper le mot"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value=""
          onChange={() => undefined}
        />
      </div>

      <div className="club-console">
        <div className="club-dock">
          <button type="button" className={tool === 'seek' ? 'on' : ''} onClick={() => { setWatching(null); setTool('seek') }}>Lancer une partie</button>
          <button type="button" className={tool === 'matcher' ? 'on' : ''} onClick={() => setTool('matcher')}>Matcher</button>
          <button type="button" className={tool === 'duplicate' ? 'on' : ''} onClick={() => setTool('duplicate')}>Duplicate</button>
          <button type="button" className={tool === 'observe' ? 'on' : ''} onClick={() => setTool('observe')}>Observer</button>
        </div>

        <div className="club-panel">
          {match && tool !== 'seek' && game.phase !== 'over' && (
            <p className="club-banner">
              Partie en cours contre {game.players[1]}. Le coup se joue sur le plateau.
              {' '}
              <button type="button" className="club-link" onClick={abandon}>Annuler</button>
            </p>
          )}
          {tool === 'seek' && !match && (
            <form className="seek" onSubmit={(event) => { event.preventDefault(); search() }}>
              <h2>Lancer une partie</h2>
              <label className="club-field">
                <select value={minutes} disabled={searching} onChange={(event) => setMinutes(Number(event.target.value))}>
                  {MINUTES.map((value) => <option key={value} value={value}>{value} min</option>)}
                </select>
                <span>temps de jeu</span>
              </label>
              <label className="club-field">
                <select value="fr" disabled>
                  <option value="fr">Français</option>
                </select>
                <span>{lexiconLabel}</span>
              </label>
              <label className="club-field">
                <select value={challenge} disabled={searching} onChange={(event) => setChallenge(event.target.value as Challenge)}>
                  {CHALLENGES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <span>{CHALLENGE_TEXT[challenge]}</span>
              </label>
              <label className="club-check">
                <input type="checkbox" checked={rated} disabled={searching} onChange={(event) => setRated(event.target.checked)} />
                cotée
              </label>
              <button type="button" className="club-advanced" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
                {advanced ? '▾' : '▸'} Options avancées
              </button>
              {advanced && (
                <div className="club-more">
                  <p>Cote de l’adversaire</p>
                  <label className="club-field">
                    <input type="number" inputMode="numeric" min={0} max={9999} value={minRating} disabled={searching} onChange={(event) => setMinRating(clamp(Number(event.target.value), 0, 9999))} />
                    <span>Minimum</span>
                  </label>
                  <label className="club-field">
                    <input type="number" inputMode="numeric" min={0} max={9999} value={maxRating} disabled={searching} onChange={(event) => setMaxRating(clamp(Number(event.target.value), 0, 9999))} />
                    <span>Maximum</span>
                  </label>
                  <label className="club-field">
                    <input type="number" inputMode="numeric" min={1} max={60} value={minutes} disabled={searching} onChange={(event) => setMinutes(clamp(Number(event.target.value), 1, 60))} />
                    <span>temps initial (minutes par partie)</span>
                  </label>
                  <label className="club-field">
                    <input type="number" inputMode="numeric" min={0} max={60} value={increment} disabled={searching} onChange={(event) => setIncrement(clamp(Number(event.target.value), 0, 60))} />
                    <span>incrément (ajouté après chaque coup)</span>
                  </label>
                  <label className="club-check">
                    <input type="checkbox" checked={fairplayOnly} disabled={searching} onChange={(event) => setFairplayOnly(event.target.checked)} />
                    uniquement les joueurs ayant signé l’accord fairplay
                  </label>
                </div>
              )}
              <div className="club-row">
                <button type="submit" disabled={searching}>{searching ? 'Recherche…' : 'Recherche'}</button>
                <button type="button" onClick={cancelForm}>Annuler</button>
              </div>
              <button type="button" className="club-link" onClick={startLocal}>Deux joueurs sur cet appareil</button>
            </form>
          )}
          {tool === 'seek' && match && (
            <p className="club-recap">
              {game.players[0]} contre {game.players[1]} · {match.minutes} min · +{match.incrementSec} s · {match.challenge} · {match.rated ? 'cotée' : 'libre'}
              {game.phase !== 'over' && <> · <button type="button" className="club-link" onClick={abandon}>Annuler la partie</button></>}
            </p>
          )}
          {tool === 'matcher' && (
            <div>
              <h2>Matcher</h2>
              {OPEN_SEEKS.map((seek) => (
                <button key={seek.id} type="button" className="club-seek" onClick={() => acceptSeek(seek)}>
                  <span><strong>{seek.nick}</strong> ({seek.rating}) · {seek.minutes} min · +{seek.increment} s</span>
                  <span>{seek.challenge} · {seek.rated ? 'cotée' : 'libre'}</span>
                </button>
              ))}
            </div>
          )}
          {tool === 'duplicate' && (
            <div>
              <h2>Duplicate</h2>
              <p className="club-copy">Tout le monde reçoit le même chevalet. Ici, tu joues un coup, et le salon note ton score.</p>
              <button type="button" className="club-go" onClick={startDuplicate}>Tirer une donne</button>
            </div>
          )}
          {tool === 'observe' && (
            <div>
              <h2>Observer</h2>
              {TABLES.map((item) => (
                <button key={item.id} type="button" className="club-seek" onClick={() => openTable(item.id, item.players)}>
                  <span><strong>{item.players[0]}</strong> – <strong>{item.players[1]}</strong></span>
                  <span>{item.minutes} min</span>
                </button>
              ))}
              {watching && <button type="button" className="club-link" onClick={() => { setWatching(null); push('Fin de l’observation.') }}>Quitter l’observation</button>}
            </div>
          )}
          {tool === 'players' && (
            <div>
              <h2>{ROSTER.length} dans le salon</h2>
              <p className="club-you">{rateTag(profile.rating, profile.games)} {profile.nick}</p>
              {ROSTER.map((player) => (
                <div key={player.nick} className="club-person">
                  <button type="button" className="inline-nick" onClick={() => insertNick(player.nick)}>{player.nick}</button>
                  <span>({player.rating}){player.fairplay ? ' · fairplay' : ''}</span>
                  <button type="button" onClick={() => defy(player.nick, player.rating, player.fairplay)}>Défier</button>
                </div>
              ))}
            </div>
          )}
          {tool === 'settings' && (
            <form className="seek" onSubmit={(event) => { event.preventDefault(); saveNick() }}>
              <h2>Réglages</h2>
              <label>
                Pseudo
                <input
                  value={profile.nick}
                  maxLength={16}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setProfile({ ...profile, nick: event.target.value.slice(0, 16) })}
                />
              </label>
              {nickError && <p className="club-error">{nickError}</p>}
              <label className="club-check">
                <input
                  type="checkbox"
                  checked={profile.announce}
                  onChange={(event) => {
                    const next = { ...profile, announce: event.target.checked }
                    setProfile(next)
                    saveProfile(next)
                  }}
                />
                Annoncer les coups et le salon à voix haute
              </label>
              <label className="club-check">
                <input
                  type="checkbox"
                  checked={profile.fairplay}
                  onChange={(event) => {
                    const next = { ...profile, fairplay: event.target.checked }
                    setProfile(next)
                    saveProfile(next)
                  }}
                />
                J’ai signé l’accord fairplay
              </label>
              <p className="club-copy">Pas d’aide au meilleur coup. Cette case sert à filtrer les recherches.</p>
              <p className="club-copy">{lexiconLabel}</p>
              <input ref={fileRef} type="file" accept=".txt,.dic,text/plain" hidden onChange={(event) => { void onLexiconFile(event) }} />
              <div className="club-row">
                <button type="button" disabled={lexiconBusy} onClick={() => fileRef.current?.click()}>{lexiconBusy ? 'Lecture…' : 'Importer une liste'}</button>
                <button type="button" disabled={lexiconBusy || lexiconLabel === 'liste de départ'} onClick={() => { void removeLexicon() }}>Retirer</button>
              </div>
              {lexiconError && <p className="club-error">{lexiconError}</p>}
              <p className="club-copy">Réglages, puis Importer une liste. Choisis un fichier .txt, un mot par ligne. Les accents sont ignorés. Le fichier reste sur cet appareil. La liste officielle ODS n’est pas fournie avec Lettra.</p>
              <button type="submit" className="club-go">Enregistrer le pseudo</button>
            </form>
          )}
          {tool === 'help' && (
            <div className="club-copy">
              <h2>Aide</h2>
              <p>Glisse un jeton, ou touche une case et tape le mot. Le premier mot passe par l’étoile. OK joue le coup. La pendule s’arrête si l’application passe en arrière-plan.</p>
              <p>Recherche ouvre une partie selon le temps, le lexique, la contestation et la cote. L’incrément s’ajoute après chaque coup. Matcher accepte une recherche déjà ouverte. Duplicate note un seul coup. Observer montre une table.</p>
              <p>Un mot absent du lexique est refusé tout de suite. Dans Réglages, tu peux importer un fichier de mots que tu as le droit d’utiliser : il reste sur cet appareil.</p>
            </div>
          )}
        </div>

        <div className="club-log" ref={logRef} aria-live="polite">
          <p className="club-names">
            {ROSTER.map((player) => (
              <button key={player.nick} type="button" className="inline-nick" onClick={() => insertNick(player.nick)}>{player.nick}</button>
            ))}
          </p>
          {lines.map((line) => (
            <p key={line.id} className={line.kind === 'you' ? 'you' : undefined}>{line.text}</p>
          ))}
        </div>

        <form className="club-talk" onSubmit={send}>
          <input
            ref={talkRef}
            value={draft}
            placeholder="Parler"
            aria-label="Parler"
            autoComplete="off"
            onFocus={() => setChatOpen(true)}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" aria-label="Insérer un sourire" onClick={() => setDraft((current) => `${current} :)`)}>☺</button>
          <button type="button" className={profile.announce ? 'on' : ''} aria-pressed={profile.announce} aria-label={profile.announce ? 'Couper la voix' : 'Annoncer à voix haute'} onClick={toggleVoice}>♪</button>
        </form>
      </div>
    </div>
  )
}

function Head({
  side,
  name,
  rating,
  score,
  clock,
  hot,
  urgent,
  empty,
}: {
  side: 'left' | 'right'
  name: string
  rating: string
  score: number
  clock: string | null
  hot: boolean
  urgent: boolean
  empty?: boolean
}) {
  const face = <span className={hot ? 'club-avatar hot' : 'club-avatar'}>{empty ? '' : name.slice(0, 1).toUpperCase()}</span>
  const text = (
    <span className="club-id">
      <span>{rating} {name} <strong>{score}</strong></span>
      {clock && <em className={urgent ? 'urgent' : ''}>{clock}</em>}
    </span>
  )
  return (
    <div className={side === 'right' ? 'club-head right' : 'club-head'}>
      {side === 'left' ? face : text}
      {side === 'left' ? text : face}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function IconBoard() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="7" height="7" fill="#d6453d" />
      <rect x="10" y="1" width="7" height="7" fill="#7eb6f6" />
      <rect x="1" y="10" width="7" height="7" fill="#2a5fbf" />
      <rect x="10" y="10" width="7" height="7" fill="#f3b7b2" />
    </svg>
  )
}

function IconWindow() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2" y="3" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 7h14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="7" cy="6" r="2.2" fill="currentColor" />
      <circle cx="12" cy="7" r="1.7" fill="currentColor" />
      <path d="M3.5 14c.4-2.2 1.8-3.4 3.5-3.4S10.1 11.8 10.5 14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11.2c1.2.1 2.2.8 2.6 2.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconTable() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2" y="8" width="14" height="2" fill="currentColor" />
      <path d="M4 10v4M14 10v4M9 4v4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="3.2" r="1.3" fill="currentColor" />
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 2.5v2M9 13.5v2M2.5 9h2M13.5 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M13.8 4.2l-1.4 1.4M5.6 12.4l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconHelp() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.2 7.1a1.8 1.8 0 1 1 2.5 1.7c-.5.3-.7.6-.7 1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="12.4" r="0.7" fill="currentColor" />
    </svg>
  )
}

function IconLeave() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15H7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9h7M12 6l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
