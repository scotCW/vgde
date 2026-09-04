-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'VOTING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SessionQuestionStatus" AS ENUM ('PENDING', 'VOTING', 'TIE_BREAK', 'TALLIED', 'REVEALED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "displayNameDefault" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oidc_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "config" JSONB NOT NULL,
    "modeVoteOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mode_votes" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "voterPlayerId" TEXT NOT NULL,
    "mode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mode_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isConfigurator" BOOLEAN NOT NULL DEFAULT false,
    "cardsWon" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_questions" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "SessionQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "revealedAt" TIMESTAMP(3),
    "winnerPlayerId" TEXT,

    CONSTRAINT "session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_cards" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "ownerPlayerId" TEXT NOT NULL,
    "targetPlayerId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedOnSessionQuestionId" TEXT,

    CONSTRAINT "vote_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "voterPlayerId" TEXT NOT NULL,
    "targetPlayerId" TEXT,
    "isAutoAbstain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tie_break_rounds" (
    "id" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "candidatePlayerIds" TEXT[],
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "winnerPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tie_break_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tie_break_votes" (
    "id" TEXT NOT NULL,
    "tieBreakRoundId" TEXT NOT NULL,
    "voterPlayerId" TEXT NOT NULL,
    "targetPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tie_break_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "oidc_identities_issuer_subject_key" ON "oidc_identities"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_joinCode_key" ON "game_sessions"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "mode_votes_gameSessionId_voterPlayerId_key" ON "mode_votes"("gameSessionId", "voterPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "players_gameSessionId_userId_key" ON "players"("gameSessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_questions_gameSessionId_orderIndex_key" ON "session_questions"("gameSessionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "vote_cards_gameSessionId_ownerPlayerId_targetPlayerId_key" ON "vote_cards"("gameSessionId", "ownerPlayerId", "targetPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_sessionQuestionId_voterPlayerId_key" ON "votes"("sessionQuestionId", "voterPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "tie_break_rounds_sessionQuestionId_roundIndex_key" ON "tie_break_rounds"("sessionQuestionId", "roundIndex");

-- CreateIndex
CREATE UNIQUE INDEX "tie_break_votes_tieBreakRoundId_voterPlayerId_key" ON "tie_break_votes"("tieBreakRoundId", "voterPlayerId");

-- AddForeignKey
ALTER TABLE "oidc_identities" ADD CONSTRAINT "oidc_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mode_votes" ADD CONSTRAINT "mode_votes_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_cards" ADD CONSTRAINT "vote_cards_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voterPlayerId_fkey" FOREIGN KEY ("voterPlayerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tie_break_rounds" ADD CONSTRAINT "tie_break_rounds_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tie_break_votes" ADD CONSTRAINT "tie_break_votes_tieBreakRoundId_fkey" FOREIGN KEY ("tieBreakRoundId") REFERENCES "tie_break_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
