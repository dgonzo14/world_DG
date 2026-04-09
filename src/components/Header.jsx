function Header({ visitedCount }) {
  return (
    <section className="hero-card" aria-labelledby="page-title">
      <div className="hero-layout">
        <div className="hero-copy">
          <p className="hero-eyebrow">Personal Travel Website</p>
          <h1 id="page-title">My Travel Globe</h1>
          <p>
            A minimalist 3D view of the world that highlights the countries
            you&apos;ve visited and keeps the rest subdued for contrast.
          </p>
        </div>

        <aside className="hero-stat" aria-label="Visited countries total">
          <span className="hero-stat__label">Countries visited</span>
          <strong className="hero-stat__value">{visitedCount}</strong>
          <span className="hero-stat__caption">
            Tracked with ISO-3 country codes
          </span>
        </aside>
      </div>
    </section>
  )
}

export default Header
