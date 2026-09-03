import { useEffect, useState } from "react";
import Gate from "./app/Gate";
import Landing from "./app/Landing";
import Deck from "./app/Deck";
import SubView from "./app/SubView";

import { getSession, resetAll, setSession } from "./lib/store";

/* ------------------------------------------------------------------ *
 *  Routes
 *    #/              landing & pricing
 *    #/gate          sign in  (Mistress code · permanent code · invite)
 *    #/invite/TOKEN  invitation deep link → Gate, pre-filled
 *    #/deck          Mistress command deck
 *    #/sub           submissive view
 * ------------------------------------------------------------------ */
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const [session, setLocal] = useState(getSession);

  const go = (r: string) => {
    window.location.hash = r;
    setLocal(getSession());
  };

  useEffect(() => {
    setLocal(getSession());
    window.scrollTo(0, 0);
  }, [hash]);

  const isGate = hash.startsWith("#/gate") || hash.startsWith("#/invite/");
  const inApp = isGate || hash.startsWith("#/deck") || hash.startsWith("#/sub");

  let view;
  if (hash.startsWith("#/deck") && session.role === "mistress") view = <Deck go={go} />;
  else if (hash.startsWith("#/sub") && session.slaveId) view = <SubView slaveId={session.slaveId} go={go} />;
  else if (inApp) view = <Gate go={go} />;
  else view = <Landing go={go} />;

  return (
    <>
      {view}
      {inApp && (
        <button
          onClick={() => {
            if (!confirm("Reset this house to an empty state?\n\nEvery submissive, invitation and record will be erased.")) return;
            resetAll();
            setSession({ role: null, slaveId: null });
            go("#/gate");
          }}
          className="fixed right-3 bottom-3 z-40 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-white/35 uppercase backdrop-blur hover:text-white/70"
        >
          reset house
        </button>
      )}
    </>
  );
}
