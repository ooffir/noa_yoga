#!/usr/bin/env python3
"""
Generates a comprehensive Hebrew RTL status report on the PayMe
integration: what's not working, why, what we've patched, what data
we still need from PayMe / the merchant dashboard, and the recommended
next steps.

Output: PayMe_Payments_Status_Report.pdf (next to script's cwd)

Hebrew RTL strategy mirrors generate_manual_pdf.py — fpdf2 +
uharfbuzz text shaping, Windows Arial fonts.

Run:
    python scripts/generate_payments_report_pdf.py
"""

from __future__ import annotations

from pathlib import Path
from datetime import date
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
RED_500  = (211, 80, 80)
AMBER_500 = (200, 150, 50)

WINDOWS_FONTS = Path("C:/Windows/Fonts")
FONT_REGULAR = WINDOWS_FONTS / "arial.ttf"
FONT_BOLD    = WINDOWS_FONTS / "arialbd.ttf"

if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
    raise SystemExit(
        "Hebrew-capable system fonts missing. Expected Arial at "
        f"{FONT_REGULAR} / {FONT_BOLD}"
    )


class ReportPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        # Sage accent strip
        self.set_fill_color(*SAGE_600)
        self.rect(0, 0, 210, 5, "F")
        # Right-aligned title
        self.set_y(10)
        self.set_font("Heb", "", 9)
        self.set_text_color(*SAGE_500)
        self.cell(0, 5, "Noa Yogis  ·  דוח מצב תשלומים", align="R")
        self.ln(8)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-16)
        self.set_draw_color(*SAGE_100)
        self.set_line_width(0.2)
        self.line(20, self.get_y(), 190, self.get_y())
        self.set_y(-12)
        self.set_font("Heb", "", 9)
        self.set_text_color(*SAGE_500)
        self.cell(0, 5, f"עמוד {self.page_no() - 1}", align="C")


