import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { useTick, useStore, type ChessGame as ChessGameState } from "../lib/store";

/** Unicode chess piece glyphs keyed by FEN character */
const PIECE_GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

type Props = {
  game: ChessGameState;
  /** who is viewing the board: "mistress" or "sub" */
  viewer: "mistress" | "sub";
  /** called when the local player makes a move */
  onMove?: (from: string, to: string, promotion?: string) => void;
  /** called when local player resigns */
  onResign?: () => void;
  /** called when Mistress abandons / closes a game */
  onAbandon?: () => void;
  /**
   * Slim, chrome-free board used as the preview card inside the chat.
   * Keeps both clocks, drops the header, move list and action buttons.
   */
  compact?: boolean;
  /**
   * `false` renders a read-only board (the chat preview card). The real,
   * playable board lives in the popped-out game window. Defaults to `true`.
   */
  interactive?: boolean;
};

/**
 * Return the CSS color for a square given who is sitting on which side and
 * whether the Mistress is white. Rules from the brief:
 *
 *   - Mistress's pieces are divine (gold/pink glow), slave's pieces are boring grey.
 *   - When Mistress is WHITE her side (the "white" squares and pieces) are pink
 *     (light + dark pink). When the slave is white, white stays plain white/grey
 *     (because they are slave pieces).
 *   - Black always stays dark/inky for whichever side isn't pink.
 */
function squareColors(game: ChessGameState): { light: string; dark: string; highlight: string } {
  // If the Mistress is playing white, the "white" squares are pink.
  // If the slave is white, white is boring (off-white).
  if (game.mistressColor === "w") {
    return {
      light: "#f4b8d4", // soft pink (Mistress light)
      dark: "#c46896",  // deeper rose (Mistress dark)
      highlight: "rgba(255,255,255,0.55)",
    };
  }
  // Slave is white — plain off-white / inky black.
  return {
    light: "#e4dcc8", // dull cream
    dark: "#6b5d48",  // dull brown
    highlight: "rgba(244, 220, 120, 0.55)",
  };
}

/**
 * How a single piece is styled. Returns a className + color string.
 * - owner === "mistress" → divine gold/pink glow depending on color
 * - owner === "slave"    → dull grey / off-white (slave pieces)
 */
function pieceStyle(
  fenChar: string,
  owner: "mistress" | "sub"
): { color: string; textShadow: string; className: string } {
  const isUpper = fenChar === fenChar.toUpperCase(); // white piece
  if (owner === "mistress") {
    if (isUpper) {
      // Mistress is white → DIVINE PINK / rose-gold white pieces
      return {
        color: "#fff0f6",
        textShadow:
          "0 0 2px #000, 0 0 6px #ff7fb3, 0 0 14px #ff5ca0, 0 1px 0 #a83568, 1px 2px 0 rgba(0,0,0,0.55)",
        className: "divine-piece mistress-white-piece",
      };
    }
    // Mistress is black → divine GOLD / brass black pieces (royal obsidian)
    return {
      color: "#f4e6b8",
      textShadow:
        "0 0 2px #000, 0 0 8px #c9a227, 0 0 16px rgba(201,162,39,0.6), 0 1px 0 #3a2a08, 1px 2px 0 rgba(0,0,0,0.6)",
      className: "divine-piece mistress-black-piece",
    };
  }
  // Slave pieces — dull, lifeless, boring.
  if (isUpper) {
    return {
      color: "#d7d2c6",
      textShadow: "0 1px 0 rgba(0,0,0,0.45)",
      className: "slave-piece slave-white-piece",
    };
  }
  return {
    color: "#2a2520",
    textShadow: "0 1px 0 rgba(0,0,0,0.35)",
    className: "slave-piece slave-black-piece",
  };
}

