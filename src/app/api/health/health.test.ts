import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("§19 health liveness", () => {
  it("responde ok com release id e sem segredo", async () => {
    const res = GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.release).toBe("string");
    // nunca expoe env sensivel
    const txt = JSON.stringify(body);
    expect(txt).not.toMatch(/SECRET|PASSWORD|postgres:\/\/|KEY/i);
  });
});
