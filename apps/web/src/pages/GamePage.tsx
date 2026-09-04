import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GameModeSchema } from "@voting-game/shared";
import { get, post } from "../api.js";
import { useAuth } from "../auth/AuthContext.js";
import { useSessionSocket } from "../hooks/useSessionSocket.js";
import type { ResultDto, SessionDto, VotingQuestionDto } from "../types.js";
import ConfigPanel from "../components/ConfigPanel.js";
import VotingScreen from "../components/VotingScreen.js";
import ResultsPanel from "../components/ResultsPanel.js";
import StandingsBar from "../components/StandingsBar.js";
import TieBreakPrompt, { type ActiveTieBreak } from "../components/TieBreakPrompt.js";
import ModeVotePanel from "../components/ModeVotePanel.js";
import TagVotePanel from "../components/TagVotePanel.js";
import Identicon from "../components/Identicon.js";

const ALL_MODES = GameModeSchema.options;

export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ submitted: number; total: number } | null>(null);
  const [modeVoteProgress, setModeVoteProgress] = useState<{ submitted: number; total: number } | null>(null);
  const [tagVoteProgress, setTagVoteProgress] = useState<{ submitted: number; total: number } | null>(null);
  const [activeTieBreak, setActiveTieBreak] = useState<ActiveTieBreak | null>(null);
  const [readyToRevealNext, setReadyToRevealNext] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [hostRemovedGame, setHostRemovedGame] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["session", code],
    queryFn: () => get<SessionDto>(`/sessions/${code}`),
    enabled: Boolean(code),
    refetchInterval: 8000, // safety net if the websocket drops
  });

  const session = sessionQuery.data;

  const questionsQuery = useQuery({
    queryKey: ["questions", code],
    queryFn: () => get<VotingQuestionDto[]>(`/sessions/${code}/questions`),
    enabled: Boolean(code) && session?.status === "VOTING",
    refetchInterval: 8000,
  });

  const resultsQuery = useQuery({
    queryKey: ["results", code],
    queryFn: () => get<ResultDto[]>(`/sessions/${code}/results`),
    enabled: Boolean(code) && session?.status !== "LOBBY",
    refetchInterval: 8000,
  });

  const tagsQuery = useQuery({
    queryKey: ["question-tags"],
    queryFn: () => get<{ tags: string[] }>("/questions/tags"),
    staleTime: Infinity,
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["session", code] });
    void queryClient.invalidateQueries({ queryKey: ["questions", code] });
    void queryClient.invalidateQueries({ queryKey: ["results", code] });
  }, [queryClient, code]);

  useSessionSocket(
    code,
    useCallback(
      (msg) => {
        switch (msg.event) {
          case "vote:progress":
            setProgress(msg.payload);
            break;
          case "modevote:opened":
            setModeVoteProgress(null);
            invalidateAll();
            break;
          case "modevote:progress":
            setModeVoteProgress(msg.payload);
            break;
          case "modevote:resolved":
            setModeVoteProgress(null);
            invalidateAll();
            break;
          case "tagvote:opened":
            setTagVoteProgress(null);
            invalidateAll();
            break;
          case "tagvote:progress":
            setTagVoteProgress(msg.payload);
            break;
          case "tagvote:resolved":
            setTagVoteProgress(null);
            invalidateAll();
            break;
          case "tiebreak:started":
            setActiveTieBreak(msg.payload);
            setReadyToRevealNext(false);
            invalidateAll();
            break;
          case "tiebreak:resolved":
            setActiveTieBreak((cur) => (cur?.sessionQuestionId === msg.payload.sessionQuestionId ? null : cur));
            invalidateAll();
            break;
          case "batch:ready_to_reveal":
            setReadyToRevealNext(true);
            invalidateAll();
            break;
          case "question:revealed":
            invalidateAll();
            break;
          case "batch:started":
            setReadyToRevealNext(false);
            setProgress(null);
            invalidateAll();
            break;
          case "host:removed_game":
            setHostRemovedGame(true);
            break;
          default:
            invalidateAll();
        }
      },
      [invalidateAll],
    ),
  );

  if (!code) return null;
  if (sessionQuery.isLoading) return <div className="p-8">Loading game…</div>;
  if (sessionQuery.isError || !session) {
    return <div className="p-8 text-danger">Couldn't load this game. Check the code and try again.</div>;
  }

  const me = session.players.find((p) => p.isMe);
  const isHost = user?.id === session.hostUserId;

  // Covers a page refresh mid-reveal: if there's nothing open to vote on but
  // the game hasn't finished, a synced reveal is very likely pending even
  // before the websocket confirms it.
  const inferredReadyToReveal =
    readyToRevealNext ||
    (session.config.revealMode === "ONE_AT_A_TIME_SYNCED" &&
      session.status === "VOTING" &&
      !activeTieBreak &&
      (questionsQuery.data?.length ?? 0) === 0);

  async function startGame() {
    setStartError(null);
    try {
      await post(`/sessions/${code}/start`);
      invalidateAll();
    } catch {
      setStartError("Need at least 3 players and enough questions in the bank to start.");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Game {session.joinCode}</h1>
          <p className="text-sm text-muted">Share this code with your group.</p>
        </div>
        {session.status === "COMPLETED" && <span className="rounded-full bg-emerald-700 px-3 py-1 text-sm text-white">Game over</span>}
      </header>

      <StandingsBar players={session.players} />

      {hostRemovedGame && (
        <div className="rounded-2xl border-2 border-panel-warning-border bg-panel-warning p-4 text-sm">
          The host has removed this game from their list. It's still here and still joinable, but
          they may not be coming back to start it.
        </div>
      )}

      {session.status === "LOBBY" && (
        <>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-2 text-sm text-muted">Players ({session.players.length})</p>
            <div className="flex flex-wrap gap-2">
              {session.players.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-1.5 pr-3 text-sm"
                >
                  <Identicon seed={p.id} size={18} />
                  {p.displayName}
                  {p.isConfigurator && " (host)"}
                </span>
              ))}
            </div>
          </div>

          {session.modeVoteOpen && session.myModeVoteStatus && (
            <ModeVotePanel
              code={code}
              isHost={isHost}
              candidates={ALL_MODES}
              myVoteStatus={session.myModeVoteStatus}
              progress={modeVoteProgress}
              onChanged={invalidateAll}
            />
          )}

          {session.tagVoteOpen && session.myTagVoteStatus && (
            <TagVotePanel
              code={code}
              isHost={isHost}
              candidates={tagsQuery.data?.tags ?? []}
              myVoteStatus={session.myTagVoteStatus}
              progress={tagVoteProgress}
              onChanged={invalidateAll}
            />
          )}

          <ConfigPanel
            code={code}
            config={session.config}
            isHost={isHost}
            playerCount={session.players.length}
            modeVoteOpen={session.modeVoteOpen}
            tagVoteOpen={session.tagVoteOpen}
            onChanged={invalidateAll}
          />

          {isHost && (
            <div>
              <button
                onClick={() => void startGame()}
                disabled={session.modeVoteOpen || session.tagVoteOpen}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {session.modeVoteOpen || session.tagVoteOpen ? "Waiting on the lobby vote…" : "Start game"}
              </button>
              {startError && <p className="mt-2 text-sm text-danger">{startError}</p>}
            </div>
          )}
        </>
      )}

      {session.status === "VOTING" && me && (
        <>
          {activeTieBreak && (
            <TieBreakPrompt code={code} tieBreak={activeTieBreak} players={session.players} onVoted={invalidateAll} />
          )}
          {questionsQuery.data && questionsQuery.data.length > 0 ? (
            <VotingScreen
              code={code}
              questions={questionsQuery.data}
              players={session.players}
              myPlayerId={me.id}
              config={session.config}
              progress={progress}
              onVoted={invalidateAll}
            />
          ) : (
            <p className="text-muted">Waiting on the next batch of questions…</p>
          )}
          <ResultsPanel
            code={code}
            results={resultsQuery.data ?? []}
            players={session.players}
            revealMode={session.config.revealMode}
            isHost={isHost}
            readyToRevealNext={inferredReadyToReveal}
          />
        </>
      )}

      {session.status === "COMPLETED" && (
        <ResultsPanel
          code={code}
          results={resultsQuery.data ?? []}
          players={session.players}
          revealMode={session.config.revealMode}
          isHost={isHost}
          readyToRevealNext={readyToRevealNext}
        />
      )}
    </div>
  );
}
