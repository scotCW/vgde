import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { QUESTION_BANK } from "./questionBank.js";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.questionBank.count();
  if (existing > 0) {
    console.log(`Question bank already has ${existing} rows, skipping seed.`);
    return;
  }

  await prisma.questionBank.createMany({
    data: QUESTION_BANK.map((q) => ({ id: randomUUID(), text: q.text, tags: q.tags })),
  });
  console.log(`Seeded ${QUESTION_BANK.length} questions.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
