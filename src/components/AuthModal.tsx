"use client";

import { useState } from "react";
import { KeyRound, LogIn, Mail, UserPlus, X } from "lucide-react";
import {
  isValidEmail,
  signInWithPassword,
  signUp,
} from "@/lib/supabase";

interface Props {
  onClose: () => void;
}

type AuthMode = "signin" | "signup";

export default function AuthModal({ onClose }: Props) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError("请输入有效的邮箱地址");
      return;
    }
    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }
    setLoading(true);
    setError(null);
    const result =
      mode === "signin"
        ? await signInWithPassword(trimmedEmail, password)
        : await signUp(trimmedEmail, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.requiresEmailConfirmation) {
      setError("注册成功，请查收确认邮件后登录");
      return;
    }
    onClose();
  };

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold">
            {mode === "signin" ? "登录云同步" : "注册账号"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`rounded px-2 py-1.5 text-xs font-medium ${
                mode === "signin"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`rounded px-2 py-1.5 text-xs font-medium ${
                mode === "signup"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              注册
            </button>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <Mail size={13} className="text-slate-400" />
              <span className={labelClass}>邮箱</span>
            </div>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <KeyRound size={13} className="text-slate-400" />
              <span className={labelClass}>密码</span>
            </div>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="至少 6 位"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit();
              }}
            />
          </div>

          {error && (
            <div className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {mode === "signin" ? <LogIn size={14} /> : <UserPlus size={14} />}
            {loading ? "处理中..." : mode === "signin" ? "登录" : "注册"}
          </button>
        </div>
      </div>
    </div>
  );
}
