/** Same return rule as the password form: only same-site paths, never the login screen. */
export function safeNext(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/login")) {
    return "/enquiries";
  }
  return value;
}
