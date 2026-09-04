import { useEffect, useRef } from "react";
import type { GameConfig } from "@voting-game/shared";

export type SessionSocketEvent =
  | { event: "player:joined"; payload: { playerId: string; displayName: string } }
  | { event: "config:updated"; payload: unknown }
  | { event: "modevote:opened"; payload: { candidates: GameConfig["mode"][] } }
  | { event: "modevote:progress"; payload: { submitted: number; total: number } }
  | { event: "modevote:resolved"; payload: { mode: GameConfig["mode"] | null; tally: Record<string, number> } }
  | { event: "tagvote:opened"; payload: { candidates: string[] } }
  | { event: "tagvote:progress"; payload: { submitted: number; total: number } }
  | { event: "tagvote:resolved"; payload: { excludedTags: string[] } }
  | { event: "game:started"; payload: { questionCount: number } }
  | { event: "vote:progress"; payload: { submitted: number; total: number } }
  | { event: "tiebreak:started"; payload: { sessionQuestionId: string; tieBreakRoundId: string; text: string; candidatePlayerIds: string[] } }
  | { event: "tiebreak:resolved"; payload: { sessionQuestionId: string; winnerPlayerId: string | null } }
  | { event: "question:revealed"; payload: { sessionQuestionId: string; text: string; orderIndex: number; tally: Record<string, number>; winnerPlayerId: string | null } }
  | { event: "batch:ready_to_reveal"; payload: object }
  | { event: "batch:started"; payload: { questionCount: number } }
  | { event: "game:completed"; payload: { standings: { playerId: string; displayName: string; cardsWon: number }[]; winnerPlayerIds: string[] } };

/** Broadcast-only channel: the server never expects messages back. */
export function useSessionSocket(code: string | undefined, onEvent: (e: SessionSocketEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!code) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/sessions/${code}`);

    socket.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as SessionSocketEvent;
        handlerRef.current(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    return () => socket.close();
  }, [code]);
}
