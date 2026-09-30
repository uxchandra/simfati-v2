import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@mail.com" },
    update: {},
    create: {
      name: "Administrator",
      email: "admin@mail.com",
      password: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
    },
  });

  console.log("Seed selesai: admin@mail.com / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());