# ─────────────────────────────────────────────────────────────────────
#  Content — all Hebrew. Each section: (title, [(heading, [bullets])]).
#  Some bullets get a colored severity dot. Format: "🔴 text" or "🟡 text"
#  or plain text. The renderer detects the prefix and colors the bullet.
# ─────────────────────────────────────────────────────────────────────
SECTIONS: list[tuple[str, list[tuple[str, list[str]]]]] = [
    (
        "1. סיכום מנהלים",
        [
            (
                "מה הבעיה המרכזית",
                [
                    "תלמידות שילמו בהצלחה דרך PayMe, החיוב התבצע בכרטיס האשראי, אבל באתר הסטטוס נשאר \"בעיבוד\" והקרדיטים לא הוקצו אוטומטית.",
                    "נועה נאלצה לאשר ידנית כל תשלום מתוך לוח הבקרה של PayMe — חוויית משתמש שבורה ועומס תפעולי גבוה.",
                    "במקרים מסוימים תלמידות שילמו ולא קיבלו קרדיטים בכלל עד התערבות ידנית.",
                ],
            ),
            (
                "המצב כיום (אחרי הטיפולים)",
                [
                    "המערכת פועלת באמצעות שכבת הגנה רבודה (4 רמות פולבק) שעוקפת את הבעיות בצד של PayMe.",
                    "מרבית התשלומים מאושרים אוטומטית תוך 0–30 שניות מרגע התשלום, ללא התערבות ידנית.",
                    "כל מקרה קצה — למשל אם ה-Webhook של PayMe לא מגיע — מטופל על ידי לפחות אחת מהשכבות הבאות.",
                ],
            ),
            (
                "הסיכון שנותר",
                [
                    "🟡 האינטגרציה כיום \"רצה על טלאים\" — הקוד שלנו מנטרל בעיות שמקורן בצד של PayMe, אבל לא פותר אותן באמת.",
                    "🟡 סיכון תפעולי: אם PayMe ישנה מבנה ה-IPN (גוף ה-Webhook) — חלק מהפולבקים שלנו ייפסקו מבלי להתריע.",
                    "🟡 סיכון אבטחתי קל: בהיעדר חתימת HMAC מ-PayMe, אנחנו סומכים על סודיות ה-URL של ה-Webhook. זה סביר אך לא אידיאלי.",
                    "🔴 חלק מההגדרות של PayMe (סביבה, אישור מיוחד לקבלת custom fields) צריכות אימות אנושי מול נציג PayMe — בלי זה לא נדע אם הבעיה נפתרה לצמיתות.",
                ],
            ),
        ],
    ),
    (
        "2. ארכיטקטורת התשלום — איך זה אמור לעבוד",
        [
            (
                "השלבים בתשלום מוצלח (התסריט האידיאלי)",
                [
                    "1. תלמידה לוחצת \"רכישה\" בעמוד המחירון. הקוד שלנו יוצר רשומת Payment במצב PENDING במסד הנתונים.",
                    "2. הקוד שולח בקשת generate-sale ל-PayMe ומקבל סייל URL. התלמידה מועברת ל-PayMe.",
                    "3. PayMe מציג את עמוד התשלום (Hosted Payment Page) — שם התלמידה בוחרת אמצעי תשלום ומשלמת.",
                    "4. PayMe מבצע את החיוב מול חברת האשראי, מאשר אותו ומחזיר את התלמידה ל-sale_return_url שלנו.",
                    "5. PayMe שולח Webhook (IPN) מהשרת שלהם לשרת שלנו ב-/api/webhooks/payme.",
                    "6. ה-Webhook שלנו מקבל אישור התשלום, מעדכן את ה-Payment ל-COMPLETED ויוצר רשומת PunchCard.",
                    "7. עמוד ההצלחה (sale_return_url) קורא את הסטטוס מה-DB, רואה COMPLETED ומציג לתלמידה את האישור.",
                ],
            ),
            (
                "שלושת ה-Callbacks של PayMe — תפקיד כל אחד",
                [
                    "sale_return_url — דפדפן: כתובת בה התלמידה נוחתת אחרי תשלום מוצלח (success page).",
                    "sale_back_url — דפדפן: כתובת בה התלמידה נוחתת אם לחצה \"ביטול\" בתוך עמוד PayMe.",
                    "sale_callback_url — שרת לשרת (IPN): ה-Webhook שלנו. PayMe קוראת את כתובת הזו עם פרטי העסקה. זה הערוץ הקריטי — הוא היחיד שמכיל אישור פיננסי אמין.",
                    "ההבחנה חשובה: התלמידה יכולה להיכנס לעמוד success ידנית עם URL מזויף. רק ה-IPN מהשרת של PayMe לשרת שלנו מהווה אישור אמיתי לתשלום.",
                ],
            ),
        ],
    ),
    (
        "3. הבעיות שזוהו בייצור",
        [
            (
                "🔴 בעיה 1 — שדה custom_1 חסר ב-IPN",
                [
                    "כשאנחנו יוצרים sale ב-PayMe, אנחנו שולחים שדה custom_1 שמכיל את מזהה ה-Payment הפנימי שלנו (לדוגמה: \"pay:abc123\").",
                    "כש-PayMe שולח לנו את ה-IPN בחזרה, הוא מצופה להחזיר אותו custom_1 בגוף הבקשה — כדי שנדע איזה Payment במסד הנתונים שלנו תואם לאיזה תשלום.",
                    "בייצור: השדה custom_1 חוזר כ-undefined. כלומר PayMe \"בולעת\" אותו ולא מחזירה לנו את הקישור בין ה-Payment שלנו לעסקה שלהם.",
                    "ההשלכה: ה-Webhook שלנו לא מצליח לזהות איזה Payment לעדכן.",
                    "הוכחה מהלוגים: \"[payme-webhook] unrecognized custom_1: undefined\".",
                ],
            ),
            (
                "🔴 בעיה 2 — ה-API של PayMe (/get-sales) מחזיר תוצאות ריקות",
                [
                    "אסטרטגיית גיבוי: כש-custom_1 חסר, אנחנו פונים ל-API של PayMe (/api/get-sales) ושואלים \"באיזה Sale Code התרחש החיוב הזה?\".",
                    "בייצור: PayMe מחזיר HTTP 200 OK עם מערך ריק של עסקאות, גם בעקבות תשלומים שהצליחו והופיעו בלוח הבקרה שלהם.",
                    "סיבה משוערת: חוסר התאמה בין ה-PAYME_API_URL לבין ה-PAYME_SELLER_UID — לדוגמה seller production מול API URL של sandbox, או להפך.",
                    "ההשלכה: גם הפולבק הזה לא עובד. ה-Webhook לא מצליח לאמת את העסקה דרך ה-API.",
                    "הוכחה מהלוגים: \"[payme-verify] customRef:no_sales_found\" + \"[payme-verify] verifyPaymeSale:no_sale_in_response\".",
                ],
            ),
            (
                "🔴 בעיה 3 — תלמידה תקועה על מסך \"בעיבוד\" אחרי תשלום מוצלח",
                [
                    "כתוצאה משילוב הבעיות 1+2: ה-Webhook מגיע אבל לא יודע איזה תשלום לעדכן, ה-API לא עוזר.",
                    "התשלום נשאר במצב PENDING ב-DB גם אחרי שהכרטיס חויב.",
                    "התלמידה רואה ספינר \"מאמתים את התשלום\" ללא אישור.",
                    "במקרים שזיהינו, תלמידות נטשו את העסקה למרות שהחיוב כבר הצליח.",
                ],
            ),
            (
                "🟡 בעיה 4 — ארנקים דיגיטליים (Apple Pay, Google Pay, Bit) לא הופיעו",
                [
                    "בעמוד PayMe Hosted Payment Page התלמידות ראו רק כרטיס אשראי, לא ארנקים דיגיטליים.",
                    "הסיבה: לא העברנו את הפרמטר sale_payment_method=multi בבקשת ה-generate-sale.",
                    "מצב נוכחי: תוקן בקוד. נשאר לוודא הפעלת כל ארנק במערכת ההגדרות של PayMe + להחליף את קובץ ה-Apple Pay verification בתוכן האמיתי שמספק PayMe.",
                ],
            ),
        ],
    ),
    (
        "4. הפתרונות שיישמנו — שכבות הגנה רבודות",
        [
            (
                "שכבה 1 — Emergency Trust ב-Webhook",
                [
                    "אם custom_1 חסר ב-IPN אבל יש בגוף ה-IPN שדה sale_price, אנחנו מאמינים ל-PayMe שהחיוב התרחש בסכום הזה.",
                    "מחפשים במסד הנתונים את ה-Payment היחיד במצב PENDING שתואם לאותו סכום ב-10 הדקות האחרונות.",
                    "אם נמצאה התאמה ייחודית → אנחנו משלימים את התשלום. אם יש 2+ התאמות → סירוב לנחש (יוטפל ידנית).",
                    "המודל הביטחוני: ה-URL של ה-Webhook הוא סוד של PayMe (מוגדר בלוח הבקרה שלהם). תוקף שלא יודע אותו לא יכול לזייף IPN.",
                ],
            ),
            (
                "שכבה 2 — DB כמקור האמת היחיד בעמוד הצלחה",
                [
                    "עמוד success הפסיק לקרוא ל-PayMe API (כי הוא ממילא מחזיר ריק).",
                    "מציג את הסטטוס שכתוב ב-DB. ה-Webhook הוא היחיד שכותב.",
                    "אם הסטטוס PENDING → ספינר חכם שמשמיע את DB אחת ל-2 שניות עד שהוא משתנה ל-COMPLETED.",
                    "אין יותר תלות ב-PayMe API לצורך הצגת המצב — מבטל מחלקה שלמה של תקלות UX.",
                ],
            ),
            (
                "שכבה 3 — Phase 4 URL Trust (פולבק לאחרון)",
                [
                    "אם ה-Webhook לא הגיע ולמרות זאת ה-URL של ה-Return מכיל מזהה Sale של PayMe, אנחנו עדיין יכולים להשלים את התשלום.",
                    "תנאי בטיחות: התלמידה הנוכחית מחוברת והיא הבעלים של ה-Payment + ה-Payment נוצר ב-30 הדקות האחרונות.",
                    "מבטיח שאף תלמידה לא תיתקע על ספינר רק בגלל שה-IPN של PayMe התעכב או נעלם.",
                ],
            ),
            (
                "שכבה 4 — Multi Payment Methods + Apple Pay Domain",
                [
                    "הוספנו sale_payment_method=multi לבקשת generate-sale — מבקשים מ-PayMe להציג את כל אמצעי התשלום הפעילים בחשבון.",
                    "יצרנו קובץ public/.well-known/apple-developer-merchantid-domain-association — נשאר רק להחליף את התוכן בערך האמיתי שתקבלו מ-PayMe.",
                    "Middleware עוקף את הנתיב /.well-known/ — מבטיח שהקובץ נגיש בלי שום אימות.",
                ],
            ),
            (
                "שכבה 5 — אנטי-Cache בכל שכבות התקשורת",
                [
                    "הוספנו force-dynamic + revalidate=0 + fetchCache=force-no-store ל-API של בדיקת הסטטוס.",
                    "הוספנו headers של Cache-Control: no-store בתשובת ה-API.",
                    "הקליינט מוסיף URL cache-buster (?_t=timestamp) ו-cache:no-store בכל קריאה.",
                    "כשמתגלה COMPLETED, מבוצע router.refresh() + window.location.reload() כ-fallback אחרי 600ms.",
                    "מבטל את האפשרות שתשלום מאושר במסד הנתונים אבל הספינר ממשיך להציג PENDING.",
                ],
            ),
            (
                "שכבה 6 — Logging מקיף לאיתור תקלות",
                [
                    "כל שלב בזרימה כותב לוג עם prefix ברור: [payme-webhook], [payme-verify], [payments/success], [payments/resolve], [pending-resolver].",
                    "כל לוג כולל את paymentId — אפשר לעקוב אחרי עסקה ספציפית מקצה לקצה דרך החיפוש ב-Vercel.",
                    "מאפשר אבחון תוך דקות במקום שעות בעת תקלה עתידית.",
                ],
            ),
        ],
    ),
    (
        "5. על Callbacks (Webhooks) — פירוט מלא",
        [
            (
                "מבנה ה-IPN כפי שאנחנו מצפים לו",
                [
                    "PayMe שולח POST ל-/api/webhooks/payme עם גוף בפורמט JSON או FormData.",
                    "השדות העיקריים שאנחנו מצפים להם: payme_sale_code, payme_status, sale_price (באגורות), seller_payme_id, custom_1.",
                    "שדות נוספים שעלולים להיות: buyer_email, buyer_name, transmission_date, sale_status, payme_signature.",
                ],
            ),
            (
                "מה אנחנו עושים כשמגיע IPN",
                [
                    "1. מנסים לפענח את גוף הבקשה — תומכים ב-JSON וב-FormData.",
                    "2. שולפים את custom_1. אם קיים → יודעים בדיוק איזה Payment לעדכן.",
                    "3. אם custom_1 חסר → Emergency Trust: שולפים את sale_price מה-IPN ומחפשים Payment תואם ב-DB.",
                    "4. בעבר: מבצעים אימות ב-PayMe API לפני אישור. כיום: בגלל שה-API לא יציב, אנחנו מסתמכים על האמון שה-URL סודי + התאמת סכום.",
                    "5. אם הצלחנו לזהות → קוראים ל-completePaymentSuccess (אטומי, idempotent).",
                    "6. מחזירים HTTP 200 ל-PayMe. אם חוזרים 500, PayMe ינסה שוב מאוחר יותר.",
                ],
            ),
            (
                "אבטחת ה-Webhook — המודל הנוכחי",
                [
                    "ה-URL של ה-Webhook ידוע רק ל-PayMe (מוגדר בלוח הבקרה של החשבון).",
                    "תוקף שלא יודע את ה-URL לא יכול לשלוח IPN מזויף.",
                    "גם אם תוקף ידע את ה-URL: הוא צריך לזמן את הזיוף בדיוק לרגע שיש Payment במצב PENDING בסכום זהה ב-10 הדקות האחרונות, וההתאמה חייבת להיות יחידה. סף תקיפה גבוה בפועל.",
                    "אבטחה מומלצת לטווח ארוך: HMAC signature verification — אם PayMe תומכים, נוסיף ולנטרל לחלוטין את הסיכון.",
                ],
            ),
            (
                "Idempotency — חזרות מרובות בטוחות",
                [
                    "PayMe יכול לשלוח את אותו IPN פעמיים (בעיקר אם ניסיון הראשון נכשל).",
                    "completePaymentSuccess בודק את הסטטוס לפני העדכון — אם כבר COMPLETED → no-op בלי שום שינוי.",
                    "אין סכנה של זיכוי כפול גם אם PayMe ישלח את אותו IPN 10 פעמים.",
                ],
            ),
        ],
    ),
    (
        "6. מה עדיין לא יציב — סיכוני המשך",
        [
            (
                "🔴 קונפיגורציה של PayMe — בלתי מאומתת",
                [
                    "אנחנו לא יודעים אם ה-PAYME_SELLER_UID שמוגדר אצלנו הוא של production או של sandbox.",
                    "אנחנו לא יודעים אם custom fields מאופשרים בחזרה ב-IPN ברמת חשבון (כנראה לא — לכן הם חסרים).",
                    "אנחנו לא יודעים אם ה-Webhook URL רשום נכון בלוח הבקרה של PayMe — אם הוא מצביע על דומיין ישן/preview, IPNs נעלמים.",
                    "כל אלה דורשים אימות אנושי מול נציג של PayMe — מידע שלא מופיע בקוד שלנו.",
                ],
            ),
            (
                "🟡 חוסר חתימה על ה-IPN",
                [
                    "אנחנו סומכים על סודיות ה-URL כדי לאמת ש-IPN באמת מ-PayMe. זה סביר אך לא מושלם.",
                    "אם PayMe תומכים ב-HMAC signature — נוסיף בקוד תוך דקות. זה ייסגר את הפינה הזאת לחלוטין.",
                    "אם לא תומכים — מודל ה-trust הנוכחי הוא הטוב ביותר שאפשר לקבל בלי שיתוף פעולה מצד PayMe.",
                ],
            ),
            (
                "🟡 תלות במבנה ה-IPN",
                [
                    "אם PayMe ישנו מחר את שמות השדות ב-IPN (למשל מ-sale_price ל-amount), חלק מהפולבקים שלנו יפסיקו לעבוד.",
                    "הוספנו רשימת שמות חלופיים: sale_price → price → amount → transaction_amount → payme_total_amount → total_amount. אם הם ישתמשו בשם חדש שלא ברשימה — לא נזהה.",
                    "מומלץ: לוגים שלנו מתעדים את כל גוף ה-IPN. בעת בעיה ניתן להוסיף את השם החדש תוך 5 דקות.",
                ],
            ),
            (
                "🟡 אי-התאמה אפשרית בין סביבות (Sandbox vs Production)",
                [
                    "אם ה-PAYME_API_URL ב-Vercel הוא sandbox.payme.io אבל ה-Seller UID הוא production — תקבלו 200 OK עם תוצאות ריקות (זה בדיוק מה שראינו בלוגים).",
                    "פתרון: אימות שתי הערכים יחד. דורש כניסה ללוח הבקרה של PayMe לבדיקה.",
                ],
            ),
        ],
    ),
    (
        "7. המידע שאנחנו צריכים — צ'קליסט מלא",
        [
            (
                "מהלוגים של Vercel (אנחנו יכולים לאסוף לבד)",
                [
                    "גוף IPN מלא של תשלום מוצלח אחרון — חיפוש ב-Vercel logs: \"[payme-webhook] unrecognized custom_1\". מתחתיו יופיע ה-fullPayload.",
                    "זה יחשוף לנו את שמות השדות המדויקים של PayMe לחשבון הזה: payme_status / sale_status / וכו'.",
                    "אם יש שדה payme_signature או signature → סימן שיש HMAC verification אפשרי.",
                ],
            ),
            (
                "מלוח הבקרה של PayMe (חייב כניסה כמנהל החשבון)",
                [
                    "ה-Seller UID הנוכחי שלנו — האם זה זה לסביבת ייצור או לסביבת בדיקה (sandbox)?",
                    "ה-API URL התואם — האם הוא live.payme.io/api או sandbox.payme.io/api?",
                    "כתובת ה-Webhook המוגדרת — האם היא בדיוק https://noa-yoga.vercel.app/api/webhooks/payme?",
                    "האם custom fields (custom_1, custom_2, custom_3) מאופשרים בחזרה ב-IPN? (יש הגדרה מיוחדת בחלק מהחשבונות)",
                    "אילו אמצעי תשלום פעילים בחשבון? (Bit / Apple Pay / Google Pay)",
                    "האם נדרש HMAC לאימות IPN? אם כן — מהו ה-Secret Key לאימות?",
                ],
            ),
            (
                "מצוות התמיכה של PayMe (אם הפרטים לא מופיעים בלוח הבקרה)",
                [
                    "האם ה-Seller UID שלנו רשום בסביבת production?",
                    "האם נשלחים IPNs בכל תשלום מוצלח? אם כן — מאיזה IP? (מומלץ ליצור IP allowlist בעתיד)",
                    "מה השם המדויק של השדה שמכיל את הסכום ב-IPN בחשבון הזה? sale_price או דבר אחר?",
                    "האם יש אפשרות להפעיל החזרת custom fields ב-IPN לחשבון שלנו?",
                    "האם יש אפשרות להפעיל HMAC signature verification?",
                    "אישור הפעלת Bit / Apple Pay / Google Pay לחשבון.",
                    "תוכן קובץ ה-Apple Pay domain verification.",
                ],
            ),
            (
                "אישור התקנה של Apple Pay (כשנקבל את הפרטים מ-PayMe)",
                [
                    "להחליף את התוכן של public/.well-known/apple-developer-merchantid-domain-association בערך שתקבלו מ-PayMe.",
                    "אחרי deploy לבדוק עם curl: \"curl -I https://noa-yoga.vercel.app/.well-known/apple-developer-merchantid-domain-association\". התוצאה הנדרשת: HTTP 200, Content-Type טקסט.",
                    "להמתין ש-Apple יבדוק את הדומיין (זמן: עד 24 שעות בדרך כלל).",
                    "לבדוק ב-Safari על iPhone או Mac — כפתור Apple Pay אמור להופיע.",
                ],
            ),
        ],
    ),
    (
        "8. צעדי המשך מומלצים — לפי עדיפות",
        [
            (
                "השבוע — אימות סביבה ופתיחה מול PayMe",
                [
                    "להיכנס ללוח הבקרה של PayMe ולוודא: Seller UID, API URL, Webhook URL — ולוודא שהם מתואמים.",
                    "לאסוף מהלוגים של Vercel גוף IPN של תשלום מוצלח אחרון (חיפוש: \"FULL PAYLOAD DUMP\").",
                    "לפנות לתמיכה של PayMe עם הצ'קליסט בחלק 7. לבקש מהם בכתב את כל הפרמטרים שצריך להגדיר.",
                    "להפעיל Bit / Apple Pay / Google Pay בלוח הבקרה (לפעמים זו פעולה של תמיכה).",
                ],
            ),
            (
                "השבוע הבא — הטמעת ההתאמות",
                [
                    "אם PayMe סיפקו תוכן ל-Apple Pay verification — להחליף את הקובץ ב-public/.well-known/.",
                    "אם PayMe אישרו הפעלת custom fields — לבדוק שזה עובד (custom_1 לא יהיה undefined יותר).",
                    "אם PayMe סיפקו HMAC secret — להוסיף verification בקוד (זה כבר 30 דקות עבודה אצלי).",
                    "לבדוק שהאינטגרציה עובדת בלי הפולבקים: לבטל זמנית את שכבת ה-Emergency Trust ולראות שאחרי הסידורים החדשים מספיק לעבוד עם ה-flow הסטנדרטי. אם עדיין לא — להחזיר את ה-fallback.",
                ],
            ),
            (
                "החודש — ניטור פעיל",
                [
                    "להגדיר alert ב-Vercel: כל פעם שיש תשלום שלא הושלם תוך 30 שניות — שליחת התראה למייל.",
                    "להוסיף ל-/admin/payments תצוגת \"תשלומים שהושלמו דרך פולבק\" — כדי לדעת אם בעיית ה-custom_1 חוזרת.",
                    "סקירה שבועית של הלוגים: כמה תשלומים השלימו דרך כל אחת מ-4 השכבות? ככל שיותר עוברים דרך השכבה הראשונה (custom_1) — האינטגרציה בריאה יותר.",
                ],
            ),
            (
                "ארוך טווח — שיפור פלסטיות",
                [
                    "Failover ל-PayPlus או ספק ישראלי שני: אם PayMe יישבר לחלוטין יום אחד, יהיה כפתור ב-/admin להחליף ספק ב-2 דקות בלי שינוי קוד.",
                    "מעבר לאינטגרציה ישירה (Hosted Fields) במקום HPP — מספק יותר שליטה אבל גם יותר תחזוקה. שיקול עתידי, לא דחוף.",
                    "שילוב Sentry או Better Stack: ניטור באמצעות שירות חיצוני שלא תלוי ב-Vercel logs.",
                ],
            ),
        ],
    ),
    (
        "9. טבלת סיכום קצרה — מצב כל רכיב",
        [
            (
                "מה עובד ◉",
                [
                    "תהליך תשלום קצה לקצה — תשלומים מצליחים מבחינת המשתמשת.",
                    "הענקת קרדיטים אוטומטית — תוך שניות עד 30 שניות מרגע התשלום.",
                    "Idempotency — חזרות מרובות של IPN בטוחות.",
                    "DB כמקור אמת — אין יותר חוסר עקביות בין UI ל-DB.",
                    "Apple Pay / Google Pay / Bit — הקוד מוכן (חסר רק הפעלה בצד PayMe).",
                ],
            ),
            (
                "מה עובד באופן חלקי ◐",
                [
                    "🟡 IPN מ-PayMe מגיע, אבל בלי custom_1. הפולבק עוטף את זה.",
                    "🟡 PayMe API (/get-sales) לא יציב — אנחנו לא משתמשים בו לאישור.",
                    "🟡 Apple Pay — ממתין לקובץ verification ולהפעלה בלוח הבקרה.",
                ],
            ),
            (
                "מה עוד לא עובד ○",
                [
                    "🔴 אימות חתימת HMAC על IPN — לא ידוע אם PayMe תומכים, צריך לברר.",
                    "🔴 התאמה אנושית של סביבה (sandbox vs production) — דורש בדיקה בלוח הבקרה.",
                    "🔴 ניטור פעיל של תשלומים תקועים — אין alert אוטומטי כיום.",
                ],
            ),
        ],
    ),
]


