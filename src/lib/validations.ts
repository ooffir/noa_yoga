import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().min(2, "השם חייב להכיל לפחות 2 תווים"),
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
  phone: z.string().optional(),
  healthDeclaration: z.literal(true, {
    errorMap: () => ({ message: "יש לאשר את הצהרת הבריאות" }),
  }),
});

export const signInSchema = z.object({
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "נדרשת סיסמה"),
});

export const classDefinitionSchema = z.object({
  title: z.string().min(1, "שם שיעור נדרש"),
  description: z.string().optional(),
  instructor: z.string().min(1, "שם מורה נדרש"),
  dayOfWeek: z.enum([
    "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY",
    "THURSDAY", "FRIDAY", "SATURDAY",
  ]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "פורמט HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "פורמט HH:mm"),
  maxCapacity: z.number().int().min(1).max(100),
  location: z.string().optional(),
  isRecurring: z.boolean().optional().default(true),
  date: z.string().optional(),
});

export const bookingSchema = z.object({
  classInstanceId: z.string().min(1),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ClassDefinitionInput = z.infer<typeof classDefinitionSchema>;
