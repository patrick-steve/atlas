import { Panel } from "./ui/Panel";
import { REPO_URL } from "@/lib/links";

export function CloneCTA() {
  return (
    <section className="py-16 sm:py-20 border-t border-ink-600/40">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7">
            <Panel channel="CH 00" title="CLONE & RUN // YOUR MACHINE, FIVE MINUTES" status="live">
              <div className="flex flex-col gap-5">
                <p className="text-mute-100 leading-relaxed">
                  Atlas is open source. The deployed site is the showcase; the actual proving pipeline runs on your
                  own machine via Docker Compose. Clone the repo, run two commands, and the same charts above are
                  produced from your hardware.
                </p>
                <pre className="bg-ink-950/80 border border-ink-600 px-4 py-3 overflow-x-auto font-mono text-sm text-mute-100 leading-relaxed">
{`git clone https://github.com/patrick-steve/atlas
cd atlas/pipeline/circuits && npm install && npm run setup:balance
cd ../.. && docker compose -f pipeline/docker-compose.yml up --scale worker=4`}
                </pre>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 border border-signal/60 px-4 py-2 font-mono text-sm uppercase tracking-widest text-signal hover:bg-signal/10 hover:shadow-glow transition-all"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
                      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    OPEN ON GITHUB
                  </a>
                  <a
                    href={`${REPO_URL}/blob/main/pipeline/benchmark/METHODOLOGY.md`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm tracking-widest text-mute-200 hover:text-signal transition-colors"
                  >
                    → METHODOLOGY.MD
                  </a>
                  <a
                    href={`${REPO_URL}/blob/main/pipeline/circuits/balance_proof.circom`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm tracking-widest text-mute-200 hover:text-signal transition-colors"
                  >
                    → BALANCE_PROOF.CIRCOM
                  </a>
                </div>
              </div>
            </Panel>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <Panel channel="LIVE MODE" title="POINT YOUR DEPLOYED SITE AT IT" status="static">
              <p className="text-sm text-mute-100 leading-relaxed">
                Once your local pipeline is up, expose the gateway through a tunnel and tell a Vercel deployment of this
                site about it:
              </p>
              <pre className="mt-3 bg-ink-950/80 border border-ink-600 px-3 py-3 overflow-x-auto font-mono text-xs text-mute-100 leading-relaxed">
{`# expose the gateway publicly
cloudflared tunnel --url http://localhost:8080

# in Vercel project settings:
NEXT_PUBLIC_GATEWAY_URL=https://<your-tunnel>.trycloudflare.com`}
              </pre>
              <p className="text-xs text-mute-300 mt-3 leading-relaxed">
                The demo panel will probe <span className="font-mono text-mute-100">/health</span> on load and switch from
                <span className="text-amber"> SIMULATED</span> to <span className="text-signal">LIVE</span> automatically.
                No rebuild required.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}