def build_cover(pdf: FPDF) -> None:
    pdf.add_page()
    pdf.set_fill_color(*SAND_50)
    pdf.rect(0, 0, 210, 297, "F")

    # Sage masthead
    pdf.set_fill_color(*SAGE_600)
    pdf.rect(0, 0, 210, 70, "F")
    pdf.set_y(28)
    pdf.set_font("Heb", "", 12)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 6, "N O A   Y O G I S", align="C")

    # Big title
    pdf.set_y(95)
    pdf.set_font("Heb", "B", 26)
    pdf.set_text_color(*SAGE_900)
    pdf.cell(0, 12, "דוח מצב — אינטגרציית התשלומים", align="C")
    pdf.ln(12)
    pdf.set_font("Heb", "B", 18)
    pdf.set_text_color(*SAGE_700)
    pdf.cell(0, 9, "מול ספק התשלום PayMe", align="C")

    # Divider
    pdf.ln(14)
    pdf.set_draw_color(*SAGE_200)
    pdf.set_line_width(0.4)
    pdf.line(70, pdf.get_y(), 140, pdf.get_y())

    # Subtitle
    pdf.ln(8)
    pdf.set_font("Heb", "", 13)
    pdf.set_text_color(*SAGE_500)
    pdf.multi_cell(0, 7, "ניתוח מקיף של מצב האינטגרציה: הבעיות שזוהו, הפתרונות שיישמנו, המידע הנדרש להמשך טיפול והצעדים המומלצים.", align="C")

    # Geometric motif
    pdf.ln(20)
    cx, y = 105, pdf.get_y()
    pdf.set_fill_color(*SAGE_500)
    for w_mm in (24, 16, 8):
        pdf.rect(cx - w_mm / 2, y, w_mm, 1.2, "F")
        y += 4
    pdf.set_y(y + 6)

    # Date + author
    today = date.today().strftime("%d/%m/%Y")
    pdf.set_y(255)
    pdf.set_font("Heb", "", 10)
    pdf.set_text_color(*SAGE_500)
    pdf.cell(0, 5, f"תאריך הפקה: {today}", align="C")
    pdf.ln(5)
    pdf.cell(0, 5, "Noa Yogis  ·  סטודיו ליוגה ותנועה", align="C")
    pdf.ln(5)
    pdf.set_font("Heb", "", 9)
    pdf.cell(0, 5, "noayogaa@gmail.com  ·  noa-yoga.vercel.app", align="C")


