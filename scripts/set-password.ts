import { updateStaffLogin } from "../src/lib/users";

type ParsedArgs =
  | { help: true }
  | { help: false; email: string; name?: string; emailNew?: string };

export function parseSetPasswordArgs(argv: string[]): ParsedArgs {
  let email = "";
  let name: string | undefined;
  let emailNew: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--name") {
      name = argv[index + 1];
      index += 1;
      if (!name || name.startsWith("--")) throw new Error("--name needs a display name.");
      continue;
    }
    if (arg === "--email-new") {
      emailNew = argv[index + 1];
      index += 1;
      if (!emailNew || emailNew.startsWith("--")) throw new Error("--email-new needs an email address.");
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}.`);
    if (!email) {
      email = arg;
      continue;
    }
    throw new Error("Pass the email only. The password is read from stdin and is not an argument.");
  }
  if (!email) {
    throw new Error(
      "Usage: npm run user:set-password -- <email> [--name <display name>] [--email-new <email>]",
    );
  }
  return { help: false, email, name, emailNew };
}

function printHelp() {
  console.log(`Usage: npm run user:set-password -- <email> [--name <display name>] [--email-new <email>]

Reads the new password from stdin and does not echo it. The password is never printed and cannot be passed as an argument.
It must be at least 14 characters.

  npm run user:set-password -- executive@liberty.local --name "Alex Morgan" --email-new alex@example.com
`);
}

/** Read one password line. A terminal uses raw mode so the characters are not echoed. */
export async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write("New password (at least 14 characters): ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const finish = (result: string) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      resolve(result);
    };
    const onData = (key: string) => {
      if (key === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        process.exit(1);
      }
      if (key === "\r" || key === "\n") {
        finish(value);
        return;
      }
      if (key === "\u007f" || key === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (key < " " || key.startsWith("\u001b")) return;
      value += key;
    };
    stdin.on("data", onData);
    stdin.on("error", (error) => {
      stdin.setRawMode(false);
      reject(error);
    });
  });
}

async function main() {
  const parsed = parseSetPasswordArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }
  const password = await readPassword();
  const result = updateStaffLogin({
    email: parsed.email,
    password,
    name: parsed.name,
    emailNew: parsed.emailNew,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(`Updated ${result.name} <${result.email}>.`);
}

const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry?.endsWith("scripts/set-password.ts") || entry?.endsWith("scripts/set-password.js")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Could not update the password.";
    console.error(message);
    process.exit(1);
  });
}
