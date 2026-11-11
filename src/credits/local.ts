// Reads and writes the operator file of this machine for the command lines; the rules are in
// operator.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { formatOperator, missingOperatorMessage, operatorPath, parseOperator } from "./operator.ts";

/** The path of the operator file for the current user. */
export function localOperatorPath(): string {
  return operatorPath(process.env, homedir());
}

/** The credit of the operator; throws with what to do when it is not set up. */
export function requireOperator(): string {
  const path = localOperatorPath();
  if (!existsSync(path)) throw new Error(missingOperatorMessage(path));
  return parseOperator(readFileSync(path, "utf8")).credit;
}

/** The credit of the operator, or undefined when it is not set up. */
export function readOperator(): string | undefined {
  const path = localOperatorPath();
  return existsSync(path) ? parseOperator(readFileSync(path, "utf8")).credit : undefined;
}

/** Writes the operator file and returns its path. */
export function writeOperator(credit: string): string {
  const path = localOperatorPath();
  const text = formatOperator(credit);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}