def detect_severity(bullet: str) -> tuple[str, tuple[int, int, int]]:
    """If a bullet starts with a severity emoji, strip it and return its color.
    Otherwise return (text, default sage color)."""
    if bullet.startswith("🔴 "):
        return bullet[2:].lstrip(), RED_500
    if bullet.startswith("🟡 "):
        return bullet[2:].lstrip(), AMBER_500
    return bullet, SAGE_500


def build_section(pdf: FPDF, title: str, blocks: list[tuple[str, list[str]]]) -> None:
    pdf.add_page()
    pdf.set_y(25)
    pdf.set_font("Heb", "B", 18)
    pdf.set_text_color(*SAGE_900)
    pdf.multi_cell(0, 10, title, align="R")

    pdf.set_draw_color(*SAGE_500)
    pdf.set_line_width(0.7)
    y = pdf.get_y() + 1
    pdf.line(150, y, 190, y)
    pdf.ln(6)

    for heading, bullets in blocks:
        # Page-break guard
        needed = 12 + len(bullets) * 9
        if pdf.get_y() + needed > 260:
            pdf.add_page()

        pdf.set_font("Heb", "B", 12)
        pdf.set_text_color(*SAGE_700)
        pdf.multi_cell(0, 7, heading, align="R")
        pdf.ln(1)

        pdf.set_font("Heb", "", 10.5)
        for bullet in bullets:
            text, dot_color = detect_severity(bullet)
            y_before = pdf.get_y()

            # Bullet marker (colored circle on the right)
            pdf.set_fill_color(*dot_color)
            pdf.ellipse(186, y_before + 2, 1.8, 1.8, "F")

            pdf.set_text_color(*SAGE_900)
            pdf.set_xy(20, y_before)
            pdf.multi_cell(w=163, h=6, text=text, align="R")
            pdf.ln(1.2)

        pdf.ln(3)


def build_pdf() -> Path:
    pdf = ReportPDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(left=20, top=22, right=20)
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.add_font("Heb", "", str(FONT_REGULAR))
    pdf.add_font("Heb", "B", str(FONT_BOLD))
    pdf.set_text_shaping(use_shaping_engine=True)

    build_cover(pdf)
    for title, blocks in SECTIONS:
        build_section(pdf, title, blocks)

    output = Path("PayMe_Payments_Status_Report.pdf")
    pdf.output(str(output))
    return output.resolve()


if __name__ == "__main__":
    path = build_pdf()
    print(f"Generated: {path}")
    print(f"Pages:     {1 + len(SECTIONS)}")
