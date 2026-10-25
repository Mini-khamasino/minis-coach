import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../lib/reports.ts'
import { L } from '../lib/i18n.ts'

interface Props {
  tab: string
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureError(error, this.props.tab)
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card my-6 flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-[32px]">⚠️</p>
          <p className="text-[17px] font-semibold text-ink">
            {L('حصلت مشكلة — اتبعتت للمطور تلقائياً', 'Something went wrong — automatically sent to the developer')}
          </p>
          <button
            className="press mt-2 rounded-2xl bg-accent px-6 py-2.5 font-semibold text-white"
            onClick={this.reset}
          >
            {L('حاول تاني', 'Try again')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
