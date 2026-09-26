import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";

const directory = mkdtempSync(path.join(tmpdir(), "reach-login-"));
process.env.REACH_DB_PATH = path.join(directory, "reach.db");
// tsx compiles JSX with the classic runtime. The app build uses the automatic runtime.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

import("./login-assert-run")
  .then((mod) => mod.runLoginAssertions())
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
