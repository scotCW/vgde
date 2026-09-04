-- DropForeignKey
ALTER TABLE "game_sessions" DROP CONSTRAINT "game_sessions_hostUserId_fkey";

-- DropForeignKey
ALTER TABLE "players" DROP CONSTRAINT "players_userId_fkey";

-- DropForeignKey
ALTER TABLE "session_questions" DROP CONSTRAINT "session_questions_questionId_fkey";

-- AlterTable
ALTER TABLE "game_sessions" ALTER COLUMN "hostUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "players" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "question_bank" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "session_questions" ADD COLUMN     "text" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "questionId" DROP NOT NULL;

-- Backfill: any SessionQuestion row that already existed before this
-- migration was drawn back when "text" only lived on the joined
-- QuestionBank row. Copy it over now, while that join is still intact,
-- before questionId can ever go null out from under it.
UPDATE "session_questions" sq
SET "text" = qb."text"
FROM "question_bank" qb
WHERE sq."questionId" = qb."id" AND sq."text" = '';

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question_bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
