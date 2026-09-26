import { formatBreakglassHash } from "../src/lib/passwords";

function readStdin() {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => {
      let password = Buffer.concat(chunks).toString("utf8");
      if (password.endsWith("\n")) password = password.slice(0, -1);
      if (password.endsWith("\r")) password = password.slice(0, -1);
      resolve(password);
    });
    process.stdin.on("error", reject);
  });
}

readStdin()
  .then((password) => {
    if (!password) {
      process.stderr.write("Pass the emergency password on stdin.\n");
      process.exit(1);
    }
    process.stdout.write(`${formatBreakglassHash(password)}\n`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Could not hash the password.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
