import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { ROLES, SYSTEM_ROLES } from "../src/lib/roles";

async function main() {
  // Role sistem (migration sudah mengisinya; upsert supaya seed aman dijalankan berulang)
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { isSystem: true },
      create: { ...role, isSystem: true },
    });
  }

  const superadmin = await prisma.role.findUniqueOrThrow({ where: { code: ROLES.SUPERADMIN } });

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Administrator",
      username: "admin",
      password: await bcrypt.hash("admin123", 10),
      roleId: superadmin.id,
    },
  });

  console.log("Seed selesai: admin / admin123 (Super Admin)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
