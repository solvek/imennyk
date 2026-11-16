// The keys of a run live in the environment, never under the names the other tools already use
// (`ANTHROPIC_API_KEY` would make Claude Code bill the API). A `.env` file fills only what the
// process does not already have.

/** The assignments of a `.env` file. Blank lines and `#` comments are skipped. */
export function parseEnvFile(text: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Copies `file` into `env` where `env` has nothing yet. An empty string counts as nothing, so a
 * placeholder in the file does not cover a real value, and a value already in the process wins.
 */
export function applyEnv(
  file: Readonly<Record<string, string>>,
  env: Record<string, string | undefined>,
): void {
  for (const [key, value] of Object.entries(file)) {
    if (value === "") continue;
    const current = env[key];
    if (current === undefined || current === "") env[key] = value;
  }
}
