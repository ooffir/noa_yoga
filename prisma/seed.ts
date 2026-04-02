import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { email: "omer609994@gmail.com" },
    update: { role: "ADMIN" },
    create: {
      email: "omer609994@gmail.com",
      name: "Omer (Admin)",
      passwordHash: adminPassword,
      role: "ADMIN",
      hasSignedHealthDeclaration: true,
      healthDeclSignedAt: new Date(),
    },
  });

  const studentPassword = await bcrypt.hash("student123", 12);
  const student = await prisma.user.upsert({
    where: { email: "student@example.com" },
    update: {},
    create: {
      email: "student@example.com",
      name: "Demo Student",
      phone: "050-123-4567",
      passwordHash: studentPassword,
      role: "STUDENT",
      hasSignedHealthDeclaration: true,
      healthDeclSignedAt: new Date(),
    },
  });

  await prisma.punchCard.create({
    data: {
      userId: student.id,
      totalCredits: 10,
      remainingCredits: 10,
    },
  });

  const classes = [
    { title: "וינאסה בוקר", description: "זרימה אנרגטית לתחילת היום", instructor: "שרה כהן", dayOfWeek: "SUNDAY" as const, startTime: "07:00", endTime: "08:15", maxCapacity: 15, location: "סטודיו ראשי" },
    { title: "האטה עדינה", description: "שיעור איטי עם דגש על נשימה", instructor: "מאיה לוי", dayOfWeek: "MONDAY" as const, startTime: "09:00", endTime: "10:00", maxCapacity: 12, location: "סטודיו ראשי" },
    { title: "פאוור יוגה", description: "אימון דינמי ומאתגר", instructor: "שרה כהן", dayOfWeek: "TUESDAY" as const, startTime: "18:00", endTime: "19:15", maxCapacity: 15, location: "סטודיו ראשי" },
    { title: "יין ושיקום", description: "מתיחות עמוקות והרפיה", instructor: "מאיה לוי", dayOfWeek: "WEDNESDAY" as const, startTime: "10:00", endTime: "11:15", maxCapacity: 10, location: "סטודיו קטן" },
    { title: "אשטנגה בסיסי", description: "מבוא לסדרה הראשונית", instructor: "דוד בן ארי", dayOfWeek: "THURSDAY" as const, startTime: "07:00", endTime: "08:30", maxCapacity: 12, location: "סטודיו ראשי" },
    { title: "זרימת שישי", description: "סיום שבוע בזרימה מרגיעה", instructor: "שרה כהן", dayOfWeek: "FRIDAY" as const, startTime: "09:00", endTime: "10:00", maxCapacity: 15, location: "סטודיו ראשי" },
  ];

  for (const cls of classes) {
    await prisma.classDefinition.create({ data: cls });
  }

  console.log("Seed complete!");
  console.log("  Admin: omer609994@gmail.com / admin123");
  console.log("  Student: student@example.com / student123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
