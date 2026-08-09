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
        message: "Password should be at least 8 characters",
      })
    ).toBe("密码至少需要 8 位");
    expect(
      mapAuthErrorMessage({
        message: "Password should be between 8 and 72 characters",
      })
    ).toBe("密码长度需在 8 到 72 位之间");
    expect(
      mapAuthErrorMessage({
        message: "Password should contain at least one number",
      })
    ).toBe("密码必须包含至少一个数字");
    expect(
      mapAuthErrorMessage({
        message: "Password should contain at least one letter",
      })
    ).toBe("密码必须包含至少一个字母");
    expect(
      mapAuthErrorMessage({
        message: "Password should contain at least one symbol",
      })
    ).toBe("密码必须包含至少一个特殊符号");
    expect(
      mapAuthErrorMessage({
        message: "Password should contain at least one uppercase letter",
      })
    ).toBe("密码必须包含至少一个大写字母");
    expect(
      mapAuthErrorMessage({
        message: "Password should contain at least one lowercase letter",
      })
    ).toBe("密码必须包含至少一个小写字母");
    expect(
      mapAuthErrorMessage({
        message: "Password was found in a data breach",
      })
    ).toBe("该密码已在公开泄露数据库中出现，请更换更安全的密码");
    expect(
      mapAuthErrorMessage({
        message: "Password should not be same as the email",
      })
    ).toBe("密码不能与邮箱相同");
    expect(
      mapAuthErrorMessage({
        message: "Password should not contain parts of the email",
      })
    ).toBe("密码不能包含邮箱中的内容");
    expect(
      mapAuthErrorMessage({
        message: "Password should not be in the list of common passwords",
      })
    ).toBe("该密码过于常见，请更换更安全的密码");
    expect(
      mapAuthErrorMessage({
        message: "Unable to validate email address: invalid format",
      })
    ).toBe("邮箱格式不正确");
    expect(mapAuthErrorMessage({ message: "Email not confirmed" })).toBe(
      "邮箱尚未确认，请先查收确认邮件"
    );
    expect(mapAuthErrorMessage({ message: "Other error" })).toBe(
      "操作失败：Other error"
    );
    expect(mapAuthErrorMessage({ message: "" })).toBe(
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