/** which player owns a given FEN piece char in this game */
function ownerOf(game: ChessGameState, fenChar: string): "mistress" | "sub" {
  const isWhite = fenChar === fenChar.toUpperCase();
  // White pieces belong to whoever is white
  if (isWhite) return game.mistressColor === "w" ? "mistress" : "sub";
  return game.mistressColor === "b" ? "mistress" : "sub";
}

function files(isMistressViewing: boolean, mistressColor: "w" | "b"): string[] {
  // Mistress sees from her own side; slave sees from his own side (i.e. opposite).
  const mistressBottom = mistressColor === "w" ? "white" : "black"; // Mistress at bottom if she is white (typical)
  const viewerBottom =
    (isMistressViewing && mistressBottom === "white") ||
    (!isMistressViewing && mistressBottom === "black")
      ? "white"
      : "black";
  const fs = ["a", "b", "c", "d", "e", "f", "g", "h"];
  // Viewer at bottom of the board: white=files left→right a..h, ranks 8→1
  return viewerBottom === "white" ? fs : [...fs].reverse();
}

function ranks(isMistressViewing: boolean, mistressColor: "w" | "b"): number[] {
  const mistressBottom = mistressColor === "w" ? "white" : "black";
  const viewerBottom =
    (isMistressViewing && mistressBottom === "white") ||
    (!isMistressViewing && mistressBottom === "black")
      ? "white"
      : "black";
  const rs = [1, 2, 3, 4, 5, 6, 7, 8];
  return viewerBottom === "white" ? [...rs].reverse() : rs;
}

