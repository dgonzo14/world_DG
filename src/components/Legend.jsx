function Legend() {
  return (
    <div className="legend" aria-label="Travel globe legend">
      <span className="legend__item">
        <span
          className="legend__swatch legend__swatch--visited"
          aria-hidden="true"
        />
        Visited
      </span>
      <span className="legend__item">
        <span
          className="legend__swatch legend__swatch--unvisited"
          aria-hidden="true"
        />
        Not visited
      </span>
    </div>
  )
}

export default Legend
