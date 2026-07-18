import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "./env.js";

export const SESSION_COOKIE = "crit_session";
export const PLATFORM_SESSION_COOKIE = "crit_platform_session";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax",
  path: "/"
};

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.header("cookie");
  if (!header) return undefined;

  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return decodeURIComponent(item.slice(separator + 1).trim());
    }
  }

  return undefined;
}

export function setSessionCookie(response: Response, name: string, token: string): void {
  const decoded = jwt.decode(token);
  const expires = typeof decoded === "object" && decoded && typeof decoded.exp === "number"
    ? new Date(decoded.exp * 1000)
    : undefined;
  response.cookie(name, token, { ...baseCookieOptions, expires });
}

export function clearSessionCookie(response: Response, name: string): void {
  response.clearCookie(name, baseCookieOptions);
}
