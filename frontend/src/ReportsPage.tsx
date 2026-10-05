import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Language } from "./i18n";
import "./ReportsPage.css";

/* =========================================================
REPORTS PAGE
Self-contained: it only reads the lists that App.tsx already
loads, so it makes no API calls of its own. Its texts live in
the TEXT table below (English / Tamil / Hindi), so i18n.ts does
not need to change.
========================================================= */

/* ---------- Minimal shapes (App.tsx's own types fit these) ---------- */

type Num = string | number | null | undefined;

type RCustomer = { id: number; name: string };
type RProject = { id: number; customer: number; name: string; budget: Num };
type RProduct = { id: number; name: string };
type RExpense = { project: number; amount: Num; date: string };
type RPayment = { project: number; amount: Num; date: string };

type RQuotationItem = {
product?: number | null;
product_name?: string | null;
qty: string | number;
rate?: string | number;
total?: Num;
};

type RQuotation = {
id: number;
date: string;
status: string;
grand_total?: Num;
items: RQuotationItem[];
};

type RInvoice = {
customer: number;
invoice_date: string;
due_date: string;
status: string;
grand_total?: Num;
paid_amount: Num;
balance_amount?: Num;
};

export type ReportsPageProps = {
  language: Language;
  customers: RCustomer[];
  projects: RProject[];
  products: RProduct[];
  expenses: RExpense[];
  payments: RPayment[];
  quotations: RQuotation[];
  invoices: RInvoice[];
};

type Period = "6" | "12" | "all";
type ProjectSort = "profit_desc" | "profit_asc" | "spend_desc";

/* ---------- Texts ---------- */

