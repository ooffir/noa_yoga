#!/usr/bin/env python3
"""
Generates the Noa Yogis Hebrew user manual as a styled PDF.

Output: Noa_Yoga_Manual_Hebrew.pdf (next to this script's cwd)

Hebrew RTL strategy:
  - fpdf2 2.7+ ships with `set_text_shaping(use_shaping_engine=True)` that
    delegates to uharfbuzz for BIDI + glyph shaping. This correctly handles
    mixed Hebrew / English / numbers / punctuation in a single string.
  - We use Windows Arial (arial.ttf / arialbd.ttf) because it already has
    full Hebrew glyph coverage and ships on every Windows machine. No
    external font download needed.

Run:
    python scripts/generate_manual_pdf.py
"""

from __future__ import annotations

from pathlib import Path
from fpdf import FPDF

# ── Sage palette (matches the studio's UI tokens) ──
SAGE_50  = (244, 247, 244)
SAGE_100 = (227, 234, 227)
SAGE_200 = (199, 213, 200)
SAGE_500 = (88, 123, 91)
SAGE_600 = (68, 98, 71)
SAGE_700 = (56, 79, 58)
SAGE_900 = (40, 53, 42)
SAND_50  = (250, 248, 242)
WHITE    = (255, 255, 255)

WINDOWS_FONTS = Path("C:/Windows/Fonts")
FONT_REGULAR = WINDOWS_FONTS / "arial.ttf"
FONT_BOLD    = WINDOWS_FONTS / "arialbd.ttf"

if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
    raise SystemExit(
        "Hebrew-capable system fonts missing. Expected Arial at "
        f"{FONT_REGULAR} / {FONT_BOLD}"
    )


# ─────────────────────────────────────────────────────────────────────────────
#  PDF class with running header / footer
# ─────────────────────────────────────────────────────────────────────────────
class ManualPDF(FPDF):
    def header(self):
        # Skip on the cover page — it has its own design.
        if self.page_no() == 1:
            return

        # Thin sage accent strip at the very top
        self.set_fill_color(*SAGE_600)
        self.rect(0, 0, 210, 5, "F")

        # Right-aligned studio name
        self.set_y(10)
        self.set_font("Heb", "", 9)
        self.set_text_color(*SAGE_500)
        self.cell(0, 5, "Noa Yogis  ·  מדריך למנהלת", align="R")
        self.ln(8)

    def footer(self):
        if self.page_no() == 1:
            return

        # Divider + centered page number (subtract 1 so the cover isn't counted)
        self.set_y(-16)
        self.set_draw_color(*SAGE_100)
        self.set_line_width(0.2)
        self.line(20, self.get_y(), 190, self.get_y())

        self.set_y(-12)
        self.set_font("Heb", "", 9)
        self.set_text_color(*SAGE_500)
        self.cell(0, 5, f"עמוד {self.page_no() - 1}", align="C")