export default function ChessGame({
  game,
  viewer,
  onMove,
  onResign,
  onAbandon,
  compact = false,
  interactive = true,
}: Props) {
  useTick(500); // tick the clock
  const honorific = useStore((s) => s.dungeon.honorific);
  const chess = useMemo(() => {
    const c = new Chess();
    try {
      c.load(game.fen);
    } catch {
      c.reset();
    }
    return c;
  }, [game.fen]);

  // The store uses an incrementing version to force re-renders when moves
  // come from the other side. `useMemo` above is fine because it keys on fen.
  const board = chess.board();
  const turn = chess.turn(); // "w" | "b"
  const isCheck = chess.inCheck();
  const isGameOver = chess.isGameOver() || game.status !== "active";

  const isMistressTurn =
    (turn === "w" && game.mistressColor === "w") ||
    (turn === "b" && game.mistressColor === "b");
  const viewerTurn = viewer === "mistress" ? isMistressTurn : !isMistressTurn;

  // Whose move it is right now (local viewer may move only on their turn).
  const canMove = !isGameOver && viewerTurn && onMove && interactive;

  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);

  // legal destination squares for the currently selected piece
  const legalDests = useMemo(() => {
    if (!selected) return new Set<string>();
    const moves = chess.moves({ square: selected as any, verbose: true });
    return new Set(moves.map((m) => m.to));
  }, [selected, chess]);

  useEffect(() => {
    // Clear selection any time the FEN changes (opponent moved, etc.)
    setSelected(null);
    setPromotion(null);
  }, [game.fen]);

  // ----- clock helpers -----
  const now = Date.now();
  const whiteMs = Math.max(
    0,
    (game.whiteTimeMs ?? 0) -
      (turn === "w" && game.status === "active" ? now - (game.lastMoveAt || now) : 0)
  );
  const blackMs = Math.max(
    0,
    (game.blackTimeMs ?? 0) -
      (turn === "b" && game.status === "active" ? now - (game.lastMoveAt || now) : 0)
  );
  const fmtClock = (ms: number) => {
    if (ms <= 0) return "0:00";
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const mistressClockMs = game.mistressColor === "w" ? whiteMs : blackMs;
  const slaveClockMs = game.mistressColor === "w" ? blackMs : whiteMs;

  // Whose clock is running out? detect timeout flag
  useEffect(() => {
    if (game.status !== "active") return;
    if (whiteMs <= 0 || blackMs <= 0) {
      // flag fall — handled by the store (chessMove detects 0 time and calls end).
      // Here we just trigger an empty move to force the store's flag handler.
      // We do this via a separate action so callers don't depend on render effects.
    }
  }, [whiteMs, blackMs, game.status]);

  const colors = squareColors(game);

  const onSquareClick = (alg: string, fenChar?: string) => {
    if (!canMove) return;
    // Piece belongs to viewer?
    const viewerColor: "w" | "b" =
      viewer === "mistress" ? game.mistressColor : game.mistressColor === "w" ? "b" : "w";
    const pieceColor = fenChar ? (fenChar === fenChar.toUpperCase() ? "w" : "b") : null;

    if (selected) {
      if (selected === alg) {
        setSelected(null);
        return;
      }
      if (legalDests.has(alg)) {
        // Is this a promotion move?
        const piece = chess.get(selected as any);
        const isPromotion =
          piece &&
          piece.type === "p" &&
          ((piece.color === "w" && alg[1] === "8") || (piece.color === "b" && alg[1] === "1"));
        if (isPromotion) {
          setPromotion({ from: selected, to: alg });
          return;
        }
        onMove?.(selected, alg);
        setSelected(null);
        return;
      }
      // Clicking a different one of own pieces switches selection
      if (pieceColor === viewerColor) {
        setSelected(alg);
        return;
      }
      setSelected(null);
      return;
    }
    if (pieceColor === viewerColor) setSelected(alg);
  };

  const confirmPromotion = (piece: "q" | "r" | "b" | "n") => {
    if (!promotion) return;
    onMove?.(promotion.from, promotion.to, piece);
    setPromotion(null);
    setSelected(null);
  };

  const fs = files(viewer === "mistress", game.mistressColor);
  const rs = ranks(viewer === "mistress", game.mistressColor);

  // Map board 2D array (always rank 8→0, file a→h) into algebraic lookup.
  const pieceAt = (file: string, rank: number): string | undefined => {
    const rankIdx = 8 - rank; // rank 8 → 0, rank 1 → 7
    const fileIdx = file.charCodeAt(0) - 97;
    const p = board[rankIdx]?.[fileIdx];
    return p ? (p.color === "w" ? p.type.toUpperCase() : p.type) : undefined;
  };

  let overlayText: string | null = null;
  if (game.status === "checkmate") {
    overlayText = game.winner === "mistress" ? "♛ She wins. You lose." : "You have won… this time.";
  } else if (game.status === "timeout") {
    overlayText = game.winner === "mistress" ? "⏰ Time — she wins." : "⏰ Her time has run out.";
  } else if (game.status === "resign") {
    overlayText = game.winner === "mistress" ? "⛓️ Resignation accepted." : "You have resigned.";
  } else if (game.status === "draw") {
    overlayText = "Stalemate · draw.";
  }

  // Find the king square if in check so we can highlight it
  const checkKingSquare = useMemo(() => {
    if (!isCheck || game.status !== "active") return null;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === "k" && p.color === turn) {
          const file = "abcdefgh"[f];
          const rank = 8 - r;
          return `${file}${rank}`;
        }
      }
    }
    return null;
  }, [board, isCheck, turn, game.status]);

  return (
    <div className={`chess-root select-none${compact ? " chess-root-compact" : ""}`}>
      {/* Captured / status bar — the window carries its own title bar */}
      {!compact && (
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="label">♞ Game Time</span>
            {game.timeControl && (
              <span className="font-mono text-white/50">
                {game.timeControl.minutes}+{game.timeControl.increment}s
              </span>
            )}
          </div>
          <span className="label">
            {game.status === "active"
              ? viewerTurn
                ? "Your move"
                : viewer === "mistress"
                  ? `His move`
                  : `Her move`
              : "Finished"}
          </span>
        </div>
      )}

      {/* Opponent clock */}
      <div
        className={`mb-1 flex items-center justify-between rounded-md border px-2.5 font-mono ${
          compact ? "py-0.5 text-[11px]" : "py-1 text-[12px]"
        } ${
          viewer === "mistress"
            ? "border-white/10 bg-white/5 text-white/70"
            : "border-brass/35 bg-brass/10 text-brass-soft"
        }`}
      >
        <span>{viewer === "mistress" ? "Slave" : honorific}</span>
        <span className={`tabular-nums ${turn !== (viewerColorOf(viewer, game.mistressColor)) && game.status === "active" ? "text-amber-200" : ""}`}>
          {viewer === "mistress" ? fmtClock(slaveClockMs) : fmtClock(mistressClockMs)}
        </span>
      </div>

      {/* Board */}
      <div className="relative">
        {/* The board is a rigid 8×8 lattice: the tracks are declared as
            `minmax(0,1fr)` on *both* axes, so every square measures exactly
            one eighth of the board — occupied or empty — and the square stays
            square (the box is 1:1). Without the row template the rows were
            content-sized, which made a rank with a piece on it twice as tall
            as an empty one. */}
        <div
          className="chess-board grid overflow-hidden rounded-lg border border-white/15 shadow-2xl"
          style={{
            gridTemplateColumns: "repeat(8, minmax(0,1fr))",
            gridTemplateRows: "repeat(8, minmax(0,1fr))",
            aspectRatio: "1 / 1",
          }}
        >
          {rs.map((rank) =>
            fs.map((file) => {
              const alg = `${file}${rank}`;
              const p = pieceAt(file, rank);
              const isLight = (file.charCodeAt(0) - 97 + rank) % 2 === 1;
              const bg = isLight ? colors.light : colors.dark;
              const isSelected = selected === alg;
              const isDest = legalDests.has(alg);
              const isCheckSq = checkKingSquare === alg;
              const pieceLook = p ? pieceStyle(p, ownerOf(game, p)) : null;
              return (
                <button
                  key={alg}
                  onClick={() => onSquareClick(alg, p)}
                  disabled={!canMove}
                  tabIndex={canMove ? undefined : -1}
                  aria-label={`${alg}${p ? ` ${p}` : ""}`}
                  data-square={alg}
                  className={`relative flex items-center justify-center transition ${canMove ? "cursor-pointer" : "cursor-default"}`}
                  style={{
                    background: isCheckSq ? "rgba(244,63,94,0.55)" : bg,
                    boxShadow: isSelected ? "inset 0 0 0 3px rgba(255,255,255,0.8)" : undefined,
                  }}
                >
                  {/* coordinate labels */}
                  {file === fs[0] && (
                    <span className="absolute top-0.5 left-1 font-mono text-[9px] opacity-50">
                      {rank}
                    </span>
                  )}
                  {rank === rs[rs.length - 1] && (
                    <span className="absolute bottom-0.5 right-1 font-mono text-[9px] opacity-50">
                      {file}
                    </span>
                  )}
                  {/* move dot / capture ring — sized off the square (cqi) so
                      a marker looks the same in the tiny chat card as it does
                      on the full board */}
                  {isDest && !p && (
                    <span
                      className="rounded-full"
                      style={{
                        background: colors.highlight,
                        width: "var(--chess-mark)",
                        height: "var(--chess-mark)",
                      }}
                    />
                  )}
                  {isDest && p && (
                    <span
                      className="absolute rounded-full"
                      style={{
                        inset: "var(--chess-inset)",
                        boxShadow: `inset 0 0 0 var(--chess-ring) ${colors.highlight}`,
                      }}
                    />
                  )}
                  {/* piece — the glyph box is fixed to the square (see
                      .chess-piece in index.css), so a piece can never resize
                      the rank it sits on */}
                  {p && pieceLook && (
                    <span
                      className="chess-piece"
                      style={{ color: pieceLook.color, textShadow: pieceLook.textShadow }}
                    >
                      {PIECE_GLYPH[p]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {overlayText && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <div className="text-center">
              <div className={`font-display text-brass-soft ${compact ? "text-[0.95rem] leading-tight" : "text-[1.6rem]"}`}>
                {overlayText}
              </div>
            </div>
          </div>
        )}

        {/* Promotion picker */}
        {promotion && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75" onClick={() => setPromotion(null)}>
            <div
              className="flex gap-2 rounded-xl border border-brass/40 bg-[#0c0810] p-3"
              onClick={(e) => e.stopPropagation()}
            >
              {(["q", "r", "b", "n"] as const).map((pc) => {
                // The promoted piece belongs to the viewer's side, so pick the
                // glyph (upper = white, lower = black) matching their colour.
                const viewerIsWhite = viewerColorOf(viewer, game.mistressColor) === "w";
                const promotingFen = viewerIsWhite ? pc.toUpperCase() : pc;
                const owner: "mistress" | "sub" = ownerOf(game, promotingFen);
                return (
                  <button
                    key={pc}
                    onClick={() => confirmPromotion(pc)}
                    className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[36px] transition hover:border-brass/60"
                    style={{
                      color: pieceStyle(promotingFen, owner).color,
                      textShadow: pieceStyle(promotingFen, owner).textShadow,
                    }}
                  >
                    {PIECE_GLYPH[promotingFen]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Viewer clock */}
      <div
        className={`mt-1 flex items-center justify-between rounded-md border px-2.5 font-mono ${
          compact ? "py-0.5 text-[11px]" : "py-1 text-[12px]"
        } ${
          viewer === "mistress"
            ? "border-brass/45 bg-brass/15 text-brass-soft"
            : "border-white/15 bg-white/5 text-white/75"
        }`}
      >
        <span>{viewer === "mistress" ? "You" : "You"}</span>
        <span className={`tabular-nums ${turn === viewerColorOf(viewer, game.mistressColor) && game.status === "active" ? "text-amber-200" : ""}`}>
          {viewer === "mistress" ? fmtClock(mistressClockMs) : fmtClock(slaveClockMs)}
        </span>
      </div>

      {/* Move list — the window only; the chat card stays small */}
      {!compact && game.moves.length > 0 && (
        <div className="thin-scroll mt-2 max-h-24 overflow-y-auto rounded-md border border-white/8 bg-white/[0.025] p-2 font-mono text-[10.5px] leading-snug text-white/50">
          {game.moves
            .reduce<string[][]>((rows, m, i) => {
              if (i % 2 === 0) rows.push([m]);
              else rows[rows.length - 1].push(m);
              return rows;
            }, [])
            .map((row, i) => (
              <div key={i}>
                <span className="text-white/30">{i + 1}.</span> {row[0]} {row[1] || ""}
              </div>
            ))}
        </div>
      )}

      {/* Actions — only reachable from the playable window */}
      {!compact && (
        <div className="mt-2 flex gap-2">
          {game.status === "active" && viewer === "sub" && onResign && (
            <button
              onClick={() => {
                if (confirm("Resign the game? She wins.")) onResign();
              }}
              className="flex-1 rounded-md border border-rose-400/40 bg-rose-500/10 py-1.5 text-[11px] text-rose-200 transition hover:bg-rose-500/20"
            >
              Resign
            </button>
          )}
          {viewer === "mistress" && onAbandon && (
            <button
              onClick={() => {
                if (confirm("Abandon this game? It will be removed from the chat.")) onAbandon();
              }}
              className="flex-1 rounded-md border border-white/15 bg-white/5 py-1.5 text-[11px] text-white/55 transition hover:border-rose-400/40 hover:text-rose-200"
            >
              Abandon game
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function viewerColorOf(viewer: "mistress" | "sub", mistressColor: "w" | "b"): "w" | "b" {
  if (viewer === "mistress") return mistressColor;
  return mistressColor === "w" ? "b" : "w";
}
