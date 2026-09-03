import { useEffect, useState } from "react";
import { enterHouse, identifyToken, setSession, useStore } from "../lib/store";
import { inviteStatus } from "../lib/invites";

const MISTRESS_CODE = "1234";

export default function Gate({ go }: { go: (r: string) => void }) {
  const dungeon = useStore((s) => s.dungeon);
  const invites = useStore((s) => s.invites);
  const [mode, setMode] = useState<null | "mistress" | "sub">(null);
  const [code, setCode] = useState("");
  const [keyCode, setKeyCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);

  const openInvites = invites.filter((i) => inviteStatus(i) === "open");

  /* deep link: #/invite/ABCD-1234 */
  useEffect(() => {
    const m = window.location.hash.match(/#\/invite\/([A-Za-z0-9-]+)/);
    if (!m) return;
    setMode("sub");
    setIsNew(true);
    setKeyCode(m[1].toUpperCase());
  }, []);

  const enterMistress = () => {
    if (code.trim() !== MISTRESS_CODE) {
      setErr("That code is incorrect.");
      setCode("");
      return;
    }
    setSession({ role: "mistress", slaveId: null });
    go("#/deck");
  };

  /* the token itself decides the path — never a toggle */
  const kind = identifyToken(keyCode);
  const needsName = kind === "invite" || (kind === "unknown" && keyCode.trim().length > 3);

  const enterSub = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await enterHouse(keyCode, name);
      if (!r.ok) {
        setErr(r.error || "Refused.");
        if (r.needName) setIsNew(true);
        return;
      }
      if (r.isNew && r.accessCode) {
        setIsNew(true);
        setIssued(r.accessCode);
        setNewId(r.slaveId!);
        return;
      }
      setSession({ role: "sub", slaveId: r.slaveId! });
      go("#/sub");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-canvas relative flex min-h-screen items-center justify-center px-5 py-16">
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-brass/45 text-[22px] text-brass">
            {dungeon.sigil}
          </div>
          <h1 className="font-display text-[3rem] leading-none tracking-tight">
            <span className="gold-text">{dungeon.name}</span>
          </h1>
          <p className="font-display mt-3 text-[1.05rem] text-white/55 italic">{dungeon.entryRite}</p>
        </div>

        {!mode && (
          <div className="space-y-3">
            <button
              onClick={() => {
                setMode("mistress");
                setErr("");
              }}
              className="group w-full rounded-xl border border-brass/40 bg-gradient-to-br from-brass/18 to-transparent px-6 py-5 text-left transition hover:border-brass/70"
            >
              <div className="label">👑 Supply side</div>
              <div className="font-display mt-1 text-[1.5rem] text-white">Enter as Mistress</div>
              <div className="mt-1 text-[13px] text-white/50">Command deck · roster · keys · ledger ⛓️</div>
            </button>

            <button
              onClick={() => {
                setMode("sub");
                setErr("");
              }}
              className="group w-full rounded-xl border border-white/12 bg-white/[0.03] px-6 py-5 text-left transition hover:border-white/30"
            >
              <div className="label">🔒 Demand side</div>
              <div className="font-display mt-1 text-[1.5rem] text-white/90">Enter with a Key</div>
              <div className="mt-1 text-[13px] text-white/50">Claim an invite and be collared 🖤</div>
            </button>

            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="label">How to try this properly</div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/55">
                Open this page in <span className="text-brass-soft">two browser tabs</span>. Be the Mistress in one,
                claim a key as a submissive in the other. Commands land live across both.
              </p>
            </div>

            <a
              href="#/"
              className="block pt-2 text-center text-[12px] text-white/35 underline underline-offset-4 hover:text-white/60"
            >
              ← Return to the front page
            </a>
          </div>
        )}

        {mode === "mistress" && (
          <div className="card rounded-xl p-6">
            <div className="label">Mistress code</div>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && enterMistress()}
              placeholder="••••"
              className="mt-3 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-center font-mono text-[1.6rem] tracking-[0.5em] text-brass-soft outline-none focus:border-brass/60"
            />
            <p className="mt-2 h-5 text-[12.5px] text-rose-300">{err}</p>
            <p className="text-[11.5px] text-white/35">
              Demo code: <span className="font-mono text-brass-soft/80">{MISTRESS_CODE}</span>
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setMode(null)} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
                Back
              </button>
              <button onClick={enterMistress} className="flex-1 rounded-lg border border-brass/50 bg-brass/15 py-3 text-[13px] font-medium text-brass-soft">
                Enter
              </button>
            </div>
          </div>
        )}

        {mode === "sub" && issued && (
          <div className="card rounded-xl p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-[24px]">
              🗝️
            </span>
            <h3 className="font-display mt-4 text-[1.7rem] leading-tight text-white">You are collared.</h3>
            <p className="mt-2 text-[13px] text-white/55">This is your permanent code. Memorise it.</p>
            <div className="mt-4 rounded-xl border border-brass/40 bg-brass/10 py-5">
              <div className="font-mono text-[2rem] tracking-[0.28em] text-brass-soft">{issued}</div>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-white/45">
              It never expires — but your Mistress may take it from you whenever she pleases. ⛓️
            </p>
            <button
              onClick={() => {
                setSession({ role: "sub", slaveId: newId! });
                go("#/sub");
              }}
              className="mt-5 w-full rounded-lg border border-brass/50 bg-brass/15 py-3 text-[13px] font-medium text-brass-soft"
            >
              Kneel 🖤
            </button>
          </div>
        )}

        {mode === "sub" && !issued && (
          <div className="card rounded-xl p-6">
            <div className="label">Your code or invitation key</div>
            <input
              autoFocus
              value={keyCode}
              onChange={(e) => {
                setKeyCode(e.target.value.toUpperCase());
                setErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && enterSub()}
              placeholder="XXXX-XXXX"
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-center font-mono text-[1.3rem] tracking-[0.28em] text-brass-soft uppercase outline-none focus:border-brass/60"
            />

            {/* the field tells him what it recognised */}
            <p className="mt-2 h-4 text-center font-mono text-[10px] tracking-[0.14em] uppercase">
              {kind === "code" && <span className="text-emerald-300/80">🗝️ Permanent code recognised</span>}
              {kind === "invite" && <span className="text-brass-soft/80">⛓️ Invitation recognised</span>}
            </p>

            {(needsName || isNew) && (
              <>
                <div className="label mt-3">The name you will be known by</div>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErr("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && enterSub()}
                  placeholder="what she will call you"
                  className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-[15px] outline-none focus:border-brass/60"
                />
              </>
            )}

            <p className="mt-2 min-h-[2.5rem] text-[12.5px] leading-snug text-rose-300">{err}</p>

            {openInvites.length > 0 && (
              <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                <div className="label">Open invitations in this house</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {openInvites.map((i) => (
                    <button
                      key={i.key}
                      onClick={() => setKeyCode(i.key)}
                      className="rounded-md border border-brass/30 bg-brass/8 px-2.5 py-1 font-mono text-[11px] text-brass-soft"
                    >
                      {i.key} · {i.tier}
                      {i.boundName ? ` · ${i.boundName}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={() => setMode(null)} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
                Back
              </button>
              <button
                onClick={enterSub}
                disabled={busy}
                className="flex-1 rounded-lg border border-brass/50 bg-brass/15 py-3 text-[13px] font-medium text-brass-soft disabled:opacity-50"
              >
                {busy ? "⏳ Verifying…" : "Present Yourself"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
