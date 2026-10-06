const KEY = 'lettra-profile'

export type Profile = {
  nick: string
  rating: number
  games: number
  fairplay: boolean
  announce: boolean
}

const BLANK: Profile = { nick: '', rating: 800, games: 0, fairplay: false, announce: true }

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...BLANK }
    const parsed = JSON.parse(raw) as Partial<Profile>
    return {
      nick: typeof parsed.nick === 'string' ? parsed.nick.slice(0, 16) : '',
      rating: Number.isFinite(parsed.rating) ? Math.max(0, Math.round(Number(parsed.rating))) : 800,
      games: Number.isFinite(parsed.games) ? Math.max(0, Math.round(Number(parsed.games))) : 0,
      fairplay: Boolean(parsed.fairplay),
      announce: parsed.announce !== false,
    }
  } catch {
    return { ...BLANK }
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(profile))
}

export function provisional(games: number): boolean {
  return games < 10
}
