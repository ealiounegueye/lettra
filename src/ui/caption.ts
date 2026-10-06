import type { GameState } from '../engine/types.ts'

export function hint(game: GameState, hasArrow: boolean): string {
  if (game.lastMove && !hasArrow) return `${game.players[game.lastMove.player]} · ${game.lastMove.label} · ${game.lastMove.score}`
  if (!hasArrow) return 'Touche la case de départ'
  if (game.pending.length > 1) {
    const rows = new Set(game.pending.map((item) => item.row))
    const cols = new Set(game.pending.map((item) => item.col))
    if (rows.size !== 1 && cols.size !== 1) return 'Tu peux changer de ligne. OK demande une seule ligne.'
  }
  return game.pending.length > 0 ? 'Flèche : sens du mot. Double clic : chevalet.' : 'Tape ou glisse les lettres'
}

export function resultTitle(game: GameState): string {
  if (game.winner === null) return 'Égalité'
  return `${game.players[game.winner]} gagne`
}

export function resultDetail(game: GameState): string {
  if (game.overReason === 'time') {
    const loser = game.winner === 0 ? 1 : 0
    return `${game.players[loser]} n’a plus de temps.`
  }
  if (game.overReason === 'passes') return 'Deux passes de suite. Les jetons restants sont retirés.'
  if (game.overReason === 'played-out') return 'Toutes les lettres ont été posées.'
  return ''
}
