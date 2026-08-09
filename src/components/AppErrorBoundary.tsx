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
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-800">页面出现异常</p>
            <p className="mt-1 text-xs text-slate-500">
              错误已记录，请刷新页面重试。
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