const TEXT: Record<string, Record<Language, string>> = {
  title: { en: "Reports", ta: "அறிக்கைகள்", hi: "रिपोर्ट" },
  subtitle: {
    en: "Revenue, dues, quotations, projects and products in one place",
    ta: "வருவாய், நிலுவை, மேற்கோள்கள், திட்டங்கள், பொருட்கள் — ஒரே இடத்தில்",
    hi: "आय, बकाया, कोटेशन, प्रोजेक्ट और उत्पाद — एक जगह",
  },
  period: { en: "Period", ta: "காலம்", hi: "अवधि" },
  last_6: { en: "Last 6 months", ta: "கடந்த 6 மாதங்கள்", hi: "पिछले 6 महीने" },
  last_12: { en: "Last 12 months", ta: "கடந்த 12 மாதங்கள்", hi: "पिछले 12 महीने" },
  all_time: { en: "All time", ta: "எல்லா காலமும்", hi: "सभी समय" },

  kpi_invoiced: { en: "Invoiced", ta: "விலைப்பட்டியல் தொகை", hi: "इनवॉइस राशि" },
  kpi_collected: { en: "Collected", ta: "வசூலானது", hi: "वसूली" },
  kpi_outstanding: { en: "Still owed", ta: "நிலுவைத் தொகை", hi: "बकाया राशि" },
  kpi_win_rate: { en: "Quotation win rate", ta: "மேற்கோள் வெற்றி விகிதம்", hi: "कोटेशन जीत दर" },
  overdue_amount: { en: "{amt} overdue", ta: "{amt} காலதாமதம்", hi: "{amt} अतिदेय" },
  none_overdue: { en: "Nothing overdue", ta: "காலதாமதம் இல்லை", hi: "कुछ भी अतिदेय नहीं" },
  accepted_of: {
    en: "{a} accepted of {d} decided",
    ta: "{d}-இல் {a} ஏற்கப்பட்டது",
    hi: "{d} में से {a} स्वीकृत",
  },
  no_decided: {
    en: "No decided quotations yet",
    ta: "இன்னும் முடிவான மேற்கோள்கள் இல்லை",
    hi: "अभी कोई निर्णय वाला कोटेशन नहीं",
  },
  in_period: { en: "In this period", ta: "இந்த காலத்தில்", hi: "इस अवधि में" },

  monthly_title: { en: "Monthly revenue", ta: "மாதாந்திர வருவாய்", hi: "मासिक आय" },
  monthly_sub: {
    en: "Invoiced (sent and paid invoices) against collected (recorded payments)",
    ta: "விலைப்பட்டியல் (அனுப்பியவை, செலுத்தியவை) மற்றும் வசூல் (பதிவான கட்டணங்கள்)",
    hi: "इनवॉइस (भेजे और चुकाए गए) बनाम वसूली (दर्ज भुगतान)",
  },
  monthly_empty: {
    en: "No invoices or payments in this period yet.",
    ta: "இந்த காலத்தில் விலைப்பட்டியல் அல்லது கட்டணம் இன்னும் இல்லை.",
    hi: "इस अवधि में अभी कोई इनवॉइस या भुगतान नहीं है।",
  },

  owed_title: { en: "Money still owed", ta: "இன்னும் வர வேண்டிய தொகை", hi: "अभी बकाया रकम" },
  owed_sub: {
    en: "Sent invoices with a balance, as of today",
    ta: "நிலுவை உள்ள அனுப்பிய விலைப்பட்டியல்கள், இன்றைய நிலவரம்",
    hi: "बकाया वाले भेजे गए इनवॉइस, आज तक",
  },
  owed_empty: {
    en: "Nothing is owed. Every sent invoice is paid.",
    ta: "நிலுவை எதுவும் இல்லை. அனுப்பிய எல்லா விலைப்பட்டியல்களும் செலுத்தப்பட்டன.",
    hi: "कुछ भी बकाया नहीं है। भेजे गए सभी इनवॉइस चुकाए जा चुके हैं।",
  },
  aging_current: { en: "Not due yet", ta: "இன்னும் காலக்கெடு வரவில்லை", hi: "अभी देय नहीं" },
  aging_30: { en: "1–30 days late", ta: "1–30 நாள் தாமதம்", hi: "1–30 दिन देरी" },
  aging_60: { en: "31–60 days late", ta: "31–60 நாள் தாமதம்", hi: "31–60 दिन देरी" },
  aging_60p: { en: "Over 60 days late", ta: "60 நாட்களுக்கு மேல் தாமதம்", hi: "60 दिन से ज़्यादा देरी" },
  col_customer: { en: "Customer", ta: "வாடிக்கையாளர்", hi: "ग्राहक" },
  col_invoices: { en: "Invoices", ta: "விலைப்பட்டியல்கள்", hi: "इनवॉइस" },
  col_owed: { en: "Owed", ta: "நிலுவை", hi: "बकाया" },
  col_overdue: { en: "Overdue", ta: "காலதாமதம்", hi: "अतिदेय" },
  col_days_late: { en: "Days late", ta: "தாமத நாட்கள்", hi: "देरी (दिन)" },
  show_all: { en: "Show all ({n})", ta: "அனைத்தையும் காட்டு ({n})", hi: "सभी दिखाएँ ({n})" },
  show_less: { en: "Show less", ta: "குறைவாகக் காட்டு", hi: "कम दिखाएँ" },

  quo_title: { en: "Quotation results", ta: "மேற்கோள் முடிவுகள்", hi: "कोटेशन परिणाम" },
  quo_sub: {
    en: "Quotations dated in this period",
    ta: "இந்த காலத்தில் தேதியிட்ட மேற்கோள்கள்",
    hi: "इस अवधि की तारीख़ वाले कोटेशन",
  },
  q_accepted: { en: "Accepted", ta: "ஏற்கப்பட்டது", hi: "स्वीकृत" },
  q_sent: { en: "Sent", ta: "அனுப்பப்பட்டது", hi: "भेजा गया" },
  q_draft: { en: "Draft", ta: "வரைவு", hi: "ड्राफ्ट" },
  q_rejected: { en: "Rejected", ta: "நிராகரிக்கப்பட்டது", hi: "अस्वीकृत" },
  quo_won_value: { en: "Value won", ta: "வென்ற மதிப்பு", hi: "जीती गई राशि" },
  quo_open_value: { en: "Value still open", ta: "இன்னும் திறந்துள்ள மதிப்பு", hi: "अभी खुली राशि" },
  quo_empty: {
    en: "No quotations in this period.",
    ta: "இந்த காலத்தில் மேற்கோள்கள் இல்லை.",
    hi: "इस अवधि में कोई कोटेशन नहीं।",
  },

  proj_title: {
    en: "Payments vs expenses by project",
    ta: "திட்டப்படி கட்டணம் மற்றும் செலவு",
    hi: "प्रोजेक्ट अनुसार भुगतान बनाम खर्च",
  },
  proj_sub: {
    en: "Whole life of each project. The period filter does not apply here.",
    ta: "ஒவ்வொரு திட்டத்தின் முழு காலம். காலத் தேர்வு இதற்குப் பொருந்தாது.",
    hi: "हर प्रोजेक्ट की पूरी अवधि। अवधि फ़िल्टर यहाँ लागू नहीं होता।",
  },
  sort_by: { en: "Sort by", ta: "வரிசைப்படுத்து", hi: "क्रमबद्ध करें" },
  sort_profit_desc: { en: "Highest profit", ta: "அதிக லாபம்", hi: "सबसे ज़्यादा मुनाफ़ा" },
  sort_profit_asc: { en: "Lowest profit", ta: "குறைந்த லாபம்", hi: "सबसे कम मुनाफ़ा" },
  sort_spend_desc: { en: "Highest spending", ta: "அதிக செலவு", hi: "सबसे ज़्यादा खर्च" },
  col_project: { en: "Project", ta: "திட்டம்", hi: "प्रोजेक्ट" },
  col_budget: { en: "Budget", ta: "பட்ஜெட்", hi: "बजट" },
  col_received: { en: "Received", ta: "பெற்றது", hi: "प्राप्त" },
  col_spent: { en: "Spent", ta: "செலவு", hi: "खर्च" },
  col_profit: { en: "Profit", ta: "லாபம்", hi: "मुनाफ़ा" },
  proj_empty: {
    en: "No payments or expenses are recorded on any project yet.",
    ta: "எந்த திட்டத்திலும் கட்டணம் அல்லது செலவு இன்னும் பதிவாகவில்லை.",
    hi: "किसी भी प्रोजेक्ट पर अभी कोई भुगतान या खर्च दर्ज नहीं है।",
  },

  prod_title: {
    en: "Best-selling products",
    ta: "அதிகம் விற்கும் பொருட்கள்",
    hi: "सबसे ज़्यादा बिकने वाले उत्पाद",
  },
  prod_sub: {
    en: "From accepted quotations in this period",
    ta: "இந்த காலத்தில் ஏற்கப்பட்ட மேற்கோள்களிலிருந்து",
    hi: "इस अवधि के स्वीकृत कोटेशन से",
  },
  col_product: { en: "Product", ta: "பொருள்", hi: "उत्पाद" },
  col_qty: { en: "Qty", ta: "எண்ணிக்கை", hi: "मात्रा" },
  col_revenue: { en: "Revenue", ta: "வருவாய்", hi: "आय" },
  col_quotes: { en: "Quotations", ta: "மேற்கோள்கள்", hi: "कोटेशन" },
  prod_empty: {
    en: "No accepted quotations with linked products in this period. Pick a product on quotation items to see it here.",
    ta: "இந்த காலத்தில் பொருள் இணைக்கப்பட்ட ஏற்கப்பட்ட மேற்கோள்கள் இல்லை. மேற்கோள் பொருட்களில் ஒரு பொருளைத் தேர்ந்தெடுத்தால் இங்கே தெரியும்.",
    hi: "इस अवधि में उत्पाद से जुड़े स्वीकृत कोटेशन नहीं हैं। कोटेशन आइटम में उत्पाद चुनें, तब वह यहाँ दिखेगा।",
  },
  prod_unlinked: {
    en: "{n} accepted items have no product linked, so they are not counted here.",
    ta: "ஏற்கப்பட்ட {n} உருப்படிகளில் பொருள் இணைக்கப்படவில்லை, அதனால் இங்கே கணக்கில் இல்லை.",
    hi: "स्वीकृत {n} आइटम में उत्पाद जुड़ा नहीं है, इसलिए यहाँ गिने नहीं गए।",
  },
  unknown: { en: "Unknown", ta: "தெரியவில்லை", hi: "अज्ञात" },
};

