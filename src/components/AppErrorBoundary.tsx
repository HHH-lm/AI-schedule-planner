"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError("app_render_error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="loading-screen">
          <div className="tool-panel max-w-sm text-center">
            <p className="type-tagline text-ink">页面出现异常</p>
            <p className="type-caption mt-2 text-ink-muted-48">
              错误已记录，请刷新页面重试。
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
