import { requireCondition } from "../errors";
const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phone = /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g;
const identity = /(?<!\d)\d{17}[\dXx](?!\d)/g;
export function maskText(text: string, names: string[]): string {
  let masked = text.replace(/\r\n?/g, "\n").normalize("NFC");
  for (const name of [...names]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    masked = masked.split(name.normalize("NFC")).join("[姓名]");
  return masked
    .replace(email, "[邮箱]")
    .replace(identity, "[证件号]")
    .replace(phone, "[手机号]");
}
export function assertMasked(text: string): void {
  for (const pattern of [email, phone, identity]) {
    pattern.lastIndex = 0;
    requireCondition(!pattern.test(text), "INPUT_BLOCKED");
  }
  requireCondition(
    !/(?:https?:\/\/|file:\/\/|data:|blob:)/i.test(text),
    "INPUT_BLOCKED",
  );
}
