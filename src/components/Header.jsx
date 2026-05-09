function Header({ visitedCount }) {
  return (
    <section className="hero-card" aria-labelledby="page-title">
      <div className="hero-layout">
        <div className="hero-copy">
          <p className="hero-eyebrow">DIEGO&apos;S TRAVEL ATLAS</p>
          <h1 id="page-title">Countries I&apos;ve Visited</h1>
          <p>
            An interactive map of the countries I&apos;ve been to, built as a
            personal record of my travels and the places that have shaped how I
            see the world.
          </p>
        </div>

        <aside className="hero-stat" aria-label="Visited countries total">
          <span className="hero-stat__label">COUNTRIES VISITED</span>
          <strong className="hero-stat__value">{visitedCount}</strong>
          <span className="hero-stat__progress">13% of the world explored</span>
          <span className="hero-stat__updated">Updated May 2026</span>
        </aside>
      </div>
    </section>
  )
}

export default Header
