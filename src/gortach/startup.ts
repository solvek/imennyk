// The text Gortach prints on start: where it listens and how to reach it from another machine.

export interface StartupInfo {
  readonly port: number;
  /** `user@host` of this machine, for the SSH tunnel. */
  readonly ssh: string;
}

export function startupMessage(info: StartupInfo): string {
  const port = String(info.port);
  return [
    `Гортач: http://127.0.0.1:${port}/`,
    `З іншої машини: ssh -N -L ${port}:127.0.0.1:${port} ${info.ssh}`,
  ].join("\n");
}
