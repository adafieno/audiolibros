import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; msg?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, msg };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: "#fee2e2", background: "#7f1d1d" }}>
          <h2>Algo salió mal en la UI</h2>
          <div><code>{this.state.msg}</code></div>
          <p>Revisa la consola (Ctrl+Shift+I) para más detalles.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