# ─────────────────────────────────────────────────────────────────────────────
#  Manual content — all in Hebrew
# ─────────────────────────────────────────────────────────────────────────────
SECTIONS: list[tuple[str, list[tuple[str, list[str]]]]] = [
    (
        "1. חלוקת אחריות — מי עושה מה?",
        [
            (
                "אוטומטי — המערכת עושה בשבילך",
                [
                    "שליחת מיילי תזכורת, אישור הרשמה והודעות ביטול בזמן אמת",
                    "ניהול קידומים אוטומטיים מרשימת ההמתנה כשמתפנה מקום",
                    "ניכוי קרדיט אוטומטי בעת הרשמה או בעת קידום מרשימת המתנה",
                    "חישוב ועדכון מדדי לוח הבקרה והניתוחים העסקיים",
                    "אימות תשלומים דרך PayMe ועדכון מיידי של יתרות הקרדיטים",
                    "שליחת קבלה דיגיטלית אוטומטית לאחר כל תשלום מוצלח",
                ],
            ),
            (
                "ידני — המשימות של נועה",
                [
                    "יצירה ועריכה של מופעי שיעורים וסדנאות במערכת",
                    "הוספה ידנית של קרדיטים לתלמידות במקרים מיוחדים (תשלום במזומן, מחוות רצון טוב)",
                    "עריכת הגדרות האתר — טלפון, אינסטגרם, אימייל ליצירת קשר",
                    "כתיבת כתבות למגזין הסטודיו",
                    "אישור או דחייה של תשלומים תקועים במסך \"תשלומים תקועים\"",
                    "התאמה ועריכה של תבניות המייל והעיצוב הוויזואלי של האתר",
                ],
            ),
        ],
    ),
    (
        "2. מחזור חיי שיעור — הרשמה, ביטול ורשימת המתנה",
        [
            (
                "הרשמה לשיעור",
                [
                    "תלמידות חייבות קרדיט פעיל או כרטיסייה פעילה כדי להירשם לשיעור או להצטרף לרשימת המתנה",
                    "תלמידה עם 0 קרדיטים רואה אוטומטית את חלון הקנייה עם שלוש האפשרויות — שיעור בודד, כרטיסיית 5 או כרטיסיית 10",
                    "הרשמה מוצלחת מובילה לניכוי קרדיט אוטומטי ואישור מיידי בתוספת מייל אישור",
                ],
            ),
            (
                "ביטולים",
                [
                    "ביטול בתוך חלון הביטול המוגדר (ברירת מחדל 6 שעות) — הקרדיט מוחזר אוטומטית לחשבון התלמידה",
                    "ביטול מאוחר מחלון הזמן — הקרדיט נשאר אצל הסטודיו, המקום מתפנה לאחרות",
                    "חלון הביטול ניתן לשינוי מהגדרות האתר ומתעדכן אוטומטית בכל מסכי המערכת",
                ],
            ),
            (
                "לוגיקת רשימת המתנה",
                [
                    "המערכת מקדמת אוטומטית את התלמידה הראשונה בתור כשמתפנה מקום",
                    "תלמידות רואות את מקומן המדויק — למשל \"מקום 2 בתור\"",
                    "בעת קידום, הקרדיט נגבה אוטומטית ונשלח מייל אישור מיידי",
                    "תלמידה יכולה לצאת מרשימת המתנה בכל רגע — בלחיצה אחת",
                ],
            ),
            (
                "קידום ידני — כוח האדמין",
                [
                    "בתצוגת \"נוכחות\" ניתן ללחוץ \"הכנס לשיעור\" ליד כל תלמידה ברשימת המתנה",
                    "הפעולה מכניסה אותה מיד לשיעור — גם מעל הקיבולת המרבית",
                    "מנכה קרדיט אחד אוטומטית ושולחת מייל אישור על הכניסה לשיעור",
                    "נכשלת בבטחה אם לתלמידה אין קרדיטים — מבקשת להוסיף קרדיטים תחילה",
                ],
            ),
        ],
    ),
    (
        "3. לוח בקרה וניתוחים",
        [
            (
                "תובנות על תלמידות",
                [
                    "פיצול אוטומטי בין \"פעילות\" (עם קרדיט פנוי) ו-\"לא פעילות\" (0 קרדיטים)",
                    "עוזר לזהות למי לפנות לחידוש מנוי — קהל היעד לקמפיינים",
                    "אחוז הפעילות מוצג באופן ויזואלי על גבי רצועת התקדמות",
                ],
            ),
            (
                "תצוגת נוכחות",
                [
                    "מעקב בזמן אמת מי הגיעה ומי עדיין ברשימת ההמתנה",
                    "שתי רשימות נפרדות: \"רשומות\" ו-\"רשימת המתנה\" עם מספור לפי סדר הצטרפות",
                    "כפתור \"סימון נוכחות\" לכל תלמידה + \"הכנס לשיעור\" לממתינות",
                ],
            ),
            (
                "היסטוריית תלמידה — לחיצה על שם",
                [
                    "לחיצה על שם תלמידה ברשימת המשתמשות חושפת היסטוריה מלאה",
                    "הזמנות עתידיות, היסטוריית שיעורים (50 אחרונות), ביטולים ונוכחות",
                    "כרטיסיות פעילות עם מספר הקרדיטים הזמינים",
                    "סיכום מספרי: כמה הזמנות, כמה נכחה ברחל, כמה ביטלה",
                ],
            ),
        ],
    ),
    (
        "4. תשלומים וקרדיטים",
        [
            (
                "משולב מלא עם PayMe",
                [
                    "רכישת שיעור בודד, כרטיסיית 5 שיעורים או כרטיסיית 10 שיעורים",
                    "תשלום מאובטח דרך דף התשלום המתארח של PayMe",
                    "אישור אוטומטי של תשלום ועדכון קרדיטים תוך שניות",
                    "קבלה דיגיטלית נשלחת אוטומטית במייל לכל רכישה מוצלחת",
                    "במקרה של החזר כספי דרך PayMe — הכרטיסייה קופאת אוטומטית בשל סנכרון webhook",
                ],
            ),
            (
                "סדר עדיפויות בניכוי קרדיט",
                [
                    "המערכת משתמשת ראשית בקרדיטים הישירים של המשתמשת (אם יש)",
                    "אם אין קרדיטים ישירים — מנוכה ישיבה מהכרטיסייה הפעילה הוותיקה ביותר (FIFO)",
                    "סדר זה מבטיח שכרטיסיות ישנות נוצלות לפני הטריות — הוגן כלכלית וגם שימושי מבחינת תוקף",
                ],
            ),
        ],
    ),
    (
        "5. סדנאות ומגזין",
        [
            (
                "סדנאות — מוצר נפרד מערכת הקרדיטים",
                [
                    "עמוד ייעודי ב-/workshops עם תמיכה מלאה ב-Markdown (מודגש, רשימות, תמונות)",
                    "רכישה דרך PayMe בנפרד ממערכת הקרדיטים של השיעורים",
                    "לפני התשלום, חובה לסמן תיבת הסכמה למדיניות ביטולים — תואם חוק הגנת הצרכן",
                    "תצוגת \"ארכיון\" לסדנאות שכבר התקיימו — שליטה מלאה מהפאנל",
                    "ביטול סדנה על ידי האדמין מפעיל cascade: מסמן נרשמות כמבוטלות ושולח מייל על החזר כספי בדרך",
                ],
            ),
            (
                "מגזין — CMS לקהילה",
                [
                    "כלי ניהול תוכן פשוט לכתיבת כתבות בפורמט Markdown",
                    "תמיכה בכותרות, הדגשות, רשימות, ציטוטים ותמונות רספונסיביות",
                    "שומר על הקהילה מעורבת ומעניק ערך נוסף מעבר לתרגול במזרן",
                    "ידידותי ל-SEO — כל כתבה עם slug, תיאור ותמונה ראשית",
                ],
            ),
        ],
    ),
    (
        "6. הגדרות אתר — מרכז השליטה",
        [
            (
                "תבניות מייל — כוח עריכה מלא",
                [
                    "עריכה חופשית של טקסט כל המיילים היוצאים ישירות מלוח הבקרה",
                    "תמיכה ב-placeholders: {{name}}, {{className}}, {{date}}, {{time}}",
                    "שינוי נכנס לתוקף מיידית — במייל הבא שיישלח",
                    "שדה ריק משאיר את תבנית ברירת המחדל הבנויה מראש",
                ],
            ),
            (
                "פרטי קשר — פוטר דינמי",
                [
                    "ניהול מלא של אימייל, טלפון, קישור לאינסטגרם וקבוצת ווצאפ",
                    "ערך ריק = מסתיר אוטומטית את הכפתור / הקישור מהפוטר",
                    "שינויים מופיעים באתר תוך שניות — ללא צורך בפריסה מחדש",
                ],
            ),
            (
                "מדיניות תפעולית",
                [
                    "מחירים דינמיים: שיעור בודד, כרטיסיית 5, כרטיסיית 10",
                    "חלון ביטול הניתן לעדכון — משתקף אוטומטית ב-6 מקומות באתר",
                    "הגדרות תזמון תזכורות: שעה (שעון ישראל) וימים לפני השיעור",
                ],
            ),
        ],
    ),
]


