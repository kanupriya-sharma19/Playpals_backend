import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("Starting manual migration...");

    // Read the SQL file
    const sqlPath = path.join(
      __dirname,
      "prisma",
      "migrations",
      "fix_migration.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Split SQL by semicolons to execute each statement separately
    const statements = sql.split(";").filter((s) => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.trim().slice(0, 50)}...`);
        await prisma.$executeRawUnsafe(statement);
        console.log("Statement executed successfully");
      }
    }

    console.log("Manual migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
