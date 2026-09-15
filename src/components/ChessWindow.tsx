import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ChessGame from "./ChessGame";
import type { ChessGame as ChessGameState } from "../lib/store";

/** game ids whose window has already announced itself this session */
const announcedGames = new Set<string>();

type Props = {
  game: ChessGameState;
  /** who is looking at the board */
  viewer: "mistress" | "sub";
  /** the other player — shown in the window title bar */
  opponentName: string;
  onMove?: (from: string, to: string, promotion?: string) => void;
  onResign?: () => void;
  onAbandon?: () => void;
};

/**
 * A game in the chat is only a preview card. Tapping it pops the board out
 * into its own window, layered on top of the chat — so the squares get the
 * full stage instead of fighting the message column for space.
 *
 * The card keeps both clocks and a miniature board (read-only); the playable
 * board lives in the popup.
 */
export default function ChessWindow({
  game,
  viewer,
  opponentName,
  onMove,
  onResign,
  onAbandon,
}: Props) {
  const [open, setOpen] = useState(false);

  /** A brand new, still-live game opens its window once on its own — after
   *  that it is the card in the chat that brings it back. The ids live at
   *  module level so closing and reopening a chat does not pop it up again. */
  useEffect(() => {
    if (announcedGames.has(game.id)) return;
    announcedGames.add(game.id);
    if (game.status === "active") setOpen(true);
  }, [game.id, game.status]);

  /* Esc closes, and the page behind stops scrolling while the window is up */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const sideToMove = game.fen.split(" ")[1] === "b" ? "b" : "w";
  const myTurn =
    viewer === "mistress" ? sideToMove === game.mistressColor : sideToMove !== game.mistressColor;
  const finished = game.status !== "active";
  const statusLabel = finished ? "Finished" : myTurn ? "Your move" : viewer === "mistress" ? "His move" : "Her move";

  return (
    <>
      {/* ---- the card that sits in the chat ------------------------------ */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Open the game in its own window"
        title="Open the game in its own window"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`group w-full cursor-pointer rounded-2xl border bg-black/40 p-3 transition outline-none focus-visible:border-brass/70 sm:max-w-[360px] ${
          !finished && myTurn
            ? "border-brass/60 shadow-[0_0_0_1px_rgba(201,162,39,.22)] hover:border-brass"
            : "border-brass/25 hover:border-brass/60"
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="label">{finished ? "♞ Game finished" : "♞ Game in progress"}</span>
          <span className="flex-1" />
          {!finished && myTurn && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass" />}
          <span
            className={`font-mono text-[9.5px] tracking-[0.14em] uppercase ${
              finished ? "text-white/35" : myTurn ? "text-brass-soft" : "text-white/40"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mx-auto w-full max-w-[230px]">
          <ChessGame game={game} viewer={viewer} compact interactive={false} />
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-md border border-brass/40 bg-brass/12 py-1.5 font-mono text-[10px] tracking-[0.14em] text-brass-soft uppercase transition group-hover:bg-brass/22">
          <span className="text-[12px] leading-none">⤢</span> Open game window
        </div>
      </div>

      {/* ---- the window itself ------------------------------------------- */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-2.5 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Chess against ${opponentName}`}
          >
            <div className="flex max-h-[95vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-brass/35 bg-gradient-to-b from-[#170e15] to-[#0a070b] shadow-[0_40px_120px_-20px_rgba(0,0,0,.95)] sm:max-h-[92vh]">
              {/* title bar */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-brass/25 bg-black/45 px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-[15px]">
                  ♞
                </span>
                <div className="min-w-0">
                  <div className="font-display truncate text-[14.5px] leading-tight text-white/85">
                    Chess · {opponentName}
                  </div>
                  <div className="font-mono text-[9px] tracking-[0.16em] text-white/35 uppercase">
                    Game window
                  </div>
                </div>
                <span className="flex-1" />
                {game.timeControl && (
                  <span className="hidden font-mono text-[10.5px] text-white/40 sm:block">
                    {game.timeControl.minutes}+{game.timeControl.increment}s
                  </span>
                )}
                <span
                  className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] tracking-[0.12em] uppercase ${
                    finished
                      ? "border-white/12 text-white/45"
                      : myTurn
                        ? "border-brass/50 bg-brass/12 text-brass-soft"
                        : "border-white/12 text-white/50"
                  }`}
                >
                  {statusLabel}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  title="Close the game window (Esc)"
                  aria-label="Close the game window"
                  className="-mr-1 shrink-0 rounded-full px-2.5 py-1 text-[18px] leading-none text-white/45 transition hover:bg-white/8 hover:text-white"
                >
                  ×
                </button>
              </div>

              {/* board — gets the whole stage, so the squares never squeeze */}
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-4">
                <div className="chess-window-board">
                  <ChessGame
                    game={game}
                    viewer={viewer}
                    onMove={onMove}
                    onResign={onResign}
                    onAbandon={onAbandon}
                  />
                </div>
              </div>

              {/* footer */}
              <div className="flex shrink-0 items-center gap-2 border-t border-white/8 bg-black/30 px-3.5 py-2">
                <span className="hidden font-mono text-[9px] tracking-[0.14em] text-white/35 uppercase sm:block">
                  {finished ? "The board stays in the chat" : "Tap a piece, then its square"}
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-brass/40 bg-brass/12 px-3.5 py-1.5 text-[11.5px] text-brass-soft transition hover:bg-brass/20"
                >
                  {finished ? "Close" : viewer === "mistress" ? "Minimize" : "Back to chat"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
