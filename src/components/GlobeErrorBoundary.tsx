import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  attempt: number
}

/**
 * WebGL can fail at runtime (lost context, driver bugs, blocked GPU). If the globe
 * throws, keep the rest of the page working and offer a retry instead of a blank area.
 */
export default class GlobeErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Globe crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="loader" role="alert">
          <p>The 3D globe hit an error, but everything in the panel still works.</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
          >
            Try again
          </button>
        </div>
      )
    }
    // Remount on retry so the globe starts from a clean WebGL context.
    return <div key={this.state.attempt} className="globe-boundary">{this.props.children}</div>
  }
}
