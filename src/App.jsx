import Header from './components/Header.jsx'
import GlobeView from './components/GlobeView.jsx'
import Legend from './components/Legend.jsx'
import visitedCountries from './data/visitedCountries.js'
import { normalizeCountryCode } from './utils/countryHelpers.js'

const normalizedVisitedCountries = [
  ...new Set(
    visitedCountries
      .map((countryCode) => normalizeCountryCode(countryCode))
      .filter(Boolean),
  ),
]

const visitedCountrySet = new Set(normalizedVisitedCountries)

function App() {
  return (
    <div className="app-shell">
      <main className="page-shell">
        <Header visitedCount={visitedCountrySet.size} />

        <section className="globe-panel" aria-labelledby="travel-globe-title">
          <div className="globe-panel__header">
            <div>
              <p className="section-eyebrow">Interactive Map</p>
              <h2 id="travel-globe-title">Explore where you&apos;ve been</h2>
              <p className="section-copy">
                Drag, zoom, and hover across country polygons to see your travel
                footprint.
              </p>
            </div>
            <Legend />
          </div>

          <GlobeView visitedCountrySet={visitedCountrySet} />
        </section>
      </main>

      <footer className="site-footer">
        Built with React and react-globe.gl
      </footer>
    </div>
  )
}

export default App
