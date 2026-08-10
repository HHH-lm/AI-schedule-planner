"use client";

import { useState } from "react";
import { KeyRound, LogIn, Mail, UserPlus, X } from "lucide-react";
import {
  isValidEmail,
  signInWithPassword,
  signUp,
  isSupabaseConfigured,
} from "@/lib/supabase";

interface Props {
  onClose: () => void;
}

type AuthMode = "signin" | "signup";

export default function AuthModal({ onClose }: Props) {
  const configured = isSupabaseConfigured();
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
    "input-rect";
  const labelClass = "field-label";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="modal-card max-w-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            {mode === "signin" ? "登录云同步" : "注册账号"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-plain"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body space-y-4">
          {configured ? (
            <>
              <div className="flex gap-1 rounded-full bg-[#f0f0f0] p-1">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={`chip-btn flex-1 !border-0 !py-1.5 ${
                    mode === "signin"
                      ? "chip-btn-active"
                      : "!bg-transparent"
                  }`}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={`chip-btn flex-1 !border-0 !py-1.5 ${
                    mode === "signup"
                      ? "chip-btn-active"
                      : "!bg-transparent"
                  }`}
                >
                  注册
                </button>
              </div>

              <div>
                <div className="field-hint">
                  <Mail size={13} />
                  <span>邮箱</span>
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
                <div className="field-hint">
                  <KeyRound size={13} />
                  <span>密码</span>
                </div>
                <input
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  placeholder="至少 6 位"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSubmit();
                  }}
                />
              </div>

              {error && (
                <div className="status-note-rose !py-1.5 text-xs">{error}</div>
              )}
            </>
          ) : (
            <div className="status-note-amber text-xs leading-relaxed">
              尚未配置云同步。请在 <code className="font-mono">.env.local</code>{" "}
              中填写 <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              与{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              ，然后重启开发服务器。
            </div>
          )}
        </div>

        <div className="modal-footer !justify-end">
          <button
            type="button"
            onClick={configured ? handleSubmit : onClose}
            disabled={configured && loading}
            className="btn-primary-pill"
          >
            {configured ? (
              mode === "signin" ? (
                <LogIn size={14} />
              ) : (
                <UserPlus size={14} />
              )
            ) : null}
            {configured
              ? loading
                ? "处理中..."
                : mode === "signin"
                  ? "登录"
                  : "注册"
              : "知道了"}
          </button>
        </div>
      </div>
    </div>
  );
}