# ─────────────────────────────────────────────────────────────────────────────
#  Builders
# ─────────────────────────────────────────────────────────────────────────────
def build_cover(pdf: FPDF) -> None:
    pdf.add_page()

    # Full-page warm sand wash
    pdf.set_fill_color(*SAND_50)
    pdf.rect(0, 0, 210, 297, "F")

    # Sage header block
    pdf.set_fill_color(*SAGE_600)
    pdf.rect(0, 0, 210, 70, "F")

    # Top eyebrow
    pdf.set_y(28)
    pdf.set_font("Heb", "", 12)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 6, "N O A   Y O G I S", align="C")

    # Big title
    pdf.set_y(98)
    pdf.set_font("Heb", "B", 30)
    pdf.set_text_color(*SAGE_900)
    pdf.cell(0, 12, "מדריך משתמש", align="C")
    pdf.ln(14)
    pdf.set_font("Heb", "B", 22)
    pdf.set_text_color(*SAGE_700)
    pdf.cell(0, 10, "מערכת ניהול הסטודיו", align="C")

    # Divider
    pdf.ln(14)
    pdf.set_draw_color(*SAGE_200)
    pdf.set_line_width(0.4)
    pdf.line(80, pdf.get_y(), 130, pdf.get_y())

    # Subtitle
    pdf.ln(8)
    pdf.set_font("Heb", "", 14)
    pdf.set_text_color(*SAGE_500)
    pdf.cell(0, 8, "ניהול מקצועי ואוטומציה של הסטודיו", align="C")

    # Lotus / mark block (simple geometric motif — three stacked lines)
    pdf.ln(30)
    cx, y = 105, pdf.get_y()
    pdf.set_fill_color(*SAGE_500)
    for w_mm in (22, 14, 8):
        pdf.rect(cx - w_mm / 2, y, w_mm, 1.2, "F")
        y += 4
    pdf.set_y(y + 8)

    # Bottom attribution
    pdf.set_y(260)
    pdf.set_font("Heb", "", 10)
    pdf.set_text_color(*SAGE_500)
    pdf.cell(0, 5, "נועה אופיר  ·  סטודיו ליוגה ותנועה", align="C")
    pdf.ln(5)
    pdf.set_font("Heb", "", 9)
    pdf.cell(0, 5, "noayogaa@gmail.com  ·  noa-yoga.vercel.app", align="C")