// Only used for month names in the chart (numbers always use en-IN grouping).
const LOCALES: Record<Language, string> = {
  en: "en",
  ta: "ta-IN",
  hi: "hi-IN",
};

/* ---------- Helpers ---------- */

const num = (value: Num): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const inr = (value: number) => "₹" + Math.round(value).toLocaleString("en-IN");

/** 125000 -> "₹1.3L", 25000000 -> "₹2.5Cr" (Indian style for chart labels). */
const compactInr = (value: number) => {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (value >= 1e7) return "₹" + trim(value / 1e7) + "Cr";
  if (value >= 1e5) return "₹" + trim(value / 1e5) + "L";
  if (value >= 1e3) return "₹" + trim(value / 1e3) + "K";
  return "₹" + Math.round(value);
};

/** "2026-06-29" -> "2026-06". Anything else -> "". */
const monthKey = (date?: string | null) =>
  date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "";

const keyOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const addMonths = (key: string, count: number) => {
  const [year, month] = key.split("-").map(Number);
  return keyOf(new Date(year, month - 1 + count, 1));
};

const inRange = (
  date: string | null | undefined,
  range: { startKey: string; endKey: string }
) => {
  const key = monthKey(date);
  return key !== "" && key >= range.startKey && key <= range.endKey;
};

