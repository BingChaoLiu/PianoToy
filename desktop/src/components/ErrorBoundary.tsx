import { Component, type ErrorInfo, type ReactNode } from "react";
import { translate, type Locale } from "@/lib/i18n";
import { useSettingsStore } from "@/store/useSettingsStore";

interface State {
  error: Error | null;
  locale: Locale;
}

interface Props {
  children: ReactNode;
}

// Class component can't use hooks; subscribe to locale changes manually.
function getCurrentLocale(): Locale {
  return useSettingsStore.getState().locale;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, locale: getCurrentLocale() };
  unsub?: () => void;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidMount() {
    this.unsub = useSettingsStore.subscribe((s) => {
      if (s.locale !== this.state.locale) this.setState({ locale: s.locale });
    });
  }
  componentWillUnmount() {
    this.unsub?.();
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const l = this.state.locale;
      return (
        <div className="flex h-full w-full items-center justify-center bg-bg-0 p-8 text-fg">
          <div className="max-w-md space-y-4 rounded-lg border border-red-500/40 bg-bg-1 p-6">
            <h1 className="text-lg font-semibold text-red-400">{translate(l, "error.title")}</h1>
            <p className="text-sm text-muted">{this.state.error.message}</p>
            <pre className="max-h-40 overflow-auto rounded bg-bg-2 p-2 text-xs text-muted">
              {this.state.error.stack}
            </pre>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-bg-0 hover:opacity-90"
            >
              {translate(l, "error.retry")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