def build_section(pdf: FPDF, title: str, blocks: list[tuple[str, list[str]]]) -> None:
    pdf.add_page()

    # Section number / title
    pdf.set_y(25)
    pdf.set_font("Heb", "B", 20)
    pdf.set_text_color(*SAGE_900)
    pdf.multi_cell(0, 11, title, align="R")

    # Sage underline anchored to right margin
    pdf.set_draw_color(*SAGE_500)
    pdf.set_line_width(0.8)
    y = pdf.get_y() + 1
    pdf.line(150, y, 190, y)

    pdf.ln(6)

    for heading, bullets in blocks:
        # Auto page-break guard — if a block won't fit, start fresh.
        needed = 14 + len(bullets) * 8
        if pdf.get_y() + needed > 260:
            pdf.add_page()

        # Block heading — smaller, still in sage 700
        pdf.set_font("Heb", "B", 13)
        pdf.set_text_color(*SAGE_700)
        pdf.multi_cell(0, 7.5, heading, align="R")
        pdf.ln(1)

        # Bullets
        pdf.set_font("Heb", "", 11)
        pdf.set_text_color(*SAGE_900)
        for bullet in bullets:
            y_before = pdf.get_y()

            # Bullet marker — filled sage circle on the right (RTL)
            pdf.set_fill_color(*SAGE_500)
            pdf.ellipse(186, y_before + 2, 1.6, 1.6, "F")

            # Text cell — reserve a narrow gap so the bullet doesn't overlap
            pdf.set_xy(20, y_before)
            pdf.multi_cell(w=163, h=6.5, text=bullet, align="R")
            pdf.ln(1.5)

        pdf.ln(3)


def build_pdf() -> Path:
    pdf = ManualPDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(left=20, top=22, right=20)
    pdf.set_auto_page_break(auto=True, margin=22)

    # Register Hebrew-capable fonts once; reuse across all pages
    pdf.add_font("Heb", "", str(FONT_REGULAR))
    pdf.add_font("Heb", "B", str(FONT_BOLD))

    # Activate uharfbuzz shaping → correct BIDI + glyph forms for Hebrew
    pdf.set_text_shaping(use_shaping_engine=True)

    # Cover + sections
    build_cover(pdf)
    for title, blocks in SECTIONS:
        build_section(pdf, title, blocks)

    output = Path("Noa_Yoga_Manual_Hebrew.pdf")
    pdf.output(str(output))
    return output.resolve()


if __name__ == "__main__":
    path = build_pdf()
    print(f"Generated: {path}")
    print(f"Pages:     {1 + len(SECTIONS)}")
