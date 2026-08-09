import { describe, expect, it } from "vitest";
import { isValidEmail, mapAuthErrorMessage } from "./supabase";

describe("mapAuthErrorMessage", () => {
  it("无错误时返回 null", () => {
    expect(mapAuthErrorMessage(null)).toBeNull();
  });

  it("映射常见 Supabase Auth 错误为中文提示", () => {
    expect(mapAuthErrorMessage({ message: "Invalid login credentials" })).toBe(
      "邮箱或密码不正确"
    );
    expect(mapAuthErrorMessage({ message: "User already registered" })).toBe(
      "该邮箱已注册"
    );
    expect(
      mapAuthErrorMessage({
        message: "Password should be at least 6 characters",
      })
    ).toBe("密码至少需要 6 位");
    expect(
      mapAuthErrorMessage({
        message: "Unable to validate email address: invalid format",
      })
    ).toBe("邮箱格式不正确");
    expect(mapAuthErrorMessage({ message: "Email not confirmed" })).toBe(
      "邮箱尚未确认，请先查收确认邮件"
    );
    expect(mapAuthErrorMessage({ message: "Other error" })).toBe(
      "操作失败，请稍后重试"
    );
  });
});

describe("isValidEmail", () => {
  it("接受合法邮箱并忽略首尾空格", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail(" user@example.com ")).toBe(true);
  });

  it("拒绝不完整邮箱", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });
});
