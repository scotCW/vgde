-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "tagVoteOpen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tag_votes" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "voterPlayerId" TEXT NOT NULL,
    "excludedTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_votes_gameSessionId_voterPlayerId_key" ON "tag_votes"("gameSessionId", "voterPlayerId");

-- AddForeignKey
ALTER TABLE "tag_votes" ADD CONSTRAINT "tag_votes_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
