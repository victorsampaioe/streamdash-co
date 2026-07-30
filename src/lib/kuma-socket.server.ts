/**
 * Minimal Socket.IO (Engine.IO v4, HTTP long-polling) client.
 * Worker-safe: uses only fetch, no ws / xhr dependencies.
 * Used to talk to a private Uptime Kuma instance from the backend only.
 */

const RS = "\u001e";

type Listener = (args: any[]) => void;

export class KumaSocket {
  private base: string;
  private sid: string | null = null;
  private ackSeq = 1;
  private pending = new Map<number, (args: any[]) => void>();
  private listeners = new Map<string, Listener[]>();
  private closed = false;
  private pollLoop: Promise<void> | null = null;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  on(event: string, fn: Listener) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }

  private url(extra = "") {
    const sid = this.sid ? `&sid=${encodeURIComponent(this.sid)}` : "";
    return `${this.base}/socket.io/?EIO=4&transport=polling&t=${Date.now().toString(36)}${sid}${extra}`;
  }

  private async post(body: string) {
    await fetch(this.url(), {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body,
    });
  }

  private handlePayload(text: string) {
    for (const packet of text.split(RS)) {
      if (!packet) continue;
      const type = packet[0];
      const rest = packet.slice(1);
      if (type === "0") {
        try {
          this.sid = JSON.parse(rest).sid;
        } catch {
          /* ignore */
        }
      } else if (type === "2") {
        void this.post("3");
      } else if (type === "4") {
        this.handleMessage(rest);
      }
    }
  }

  private handleMessage(msg: string) {
    const kind = msg[0];
    const body = msg.slice(1);
    if (kind === "2" || kind === "3") {
      const m = body.match(/^(\d*)(\[[\s\S]*\])$/);
      if (!m) return;
      const ackId = m[1] ? Number(m[1]) : null;
      let arr: any[];
      try {
        arr = JSON.parse(m[2]);
      } catch {
        return;
      }
      if (kind === "3" && ackId !== null) {
        const cb = this.pending.get(ackId);
        if (cb) {
          this.pending.delete(ackId);
          cb(arr);
        }
        return;
      }
      const [event, ...args] = arr;
      for (const fn of this.listeners.get(String(event)) ?? []) {
        try {
          fn(args);
        } catch {
          /* ignore */
        }
      }
    }
  }

  async connect(timeoutMs = 15000) {
    const res = await fetch(this.url(), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Uptime Kuma respondeu HTTP ${res.status}`);
    this.handlePayload(await res.text());
    if (!this.sid) throw new Error("Handshake com o Uptime Kuma falhou");
    await this.post("40");
    this.pollLoop = this.startPolling();
  }

  private async startPolling() {
    while (!this.closed) {
      try {
        const res = await fetch(this.url(), { signal: AbortSignal.timeout(30000) });
        if (!res.ok) break;
        this.handlePayload(await res.text());
      } catch {
        if (this.closed) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  emitAck<T = any>(event: string, args: any[], timeoutMs = 15000): Promise<T> {
    const id = this.ackSeq++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tempo esgotado aguardando "${event}" do Uptime Kuma`));
      }, timeoutMs);
      this.pending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res[0] as T);
      });
      void this.post(`42${id}${JSON.stringify([event, ...args])}`);
    });
  }

  async close() {
    this.closed = true;
    try {
      await this.post("41");
    } catch {
      /* ignore */
    }
  }
}
