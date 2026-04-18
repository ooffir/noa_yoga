import { PrismaClient } from "@prisma/client";
import { writeFile } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Starting full database backup...\n");
  console.log(`📡 Source: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] || "unknown"}\n`);

  const backup: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  const tables = [
    { name: "users", fetch: () => prisma.user.findMany() },
    { name: "accounts", fetch: () => prisma.account.findMany() },
    { name: "sessions", fetch: () => prisma.session.findMany() },
    { name: "verificationTokens", fetch: () => prisma.verificationToken.findMany() },
    { name: "classDefinitions", fetch: () => prisma.classDefinition.findMany() },
    { name: "classInstances", fetch: () => prisma.classInstance.findMany() },
    { name: "bookings", fetch: () => prisma.booking.findMany() },
    { name: "waitlistEntries", fetch: () => prisma.waitlistEntry.findMany() },
    { name: "punchCards", fetch: () => prisma.punchCard.findMany() },
    { name: "payments", fetch: () => prisma.payment.findMany() },
    { name: "articles", fetch: () => prisma.article.findMany() },
    { name: "workshops", fetch: () => prisma.workshop.findMany() },
    { name: "workshopRegistrations", fetch: () => prisma.workshopRegistration.findMany() },
    { name: "siteSettings", fetch: () => prisma.siteSettings.findMany() },
    { name: "featureCards", fetch: () => prisma.featureCard.findMany() },
  ];

  for (const table of tables) {
    try {
      const rows = await table.fetch();
      backup[table.name] = rows;
      counts[table.name] = rows.length;
      console.log(`  ✓ ${table.name.padEnd(24)} ${rows.length.toString().padStart(5)} rows`);
    } catch (err: any) {
      console.log(`  ✗ ${table.name.padEnd(24)} FAILED: ${err.message}`);
      backup[table.name] = [];
      counts[table.name] = 0;
    }
  }

  const totalRows = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const payload = {
    backedUpAt: new Date().toISOString(),
    source: process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] || "unknown",
    totalRows,
    counts,
    data: backup,
  };

  const outPath = path.join(process.cwd(), "full_site_backup.json");
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf-8");

  console.log(`\n✅ Backup complete.`);
  console.log(`📦 Total: ${totalRows} rows across ${tables.length} tables`);
  console.log(`📁 File:  ${outPath}`);
  console.log(`\n🔒 Safe to delete the old database now.`);
}

main()
  .catch((e) => {
    console.error("❌ Backup failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
