type Props = {
  onStart: (players: [string, string], minutes: number, announce: boolean) => void
}

const TIMES = [5, 10, 20]

export function HomeScreen({ onStart }: Props) {
  return (
    <div className="phone home">
      <form
        className="home-card"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const left = String(data.get('left') ?? '').trim() || 'Joueur 1'
          const right = String(data.get('right') ?? '').trim() || 'Joueur 2'
          const minutes = Number(data.get('minutes') ?? 10)
          const announce = data.get('announce') === 'on'
          onStart([left.slice(0, 16), right.slice(0, 16)], minutes, announce)
        }}
      >
        <p className="eyebrow">Club de mots</p>
        <h1>Lettra</h1>
        <p className="lede">
          La partie en direct, sur un téléphone. Pose, croise, compte. Puis passe l’appareil.
        </p>
        <div className="tiles-row" aria-hidden="true">
          {['L', 'E', 'T', 'T', 'R', 'A'].map((letter, index) => (
            <span key={`${letter}-${index}`} className="deco">{letter}</span>
          ))}
        </div>
        <label>
          Joueur 1
          <input name="left" maxLength={16} placeholder="Toi" autoComplete="off" />
        </label>
        <label>
          Joueur 2
          <input name="right" maxLength={16} placeholder="Partenaire" autoComplete="off" />
        </label>
        <fieldset>
          <legend>Minutes par joueur</legend>
          <div className="times">
            {TIMES.map((minutes) => (
              <label key={minutes} className="time">
                <input type="radio" name="minutes" value={minutes} defaultChecked={minutes === 10} />
                <span>{minutes}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" name="announce" defaultChecked />
          Annoncer chaque mot à voix haute
        </label>
        <button type="submit" className="primary">Commencer</button>
        <p className="fine">
          Deux joueurs, un seul téléphone. Le lexique est un départ : des mots courants, pas une liste officielle de tournoi.
        </p>
      </form>
    </div>
  )
}