/** Rounds a chart maximum up to a tidy number (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 x 10^n). */
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const step of steps) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDay = (date?: string | null): Date | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

/* ---------- Small building block ---------- */

function Card({
  title,
  subtitle,
  className,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`rp-card${className ? " " + className : ""}`}>
      <div className="rp-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* =========================================================
  COMPONENT
========================================================= */

export default function ReportsPage({
  language,
  customers,
  projects,
  products,
  expenses,
  payments,
  quotations,
  invoices,
}: ReportsPageProps) {
  const [period, setPeriod] = useState<Period>("6");
  const [projectSort, setProjectSort] = useState<ProjectSort>("profit_desc");
  const [showAllOwed, setShowAllOwed] = useState(false);

  const tr = (key: string, vars?: Record<string, string | number>) => {
    let text = TEXT[key]?.[language] ?? TEXT[key]?.en ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  };

  const locale = LOCALES[language];

  const customerName = useMemo(() => {
    const map = new Map<number, string>();
    customers.forEach((customer) => map.set(customer.id, customer.name));
    return map;
  }, [customers]);

  /* ---------- Period -> list of months ---------- */

  const range = useMemo(() => {
    const nowKey = keyOf(new Date());
    let startKey = nowKey;
    let endKey = nowKey;

    if (period === "6") {
      startKey = addMonths(nowKey, -5);
    } else if (period === "12") {
      startKey = addMonths(nowKey, -11);
    } else {
      const keys: string[] = [];
      invoices.forEach((item) => keys.push(monthKey(item.invoice_date)));
      payments.forEach((item) => keys.push(monthKey(item.date)));
      quotations.forEach((item) => keys.push(monthKey(item.date)));
      const valid = keys.filter(Boolean).sort();

      if (valid.length > 0) {
        if (valid[0] < startKey) startKey = valid[0];
        if (valid[valid.length - 1] > endKey) endKey = valid[valid.length - 1];
      }
    }

    const months: string[] = [];
    for (let key = startKey; key <= endKey; key = addMonths(key, 1)) {
      months.push(key);
      if (months.length > 240) break; // safety net for wrong dates
    }

    return { startKey, endKey, months };
  }, [period, invoices, payments, quotations]);

  /* ---------- Monthly revenue ---------- */

  const monthly = useMemo(() => {
    const rows = range.months.map((key) => ({
      key,
      invoiced: 0,
      collected: 0,
    }));
    const byKey = new Map(rows.map((row) => [row.key, row]));

    invoices.forEach((invoice) => {
      if (invoice.status !== "sent" && invoice.status !== "paid") return;
      const row = byKey.get(monthKey(invoice.invoice_date));
      if (row) row.invoiced += num(invoice.grand_total);
    });

    payments.forEach((payment) => {
      const row = byKey.get(monthKey(payment.date));
      if (row) row.collected += num(payment.amount);
    });

    return rows;
  }, [range, invoices, payments]);

  const totalInvoiced = monthly.reduce((sum, row) => sum + row.invoiced, 0);
  const totalCollected = monthly.reduce((sum, row) => sum + row.collected, 0);
  const chartMax = niceMax(
    Math.max(1, ...monthly.map((row) => Math.max(row.invoiced, row.collected)))
  );

  /* ---------- Money still owed (as of today) ---------- */

  const owed = useMemo(() => {
    const todayDate = new Date();
    const today = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate()
    ).getTime();

    const buckets = { current: 0, late30: 0, late60: 0, late60p: 0 };
    const byCustomer = new Map<
      number,
      {
        customerId: number;
        invoices: number;
        owed: number;
        overdue: number;
        maxDaysLate: number;
      }
    >();

    invoices.forEach((invoice) => {
      if (invoice.status !== "sent") return;

      const hasBalance =
        invoice.balance_amount !== undefined &&
        invoice.balance_amount !== null &&
        invoice.balance_amount !== "";

      const balance = hasBalance
        ? num(invoice.balance_amount)
        : num(invoice.grand_total) - num(invoice.paid_amount);

      if (balance <= 0.005) return;

      const due = parseDay(invoice.due_date);
      const daysLate = due ? Math.floor((today - due.getTime()) / DAY_MS) : 0;

      if (daysLate <= 0) buckets.current += balance;
      else if (daysLate <= 30) buckets.late30 += balance;
      else if (daysLate <= 60) buckets.late60 += balance;
      else buckets.late60p += balance;

      const row = byCustomer.get(invoice.customer) ?? {
        customerId: invoice.customer,
        invoices: 0,
        owed: 0,
        overdue: 0,
        maxDaysLate: 0,
      };

      row.invoices += 1;
      row.owed += balance;
      if (daysLate > 0) {
        row.overdue += balance;
        row.maxDaysLate = Math.max(row.maxDaysLate, daysLate);
      }
      byCustomer.set(invoice.customer, row);
    });

    const rows = Array.from(byCustomer.values()).sort(
      (a, b) => b.owed - a.owed
    );

    return {
      rows,
      buckets,
      total:
        buckets.current + buckets.late30 + buckets.late60 + buckets.late60p,
      overdueTotal: buckets.late30 + buckets.late60 + buckets.late60p,
    };
  }, [invoices]);

  const owedRows = showAllOwed ? owed.rows : owed.rows.slice(0, 8);

  /* ---------- Quotation results ---------- */

  const quoteStats = useMemo(() => {
    const inPeriod = quotations.filter((quote) => inRange(quote.date, range));
    const count = { accepted: 0, sent: 0, draft: 0, rejected: 0 };
    let wonValue = 0;
    let openValue = 0;

    inPeriod.forEach((quote) => {
      const value = num(quote.grand_total);
      if (quote.status === "accepted") {
        count.accepted += 1;
        wonValue += value;
      } else if (quote.status === "rejected") {
        count.rejected += 1;
      } else if (quote.status === "sent") {
        count.sent += 1;
        openValue += value;
      } else {
        count.draft += 1;
        openValue += value;
      }
    });

    const decided = count.accepted + count.rejected;

    return {
      total: inPeriod.length,
      count,
      wonValue,
      openValue,
      decided,
      winRate: decided > 0 ? (count.accepted / decided) * 100 : null,
    };
  }, [quotations, range]);

  /* ---------- Projects: money in vs money out ---------- */

  const projectRows = useMemo(() => {
    const received = new Map<number, number>();
    const spent = new Map<number, number>();

    payments.forEach((payment) =>
      received.set(
        payment.project,
        (received.get(payment.project) ?? 0) + num(payment.amount)
      )
    );
    expenses.forEach((expense) =>
      spent.set(
        expense.project,
        (spent.get(expense.project) ?? 0) + num(expense.amount)
      )
    );

    const rows = projects
      .map((project) => {
        const rec = received.get(project.id) ?? 0;
        const spt = spent.get(project.id) ?? 0;
        return {
          id: project.id,
          name: project.name,
          customer: customerName.get(project.customer) ?? "",
          budget: num(project.budget),
          received: rec,
          spent: spt,
          profit: rec - spt,
        };
      })
      .filter((row) => row.received > 0 || row.spent > 0);

    rows.sort((a, b) => {
      if (projectSort === "profit_asc") return a.profit - b.profit;
      if (projectSort === "spend_desc") return b.spent - a.spent;
      return b.profit - a.profit;
    });

    return rows;
  }, [projects, payments, expenses, customerName, projectSort]);

  const projectBarMax = Math.max(
    1,
    ...projectRows.map((row) => Math.max(row.received, row.spent))
  );

  /* ---------- Best-selling products (accepted quotations) ---------- */

  const productStats = useMemo(() => {
    const nameById = new Map<number, string>();
    products.forEach((product) => nameById.set(product.id, product.name));

    const byProduct = new Map<
      number,
      { id: number; name: string; qty: number; revenue: number; quotes: Set<number> }
    >();
    let unlinked = 0;

    quotations.forEach((quote) => {
      if (quote.status !== "accepted" || !inRange(quote.date, range)) return;

      (quote.items ?? []).forEach((item) => {
        if (item.product === null || item.product === undefined) {
          unlinked += 1;
          return;
        }

        const qty = num(item.qty);
        const hasTotal =
          item.total !== undefined && item.total !== null && item.total !== "";
        const revenue = hasTotal ? num(item.total) : qty * num(item.rate);

        const row = byProduct.get(item.product) ?? {
          id: item.product,
          name:
            item.product_name ||
            nameById.get(item.product) ||
            `#${item.product}`,
          qty: 0,
          revenue: 0,
          quotes: new Set<number>(),
        };

        row.qty += qty;
        row.revenue += revenue;
        row.quotes.add(quote.id);
        byProduct.set(item.product, row);
      });
    });

    const rows = Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return {
      rows,
      unlinked,
      maxRevenue: Math.max(1, ...rows.map((row) => row.revenue)),
    };
  }, [quotations, products, range]);

  /* ---------- Render ---------- */

  const dense = monthly.length > 12;
  const chartHasData = monthly.some((row) => row.invoiced > 0 || row.collected > 0);

  const quoteSegments: { key: keyof typeof quoteStats.count; label: string }[] = [
    { key: "accepted", label: tr("q_accepted") },
    { key: "sent", label: tr("q_sent") },
    { key: "draft", label: tr("q_draft") },
    { key: "rejected", label: tr("q_rejected") },
  ];

  const agingSegments = [
    { cls: "rp-seg-current", label: tr("aging_current"), value: owed.buckets.current },
    { cls: "rp-seg-30", label: tr("aging_30"), value: owed.buckets.late30 },
    { cls: "rp-seg-60", label: tr("aging_60"), value: owed.buckets.late60 },
    { cls: "rp-seg-60p", label: tr("aging_60p"), value: owed.buckets.late60p },
  ];

  return (
    <section className="content rp-page">
      <div className="customers-header">
        <div>
          <h2>{tr("title")}</h2>
          <p>{tr("subtitle")}</p>
        </div>

        <label className="rp-control">
          <span>{tr("period")}</span>
          <select
            className="project-filter-select"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            <option value="6">{tr("last_6")}</option>
            <option value="12">{tr("last_12")}</option>
            <option value="all">{tr("all_time")}</option>
          </select>
        </label>
      </div>

      {/* Headline numbers */}
      <div className="rp-kpis">
        <div className="rp-kpi">
          <span>{tr("kpi_invoiced")}</span>
          <strong>{inr(totalInvoiced)}</strong>
          <small>{tr("in_period")}</small>
        </div>

        <div className="rp-kpi">
          <span>{tr("kpi_collected")}</span>
          <strong>{inr(totalCollected)}</strong>
          <small>{tr("in_period")}</small>
        </div>

        <div className="rp-kpi">
          <span>{tr("kpi_outstanding")}</span>
          <strong>{inr(owed.total)}</strong>
          <small className={owed.overdueTotal > 0 ? "rp-warn" : ""}>
            {owed.overdueTotal > 0
              ? tr("overdue_amount", { amt: inr(owed.overdueTotal) })
              : tr("none_overdue")}
          </small>
        </div>

        <div className="rp-kpi">
          <span>{tr("kpi_win_rate")}</span>
          <strong>
            {quoteStats.winRate === null
              ? "–"
              : `${Math.round(quoteStats.winRate)}%`}
          </strong>
          <small>
            {quoteStats.decided > 0
              ? tr("accepted_of", {
                  a: quoteStats.count.accepted,
                  d: quoteStats.decided,
                })
              : tr("no_decided")}
          </small>
        </div>
      </div>

      {/* Monthly revenue */}
      <Card
        title={tr("monthly_title")}
        subtitle={tr("monthly_sub")}
        actions={
          !chartHasData ? undefined : (
          <div className="rp-legend">
            <span>
              <i className="rp-dot rp-dot-invoiced" />
              {tr("kpi_invoiced")}
            </span>
            <span>
              <i className="rp-dot rp-dot-collected" />
              {tr("kpi_collected")}
            </span>
          </div>
          )
        }
      >
        {!chartHasData ? (
          <p className="rp-empty">{tr("monthly_empty")}</p>
        ) : (
          <div className="rp-chart">
            <div className="rp-axis" aria-hidden="true">
              <span>{compactInr(chartMax)}</span>
              <span>{compactInr(chartMax / 2)}</span>
              <span>₹0</span>
            </div>

            <div className="rp-plot">
              <div
                className={`rp-cols${dense ? " rp-dense" : ""}`}
                style={{ minWidth: monthly.length * 84 }}
              >
                {monthly.map((row, index) => {
                  const [year, month] = row.key.split("-").map(Number);
                  const label = new Date(year, month - 1, 1).toLocaleString(
                    locale,
                    { month: "short" }
                  );
                  const showYear = index === 0 || month === 1;

                  return (
                    <div
                      className="rp-col"
                      key={row.key}
                      role="img"
                      aria-label={`${label} ${year}: ${tr("kpi_invoiced")} ${inr(
                        row.invoiced
                      )}, ${tr("kpi_collected")} ${inr(row.collected)}`}
                    >
                      <div className="rp-bars">
                        <div className="rp-bar-wrap" title={inr(row.invoiced)}>
                          <span className="rp-val">
                            {row.invoiced > 0 ? compactInr(row.invoiced) : ""}
                          </span>
                          <div
                            className="rp-bar rp-bar-invoiced"
                            style={{
                              height: `calc((100% - 16px) * ${
                                row.invoiced / chartMax
                              })`,
                            }}
                          />
                        </div>

                        <div className="rp-bar-wrap" title={inr(row.collected)}>
                          <span className="rp-val">
                            {row.collected > 0 ? compactInr(row.collected) : ""}
                          </span>
                          <div
                            className="rp-bar rp-bar-collected"
                            style={{
                              height: `calc((100% - 16px) * ${
                                row.collected / chartMax
                              })`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="rp-col-label">
                        <span>{label}</span>
                        {showYear && <small>{year}</small>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Owed + quotations */}
      <div className="rp-two">
        <Card title={tr("owed_title")} subtitle={tr("owed_sub")}>
          {owed.rows.length === 0 ? (
            <p className="rp-empty">{tr("owed_empty")}</p>
          ) : (
            <>
              <div className="rp-stack" aria-hidden="true">
                {agingSegments.map((segment) =>
                  segment.value > 0 ? (
                    <div
                      key={segment.cls}
                      className={segment.cls}
                      style={{ flexGrow: segment.value }}
                      title={`${segment.label}: ${inr(segment.value)}`}
                    />
                  ) : null
                )}
              </div>

              <ul className="rp-key">
                {agingSegments.map((segment) => (
                  <li key={segment.cls}>
                    <i className={`rp-dot ${segment.cls}`} />
                    <span>{segment.label}</span>
                    <strong>{inr(segment.value)}</strong>
                  </li>
                ))}
              </ul>

              <div className="rp-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("col_customer")}</th>
                      <th className="rp-num">{tr("col_invoices")}</th>
                      <th className="rp-num">{tr("col_owed")}</th>
                      <th className="rp-num">{tr("col_overdue")}</th>
                      <th className="rp-num">{tr("col_days_late")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owedRows.map((row) => (
                      <tr key={row.customerId}>
                        <td>
                          <strong>
                            {customerName.get(row.customerId) ?? tr("unknown")}
                          </strong>
                        </td>
                        <td className="rp-num">{row.invoices}</td>
                        <td className="rp-num">{inr(row.owed)}</td>
                        <td
                          className={`rp-num${row.overdue > 0 ? " rp-warn" : ""}`}
                        >
                          {row.overdue > 0 ? inr(row.overdue) : "–"}
                        </td>
                        <td className="rp-num">
                          {row.maxDaysLate > 0 ? row.maxDaysLate : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {owed.rows.length > 8 && (
                <button
                  type="button"
                  className="rp-link-btn"
                  onClick={() => setShowAllOwed((value) => !value)}
                >
                  {showAllOwed
                    ? tr("show_less")
                    : tr("show_all", { n: owed.rows.length })}
                </button>
              )}
            </>
          )}
        </Card>

        <Card title={tr("quo_title")} subtitle={tr("quo_sub")}>
          {quoteStats.total === 0 ? (
            <p className="rp-empty">{tr("quo_empty")}</p>
          ) : (
            <>
              <div className="rp-stack" aria-hidden="true">
                {quoteSegments.map((segment) =>
                  quoteStats.count[segment.key] > 0 ? (
                    <div
                      key={segment.key}
                      className={`rp-seg-q-${segment.key}`}
                      style={{ flexGrow: quoteStats.count[segment.key] }}
                      title={`${segment.label}: ${quoteStats.count[segment.key]}`}
                    />
                  ) : null
                )}
              </div>

              <ul className="rp-key">
                {quoteSegments.map((segment) => (
                  <li key={segment.key}>
                    <i className={`rp-dot rp-seg-q-${segment.key}`} />
                    <span>{segment.label}</span>
                    <strong>{quoteStats.count[segment.key]}</strong>
                  </li>
                ))}
              </ul>

              <div className="rp-pair">
                <div>
                  <span>{tr("quo_won_value")}</span>
                  <strong>{inr(quoteStats.wonValue)}</strong>
                </div>
                <div>
                  <span>{tr("quo_open_value")}</span>
                  <strong>{inr(quoteStats.openValue)}</strong>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Projects */}
      <Card
        title={tr("proj_title")}
        subtitle={tr("proj_sub")}
        actions={
          <label className="rp-control">
            <span>{tr("sort_by")}</span>
            <select
              className="project-filter-select"
              value={projectSort}
              onChange={(event) =>
                setProjectSort(event.target.value as ProjectSort)
              }
            >
              <option value="profit_desc">{tr("sort_profit_desc")}</option>
              <option value="profit_asc">{tr("sort_profit_asc")}</option>
              <option value="spend_desc">{tr("sort_spend_desc")}</option>
            </select>
          </label>
        }
      >
        {projectRows.length === 0 ? (
          <p className="rp-empty">{tr("proj_empty")}</p>
        ) : (
          <div className="rp-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("col_project")}</th>
                  <th className="rp-num">{tr("col_budget")}</th>
                  <th>{tr("col_received")}</th>
                  <th>{tr("col_spent")}</th>
                  <th className="rp-num">{tr("col_profit")}</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {row.customer && (
                        <span className="rp-sub">{row.customer}</span>
                      )}
                    </td>
                    <td className="rp-num">
                      {row.budget > 0 ? inr(row.budget) : "–"}
                    </td>
                    <td className="rp-meter-cell">
                      <span>{inr(row.received)}</span>
                      <div className="rp-meter">
                        <i
                          className="rp-meter-in"
                          style={{
                            width: `${(row.received / projectBarMax) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="rp-meter-cell">
                      <span>{inr(row.spent)}</span>
                      <div className="rp-meter">
                        <i
                          className="rp-meter-out"
                          style={{
                            width: `${(row.spent / projectBarMax) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td
                      className={`rp-num ${
                        row.profit >= 0 ? "rp-good" : "rp-bad"
                      }`}
                    >
                      <strong>
                        {row.profit < 0 ? "−" : ""}
                        {inr(Math.abs(row.profit))}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Products */}
      <Card title={tr("prod_title")} subtitle={tr("prod_sub")}>
        {productStats.rows.length === 0 ? (
          <p className="rp-empty">{tr("prod_empty")}</p>
        ) : (
          <div className="rp-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("col_product")}</th>
                  <th className="rp-num">{tr("col_qty")}</th>
                  <th className="rp-num">{tr("col_quotes")}</th>
                  <th>{tr("col_revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {productStats.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td className="rp-num">
                      {row.qty.toLocaleString("en-IN")}
                    </td>
                    <td className="rp-num">{row.quotes.size}</td>
                    <td className="rp-meter-cell">
                      <span>{inr(row.revenue)}</span>
                      <div className="rp-meter">
                        <i
                          className="rp-meter-gold"
                          style={{
                            width: `${
                              (row.revenue / productStats.maxRevenue) * 100
                            }%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {productStats.unlinked > 0 && (
          <p className="rp-note">
            {tr("prod_unlinked", { n: productStats.unlinked })}
          </p>
        )}
      </Card>
    </section>
  );
}