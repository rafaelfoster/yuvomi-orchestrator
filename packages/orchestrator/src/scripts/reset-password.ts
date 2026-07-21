import { prisma } from "../db/client.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(12, "Password must be at least 12 characters long");

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npm run reset-password <email> <new-password>");
    console.error("Or: npx tsx src/scripts/reset-password.ts <email> <new-password>");
    process.exit(1);
  }

  const [email, password] = args;

  const emailParsed = emailSchema.safeParse(email);
  if (!emailParsed.success) {
    console.error("Error: Invalid email address");
    process.exit(1);
  }

  const passwordParsed = passwordSchema.safeParse(password);
  if (!passwordParsed.success) {
    console.error(`Error: ${passwordParsed.error.errors[0].message}`);
    process.exit(1);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Check if the user exists
    const admin = await prisma.adminUser.findUnique({
      where: { email }
    });

    if (admin) {
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          initialPassword: null,
        }
      });
      console.log(`Successfully updated password for existing admin: ${email}`);
    } else {
      await prisma.adminUser.create({
        data: {
          email,
          passwordHash,
          isSuperAdmin: true,
          mustChangePassword: false,
          initialPassword: null,
        }
      });
      console.log(`Created new super-admin user with email: ${email}`);
    }
  } catch (error) {
    console.error("Error resetting password:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
