import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[project.X] runtime error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="px-crash-screen">
        <div className="px-crash-mark">X</div>
        <p className="px-crash-kicker">PROJECT.X // RUNTIME FAULT</p>
        <h1>The interface hit an error.</h1>
        <p className="px-crash-copy">
          project.X stayed alive long enough to show the failure instead of leaving a blank page.
        </p>
        <pre>{this.state.error.message}</pre>
        <div className="px-crash-actions">
          <button type="button" onClick={() => window.location.reload()}>Reload app</button>
          <button type="button" onClick={() => {
            localStorage.removeItem('projectx.projects.v1')
            localStorage.removeItem('projectx.view.v1')
            window.location.reload()
          }}>Reset local data + reload</button>
        </div>
      </main>
    )
  }
}

export default ErrorBoundary
