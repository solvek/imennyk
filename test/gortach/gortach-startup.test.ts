import { describe, expect, it } from "vitest";
import { startupMessage } from "../../src/web/gortach/startup.ts";

describe("startupMessage", () => {
  it("prints the local address and the tunnel command", () => {
    expect(startupMessage({ port: 8090, ssh: "sergi@main-host" }).split("\n")).toEqual([
      "Гортач: http://127.0.0.1:8090/",
      "З іншої машини: ssh -N -L 8090:127.0.0.1:8090 sergi@main-host",
    ]);
  });
});
