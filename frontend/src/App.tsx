import { useEffect, useState, Fragment } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import logo from "./assets/logo.png";
import "./App.css";
import { TRANSLATIONS } from "./i18n";
import type { Language } from "./i18n";
import ReportsPage from "./ReportsPage";
import { API_BASE_URL } from "./Api";
import {
  MONTH_NAMES,
  capitalize,
  escapeHtml,
  nextDocumentNo,
  parseDate,
  round2,
  todayIso,
} from "./utils";
// [Settings] company settings page + the helpers that print them on PDFs
import SettingsPage from "./SettingsPage";
// [Admin] account/backup/system page, opened from the sidebar badge
import AdminPage from "./AdminPage";
import {
  COMPANY_PRINT_CSS,
  DEFAULT_INVOICE_TERMS,
  DEFAULT_QUOTATION_TERMS,
  bankBlockHtml,
  companyFooterHtml,
  companyStripHtml,
  letterheadBandStyle,
  loadCompanySettings,
  saveCompanySettings,
  signatureBlockHtml,
} from "./settingsStore";
import type { CompanySettings } from "./settingsStore";

/* =========================================================
  TYPES
========================================================= */

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  status: "active" | "completed";
  created_at?: string;
  updated_at?: string;
};

type Project = {
  id: number;
  customer: number;
  name: string;
  budget: string | number;
  site_address: string;
  city: string;
  state: string;
  pincode: string;
  status: "new" | "in_progress" | "completed" | "cancelled";
  notes: string;
  created_at?: string;
  updated_at?: string;
};
type Product = {
  id: number;
  name: string;
  code: string;
  category: string;
  description: string;
  unit: string;
  rate: string | number;
  image: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type Expense = {
  id: number;
  project: number;
  title: string;
  category: string;
  amount: string | number;
  notes: string;
  date: string;
};
type Payment = {
  id: number;
  project: number;
  title: string;
  amount: string | number;
  mode: string;
  notes: string;
  date: string;
};
type QuotationItem = {
  id?: number;
  category: string;
  width: string;
  height: string;
  qty: string;
  area?: string | number | null;
  rate: string;
  total?: string | number;
  order?: number;
  // Optional catalogue link — image/name come back from the API.
  product?: number | null;
  product_name?: string | null;
  product_image?: string | null;
};

type Quotation = {
  id: number;
  customer: number;
  project: number | null;
  quotation_no: string;
  date: string;
  subject: string;
  phone: string;
  gst_percent: string | number;
  status: "draft" | "sent" | "accepted" | "rejected";
  terms: string;
  items: QuotationItem[];
  subtotal?: string | number;
  gst_amount?: string | number;
  grand_total?: string | number;
  created_at?: string;
  updated_at?: string;
};

type InvoiceItem = {
  id?: number;
  description: string;
  // Only used while editing: a line priced by area (windows, doors ...) has
  // its measurements here and `quantity` is then the piece count. See
  // "Invoice lines priced by area" below for how it is saved.
  width?: string;
  height?: string;
  quantity: string;
  unit: string;
  rate: string;
  amount?: string | number;
  order?: number;
  product?: number | null;
  product_name?: string | null;
  product_image?: string | null;
};

type Invoice = {
  id: number;
  customer: number;
  project: number | null;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  gst_percent: string | number;
  discount: string | number;
  paid_amount: string | number;
  status: "draft" | "sent" | "paid" | "cancelled";
  terms: string;
  items: InvoiceItem[];
  subtotal?: string | number;
  gst_amount?: string | number;
  grand_total?: string | number;
  balance_amount?: string | number;
  created_at?: string;
  updated_at?: string;
};

type InvoicePaymentRow = {
  date: string;
  amount: number;
};

type Page =
  | "dashboard"
  | "customers"
  | "projects"
  | "create-project"
  | "edit-project"
  | "project-details"
  | "client-profile"
  | "quotations"
  | "create-quotation"
  | "edit-quotation"
  | "quotation-details"
  | "quotation-clients"
  | "invoices"
  | "create-invoice"
  | "edit-invoice"
  | "invoice-details"
  | "payments"
  | "spend"
  | "products"
  | "reports"
  | "settings" // [Settings]
  | "admin"; // [Admin]
/* =========================================================
  API
========================================================= */

const API_URL = `${API_BASE_URL}/customers/`;
const PROJECT_API_URL = `${API_BASE_URL}/projects/`;
const EXPENSE_API_URL = `${API_BASE_URL}/expenses/`;
const PAYMENT_API_URL = `${API_BASE_URL}/payments/`;
const QUOTATION_API_URL = `${API_BASE_URL}/quotations/`;
const INVOICE_API_URL = `${API_BASE_URL}/invoices/`;
const PRODUCT_API_URL = `${API_BASE_URL}/products/`;

/* =========================================================
  SHARED HELPERS
========================================================= */

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET + parse JSON with a single, consistent error message. */
const fetchJson = async <T,>(url: string, label: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${label} (${response.status})`);
  }

  return (await response.json()) as T;
};

/** POST/PUT + parse JSON, surfacing the server's error body on failure. */
const sendJson = async <T,>(
  url: string,
  method: "POST" | "PUT" | "PATCH",
  payload: unknown
): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(responseText || `Request failed (${response.status})`);
  }

  return JSON.parse(responseText) as T;
};

const toMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Archiving quotations/invoices is a view-only concept (no backend field
   for it), so the archived id list just lives in localStorage per browser. */
const readArchivedIds = (storageKey: string): number[] => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
};

const writeArchivedIds = (storageKey: string, ids: number[]) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Storage can fail (private browsing, quota); archiving still works
    // for the current session via React state.
  }
};

const money = (value: unknown) =>
  Number(value || 0).toLocaleString("en-IN");

const money2 = (value: unknown) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** 2026-06-29 -> "29 Jun 2026" for the printed invoice. */
const formatPrintDate = (value?: string) => {
  if (!value) return "-";

  const date = parseDate(value);
  if (!date) return value;

  return `${String(date.getDate()).padStart(2, "0")} ${
    MONTH_NAMES[date.getMonth()]
  } ${date.getFullYear()}`;
};

/* The logo file has a lot of empty space around the artwork, which made it
   look tiny and pushed the company name far below it on the invoice PDF.
   This crops that empty margin once (at start-up) so the logo can be sized
   and centred properly. If anything fails, the original logo is used. */
let trimmedLogoUrl: string | null = null;

const trimLogoPadding = (src: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);

        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);

        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const visible = data[i + 3] > 20; // not transparent
            const bright = data[i] + data[i + 1] + data[i + 2] > 60; // not black

            if (visible && bright) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX < 0) return resolve(src);

        const pad = 2;
        const sx = Math.max(0, minX - pad);
        const sy = Math.max(0, minY - pad);
        const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
        const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

        const out = document.createElement("canvas");
        out.width = sw;
        out.height = sh;
        out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        resolve(out.toDataURL("image/png"));
      } catch {
        resolve(src);
      }
    };

    img.onerror = () => resolve(src);
    img.src = src;
  });

/* =========================================================
  PRODUCTS — shared helpers
========================================================= */

// The API normally returns absolute image URLs; this also copes with a
// relative "/media/..." path so <img> and the PDFs never break.
const API_ORIGIN = new URL(API_URL).origin;

const resolveMediaUrl = (src?: string | null): string | null => {
  if (!src) return null;
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return `${API_ORIGIN}${src.startsWith("/") ? "" : "/"}${src}`;
};

const itemsHaveImages = (items: { product_image?: string | null }[]) =>
  items.some((item) => Boolean(item.product_image));

const PRODUCT_UNITS: { value: string; label: string }[] = [
  { value: "sqft", label: "Sq.ft" },
  { value: "nos", label: "Nos" },
  { value: "rft", label: "Running ft" },
  { value: "set", label: "Set" },
  { value: "kg", label: "Kg" },
  { value: "lot", label: "Lot / Job" },
];

const productUnitLabel = (unit?: string) =>
  PRODUCT_UNITS.find((item) => item.value === unit)?.label || unit || "Nos";

const MAX_PRODUCT_IMAGE_MB = 5;

const emptyProductForm = {
  name: "",
  code: "",
  category: "",
  description: "",
  unit: "sqft",
  rate: "",
  is_active: true,
};

const revokePreview = (url: string | null) => {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
};

/** Square product photo, or a neutral placeholder when there is none. */
const ProductThumb = ({
  src,
  name,
  size = "sm",
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md";
}) => {
  const url = resolveMediaUrl(src);

  return url ? (
    <img
      className={`product-thumb product-thumb-${size}`}
      src={url}
      alt={name || "Product"}
      loading="lazy"
    />
  ) : (
    <span
      className={`product-thumb product-thumb-${size} product-thumb-empty`}
      aria-hidden="true"
    >
      ▣
    </span>
  );
};

/** Prints a popup window once EVERY image in it (logo + product photos)
   has finished loading, so photos are never missing from the PDF. */
const printWhenReady = (win: Window, fallbackMs = 5000) => {
  let printed = false;

  const doPrint = () => {
    if (printed) return;
    printed = true;

    try {
      win.focus();
      win.print();
    } catch (error) {
      console.error("PRINT ERROR:", error);
    }
  };

  const pending = Array.from(win.document.images).filter(
    (image) => !image.complete
  );

  if (pending.length === 0) {
    win.setTimeout(doPrint, 300);
    return;
  }

  let remaining = pending.length;
  const onSettled = () => {
    remaining -= 1;
    if (remaining <= 0) win.setTimeout(doPrint, 150);
  };

  pending.forEach((image) => {
    image.addEventListener("load", onSettled, { once: true });
    image.addEventListener("error", onSettled, { once: true });
  });

  // Safety net so a slow/broken image can never block printing forever.
  win.setTimeout(doPrint, fallbackMs);
};

/* =========================================================
  EMPTY FORMS
========================================================= */

const emptyCustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  status: "active" as Customer["status"],
};

const emptyProjectForm = {
  name: "",
  budget: "",
  site_address: "",
  city: "",
  state: "",
  pincode: "",
  status: "new" as Project["status"],
  notes: "",
};

// Dashboard welcome header helpers — pure functions so the live clock only
// needs to re-run these on a ticking `now` state, not redefine them.
const getGreeting = (date: Date) => {
  const hour = date.getHours();

  if (hour < 5) return { text: "Good Night", emoji: "🌙" };
  if (hour < 12) return { text: "Good Morning", emoji: "☀️" };
  if (hour < 17) return { text: "Good Afternoon", emoji: "🌤️" };
  if (hour < 21) return { text: "Good Evening", emoji: "🌇" };
  return { text: "Good Night", emoji: "🌙" };
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Sat, 19 Sep" — named distinctly from the existing formatShortDate(value?:
// string) helper used elsewhere for project/payment dates, since that one
// takes a string and this takes a live Date.
const formatWelcomeDate = (date: Date) =>
  `${WEEKDAY_NAMES[date.getDay()]}, ${date.getDate()} ${
    MONTH_NAMES[date.getMonth()]
  }`;

// "Sat, 19 Sep 2026"
const formatFullDate = (date: Date) =>
  `${formatWelcomeDate(date)} ${date.getFullYear()}`;

// "05:32:48 PM"
const formatClockTime = (date: Date) => {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";

  hours = hours % 12 || 12;

  return `${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${period}`;
};

/** Ticks by itself so only this label re-renders each second - not the whole
 *  App (that made every page re-render 60 times a minute). */
const LiveClock = () => {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return <>{formatClockTime(time)}</>;
};

const emptyQuotationForm = {
  quotation_no: "",
  date: todayIso(),
  subject: "UPVC WINDOWS",
  phone: "",
  gst_percent: "18",
  status: "draft" as Quotation["status"],
  terms: DEFAULT_QUOTATION_TERMS,
};

const emptyQuotationItem = (): QuotationItem => ({
  category: "",
  width: "",
  height: "",
  qty: "1",
  rate: "",
});

const QUOTATION_STATUSES: Quotation["status"][] = [
  "draft",
  "sent",
  "accepted",
  "rejected",
];

const quotationStatusLabel = (status: Quotation["status"]) =>
  capitalize(status);

// [Settings] Company details now live in Settings (see settingsStore.ts).

// Payment modes offered on the Record Payment form / Payments page filters.
const PAYMENT_MODES: { value: string; label: string; icon: string }[] = [
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "upi", label: "UPI", icon: "📱" },
  { value: "bank_transfer", label: "Bank", icon: "🏦" },
  { value: "cheque", label: "Cheque", icon: "🧾" },
  { value: "other", label: "Other", icon: "⋯" },
];

const paymentModeLabel = (mode?: string) =>
  PAYMENT_MODES.find((item) => item.value === mode)?.label ||
  (mode ? mode.replace(/_/g, " ") : "Other");

const emptyInvoiceForm = {
  invoice_no: "",
  invoice_date: todayIso(),
  due_date: todayIso(),
  gst_percent: "18",
  discount: "0",
  paid_amount: "0",
  status: "draft" as Invoice["status"],
  terms: DEFAULT_INVOICE_TERMS,
};

const emptyInvoiceItem = (): InvoiceItem => ({
  description: "",
  width: "",
  height: "",
  quantity: "1",
  unit: "nos",
  rate: "",
});

/* ---------- Invoice lines priced by area ----------
   A quotation prices windows/doors as width x height x qty x rate-per-sq.ft,
   but the invoice API only stores description / quantity / unit / rate.
   So an area line is saved as:
     quantity = total sq.ft   (width x height x pieces)
     unit     = "sqft"
     rate     = Rs per sq.ft  (the same rate the quotation used)
   which makes amount = quantity x rate exactly the quotation's line total,
   however the server recomputes it. The measurements ride along in a
   trailing "[W x H x Qty]" tag on the description so the invoice can show
   the same Width / Height / Qty / Area columns as the quotation. */
const INVOICE_DIMS_TAG =
  /\s*\[\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*\]\s*$/i;

// Sq.ft of an item being edited — 0 unless both width and height are given.
const calcInvoiceItemArea = (item: InvoiceItem) => {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  const pieces = Number(item.quantity || 0);

  return width > 0 && height > 0 ? round2(width * height * pieces) : 0;
};

const calcInvoiceItemAmount = (item: InvoiceItem) => {
  const rate = Number(item.rate || 0);
  const area = calcInvoiceItemArea(item);

  return round2(area > 0 ? area * rate : Number(item.quantity || 0) * rate);
};

// Description as stored: clean text + the measurement tag for area lines.
const encodeInvoiceItemDescription = (item: InvoiceItem) => {
  const text = (item.description || "").trim();

  return calcInvoiceItemArea(item) > 0
    ? `${text} [${Number(item.width)} x ${Number(item.height)} x ${Number(
        item.quantity || 0
      )}]`
    : text;
};

// Reads a saved invoice item back into label + measurements.
const readSavedInvoiceItem = (item: InvoiceItem) => {
  const raw = item.description || "";
  const match = raw.match(INVOICE_DIMS_TAG);

  if (!match) {
    return {
      label: raw.trim(),
      width: "",
      height: "",
      pieces: String(item.quantity ?? ""),
      area: 0,
      hasDims: false,
    };
  }

  return {
    label: raw.replace(INVOICE_DIMS_TAG, "").trim(),
    width: match[1],
    height: match[2],
    pieces: match[3],
    area: Number(item.quantity || 0),
    hasDims: true,
  };
};

const INVOICE_STATUSES: Invoice["status"][] = [
  "draft",
  "sent",
  "paid",
  "cancelled",
];

const invoiceStatusLabel = (status: Invoice["status"]) => capitalize(status);
/* =========================================================
  APP
========================================================= */

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  // Mobile only: the sidebar becomes an off-canvas drawer below 900px wide,
  // opened from the hamburger button in the topbar. See sidebar()/topbar().
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navigates and, if the mobile drawer happens to be open, closes it in the
  // same click — no effect needed, so no cascading re-render on every page
  // change (see react-hooks/set-state-in-effect).
  const goToPage = (next: Page) => {
    setPage(next);
    setSidebarOpen(false);
  };

  // ---- Language / i18n ----
  // Persists the user's chosen language (English / Tamil / Hindi) in
  // localStorage so it's remembered on their device across visits.
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem("app_language");
    return saved === "ta" || saved === "hi" || saved === "en"
      ? (saved as Language)
      : "en";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("app_language", language);
    } catch {
      // ignore write failures (e.g. private browsing)
    }
  }, [language]);

  const t = (key: string) => {
    const entry = TRANSLATIONS[key];
    if (!entry) return key;
    return entry[language] || entry.en || key;
  };

  // [Settings] Company details shown on every printed document.
  const [company, setCompany] = useState<CompanySettings>(loadCompanySettings);

  const saveCompany = (next: CompanySettings) => {
    const stored = saveCompanySettings(next);
    if (stored) setCompany(next);
    return stored;
  };

  // [Settings] Logo used on PDFs: the uploaded one, else the cropped built-in.
  const printLogoUrl = () =>
    company.logoDataUrl ||
    trimmedLogoUrl ||
    new URL(logo, window.location.href).href;

  // Greeting / date / "this month" only need to be right to the minute. The
  // per-second clock lives in <LiveClock /> so it does not re-render the app.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);
  const [selectedCustomer, setSelectedCustomer] =
  useState<Customer | null>(null);  
  const [editingProject, setEditingProject] =
  useState<Project | null>(null);  


  const [loading, setLoading] = useState(false);

  // Captured once, so formatRelativeDays doesn't call the impure
  // Date.now() during every render (React purity rule).
  const [nowTs] = useState(() => Date.now());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState("all");

  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);

  const [customerForm, setCustomerForm] =
    useState(emptyCustomerForm);

  const [projectCustomer, setProjectCustomer] =
    useState<Customer | null>(null);

  const [projectForm, setProjectForm] =
    useState(emptyProjectForm);

  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [showSpendForm, setShowSpendForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [spendForm, setSpendForm] = useState({
  project: "",
  title: "",
  category: "",
  amount: "",
  date: todayIso(),
  notes: "",
});

// Spend page — search, filters and view mode
const [spendSearch, setSpendSearch] = useState("");
const [spendProjectFilter, setSpendProjectFilter] = useState<
  "all" | number
>("all");
const [spendCategoryFilter, setSpendCategoryFilter] = useState("all");
const [spendViewMode, setSpendViewMode] = useState<"list" | "grid">("list");

const [payments, setPayments] = useState<Payment[]>([]);

const [showPaymentForm, setShowPaymentForm] = useState(false);
const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

const [paymentForm, setPaymentForm] = useState({
  project: "",
  title: "",
  amount: "",
  payment_method: "",
  date: todayIso(),
  notes: "",
});

// Payments page — search, filters and view mode
const [paymentSearch, setPaymentSearch] = useState("");
const [paymentProjectFilter, setPaymentProjectFilter] = useState<
  "all" | number
>("all");
const [paymentModeFilter, setPaymentModeFilter] = useState("all");
const [paymentViewMode, setPaymentViewMode] = useState<"list" | "grid">(
  "list"
);

const [quotations, setQuotations] = useState<Quotation[]>([]);
const [selectedQuotation, setSelectedQuotation] =
  useState<Quotation | null>(null);
const [editingQuotation, setEditingQuotation] =
  useState<Quotation | null>(null);
const [quotationCustomer, setQuotationCustomer] =
  useState<Customer | null>(null);
const [quotationProject, setQuotationProject] =
  useState<Project | null>(null);
const [quotationForm, setQuotationForm] = useState(emptyQuotationForm);
const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([
  emptyQuotationItem(),
]);
const [quotationSearch, setQuotationSearch] = useState("");
const [quotationClientSearch, setQuotationClientSearch] = useState("");
const [quotationStatusUpdating, setQuotationStatusUpdating] = useState<
  number | null
>(null);
// The quotation currently being turned into an invoice (see
// convertQuotationToInvoice), so its "Convert to Invoice" button can show a
// busy state and can't be double-clicked.
const [convertingQuotationId, setConvertingQuotationId] = useState<
  number | null
>(null);
const [quotationViewMode, setQuotationViewMode] = useState<"grid" | "list">(
  "grid"
);
const [showArchivedQuotations, setShowArchivedQuotations] = useState(false);
const [archivedQuotationIds, setArchivedQuotationIds] = useState<number[]>(
  () => readArchivedIds("windaaro_archived_quotations")
);

// Lets a quotation be raised for a one-off vendor/contact by typing a name
// and phone directly, instead of picking from the saved Customers list.
// The lightweight customer record is only created in the backend when the
// quotation is actually saved (see saveQuotation).
const [useManualCustomer, setUseManualCustomer] = useState(false);
const [manualCustomerForm, setManualCustomerForm] = useState({
  name: "",
  phone: "",
});

const [invoices, setInvoices] = useState<Invoice[]>([]);
const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
const [invoiceCustomer, setInvoiceCustomer] = useState<Customer | null>(null);
const [invoiceProject, setInvoiceProject] = useState<Project | null>(null);
const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
  emptyInvoiceItem(),
]);
const [invoiceSearch, setInvoiceSearch] = useState("");
const [invoiceViewMode, setInvoiceViewMode] = useState<"grid" | "list">(
  "grid"
);
const [showArchivedInvoices, setShowArchivedInvoices] = useState(false);
const [archivedInvoiceIds, setArchivedInvoiceIds] = useState<number[]>(() =>
  readArchivedIds("windaaro_archived_invoices")
);
const [invoiceStatusUpdating, setInvoiceStatusUpdating] = useState<
  number | null
>(null);

// ---- Products ----
const [products, setProducts] = useState<Product[]>([]);
const [productSearch, setProductSearch] = useState("");
const [productCategoryFilter, setProductCategoryFilter] = useState("all");
const [productStatusFilter, setProductStatusFilter] = useState<
  "all" | "active" | "inactive"
>("all");
const [productViewMode, setProductViewMode] = useState<"grid" | "list">(
  "grid"
);
const [showProductForm, setShowProductForm] = useState(false);
const [editingProduct, setEditingProduct] = useState<Product | null>(null);
const [productForm, setProductForm] = useState(emptyProductForm);
const [productImageFile, setProductImageFile] = useState<File | null>(null);
const [productImagePreview, setProductImagePreview] = useState<string | null>(
  null
);
const [productRemoveImage, setProductRemoveImage] = useState(false);
const [productDragOver, setProductDragOver] = useState(false);
const [productSaving, setProductSaving] = useState(false);

// "Add from Products" picker used inside the quotation / invoice forms
const [productPickerTarget, setProductPickerTarget] = useState<
  "quotation" | "invoice" | null
>(null);
const [pickerSearch, setPickerSearch] = useState("");
const [pickerCategory, setPickerCategory] = useState("all");
const [pickerAdded, setPickerAdded] = useState<Record<number, number>>({});

/* =========================================================
  LOAD DATA
========================================================= */

const loadCustomers = async () => {
  try {
    setLoading(true);
    setCustomers(await fetchJson<Customer[]>(API_URL, "customers"));
  } catch (error) {
    console.error(error);
    alert("Unable to load customers. Check Django server.");
  } finally {
    setLoading(false);
  }
};

const loadProjects = async () => {
  try {
    setProjects(await fetchJson<Project[]>(PROJECT_API_URL, "projects"));
  } catch (error) {
    console.error(error);
  }
};

const loadExpenses = async () => {
  try {
    setExpenses(await fetchJson<Expense[]>(EXPENSE_API_URL, "expenses"));
  } catch (error) {
    console.error(error);
  }
};

const loadPayments = async () => {
  try {
    setPayments(await fetchJson<Payment[]>(PAYMENT_API_URL, "payments"));
  } catch (error) {
    console.error(error);
  }
};

const loadQuotations = async () => {
  try {
    setQuotations(
      await fetchJson<Quotation[]>(QUOTATION_API_URL, "quotations")
    );
  } catch (error) {
    console.error(error);
  }
};

const loadInvoices = async () => {
  try {
    setInvoices(await fetchJson<Invoice[]>(INVOICE_API_URL, "invoices"));
  } catch (error) {
    console.error(error);
  }
};

useEffect(() => {
  // Loads everything in parallel with the same fetchJson() helper the loaders
  // above use. (A failed list is logged; the customers loader alerts.)
  const loadData = async () => {
    setLoading(true);

    const results = await Promise.allSettled([
      fetchJson<Customer[]>(API_URL, "customers").then(setCustomers),
      fetchJson<Project[]>(PROJECT_API_URL, "projects").then(setProjects),
      fetchJson<Expense[]>(EXPENSE_API_URL, "expenses").then(setExpenses),
      fetchJson<Payment[]>(PAYMENT_API_URL, "payments").then(setPayments),
      fetchJson<Quotation[]>(QUOTATION_API_URL, "quotations").then(
        setQuotations
      ),
      fetchJson<Invoice[]>(INVOICE_API_URL, "invoices").then(setInvoices),
      fetchJson<Product[]>(PRODUCT_API_URL, "products").then(setProducts),
    ]);

    // One bad list no longer hides the others, and each failure is named.
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    failed.forEach((result) => console.error(result.reason));

    if (failed.length > 0) {
      alert(
        `Unable to load: ${failed.map((r) => toMessage(r.reason)).join("; ")}\n\nCheck the Django server.`
      );
    }

    setLoading(false);
  };

  loadData();
}, []);

useEffect(() => {
  trimLogoPadding(logo).then((url) => {
    trimmedLogoUrl = url;
  });
}, []);
  /* =========================================================
    CUSTOMER FORM
  ========================================================= */

  const openAddCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm);
    setShowCustomerForm(true);
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);

    setCustomerForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      pincode: customer.pincode || "",
      status: customer.status || "active",
    });

    setShowCustomerForm(true);
  };

  const closeCustomerForm = () => {
    setShowCustomerForm(false);
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm);
  };

  const handleCustomerChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;

    setCustomerForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const saveCustomer = async (event: FormEvent) => {
    event.preventDefault();

    try {
      const url = editingCustomer
        ? `${API_URL}${editingCustomer.id}/`
        : API_URL;

      const method = editingCustomer ? "PUT" : "POST";

      // Captured before the state resets below, so the message and the
      // navigation that follow don't read a stale value.
      const wasEditing = Boolean(editingCustomer);

      await sendJson<Customer>(url, method, customerForm);

      closeCustomerForm();
      await loadCustomers();

      alert(
        wasEditing
          ? "Customer updated successfully."
          : "Customer added successfully."
      );
    } catch (error) {
      console.error("SAVE CUSTOMER ERROR:", error);
      alert(`Unable to save customer.\n\n${toMessage(error)}`);
    }
  };

  const deleteCustomer = async (id: number) => {
    const confirmed = window.confirm(
      "Delete this customer?\n\nThis also permanently deletes ALL of their projects, expenses, payments, quotations and invoices. This cannot be undone."
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}${id}/`, {
        method: "DELETE",
      });

      if (!response.ok) {
        alert("Unable to delete customer.");
        return;
      }

      if (selectedCustomer?.id === id) {
        setSelectedCustomer(null);
        setPage("customers");
      }

      await loadCustomers();
      alert("Customer deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    }
  };

  /* =========================================================
    PROJECT FORM
  ========================================================= */

const openCreateProject = (customer?: Customer) => {
  setEditingProject(null);
  setProjectCustomer(customer || null);

  setProjectForm({
    ...emptyProjectForm,
    city: customer?.city || "",
    state: customer?.state || "",
    pincode: customer?.pincode || "",
  });

  setPage("create-project");
};

const openProjectDetails = (project: Project) => {
  setSelectedProject(project);
  setPage("project-details");
};
const openClientProfile = (customerId: number) => {
  const customer = customers.find(
    (item) => item.id === customerId
  );

  if (!customer) {
    alert("Customer details not found.");
    return;
  }

  setSelectedCustomer(customer);
  setPage("client-profile");
};
const openEditProject = (project: Project) => {
  setEditingProject(project);

  const customer = customers.find(
    (item) => item.id === project.customer
  );

  setProjectCustomer(customer || null);

  setProjectForm({
    name: project.name || "",
    budget: String(project.budget || ""),
    site_address: project.site_address || "",
    city: project.city || "",
    state: project.state || "",
    pincode: project.pincode || "",
    status: project.status || "new",
    notes: project.notes || "",
  });

  setPage("edit-project");
};


  const handleProjectChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;

    setProjectForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleProjectCustomerChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const customerId = Number(event.target.value);

    const customer = customers.find(
      (item) => item.id === customerId
    );

    setProjectCustomer(customer || null);

    setProjectForm((previous) => ({
      ...previous,
      city: customer?.city || "",
      state: customer?.state || "",
      pincode: customer?.pincode || "",
    }));
  };

  const saveProject = async (event: FormEvent) => {
  event.preventDefault();

  if (!projectCustomer) {
    alert("Please select a customer first.");
    return;
  }

  // Captured up front: setEditingProject(null) below does NOT update the
  // `editingProject` const in this closure, so reading it afterwards was
  // relying on a stale value.
  const wasEditing = Boolean(editingProject);

  try {
    const payload = {
      customer: projectCustomer.id,
      ...projectForm,
      budget: Number(projectForm.budget || 0),
    };

    const url = editingProject
      ? `${PROJECT_API_URL}${editingProject.id}/`
      : PROJECT_API_URL;

    const savedProject = await sendJson<Project>(
      url,
      wasEditing ? "PUT" : "POST",
      payload
    );

    await loadProjects();

    setSelectedProject(savedProject);
    setEditingProject(null);
    setProjectCustomer(null);
    setProjectForm(emptyProjectForm);

    setPage(wasEditing ? "project-details" : "projects");

    alert(
      wasEditing
        ? "Project updated successfully."
        : "Project created successfully."
    );
  } catch (error) {
    console.error("SAVE PROJECT ERROR:", error);
    alert(`Unable to save project.\n\n${toMessage(error)}`);
  }
};

const deleteProject = async (id: number) => {
  const confirmed = window.confirm(
    "Delete this project?\n\nThis also permanently deletes its expenses, payments and work entries. Quotations and invoices are kept but unlinked. This cannot be undone."
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${PROJECT_API_URL}${id}/`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Unable to delete project.");
      return;
    }

    // Without this, deleting the project you are currently viewing leaves
    // selectedProject pointing at a record that no longer exists.
    if (selectedProject?.id === id) {
      setSelectedProject(null);
      setPage("projects");
    }

    if (editingProject?.id === id) {
      setEditingProject(null);
    }

    await loadProjects();
    alert("Project deleted successfully.");
  } catch (error) {
    console.error(error);
    alert("Something went wrong.");
  }
};

const handleSpendChange = (
  event: ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
) => {
  const { name, value } = event.target;

  setSpendForm((previous) => ({
    ...previous,
    [name]: value,
  }));
};

// projectId lets a project's Quick Actions open the form pre-scoped to that
// project; the Spend page omits it so the user picks one.
const openSpendForm = (projectId?: number) => {
  setEditingExpense(null);

  setSpendForm({
    project:
      typeof projectId === "number"
        ? String(projectId)
        : selectedProject
        ? String(selectedProject.id)
        : "",
    title: "",
    category: "",
    amount: "",
    date: todayIso(),
    notes: "",
  });

  setShowSpendForm(true);
};

const openEditSpend = (expense: Expense) => {
  setEditingExpense(expense);

  setSpendForm({
    project: String(expense.project),
    title: expense.title || "",
    category: expense.category || "",
    amount: String(expense.amount ?? ""),
    date: (expense.date || todayIso()).slice(0, 10),
    notes: expense.notes || "",
  });

  setShowSpendForm(true);
};

const closeSpendForm = () => {
  setShowSpendForm(false);
  setEditingExpense(null);
};

const saveSpend = async (event: FormEvent) => {
  event.preventDefault();

  const projectId = Number(spendForm.project || selectedProject?.id || 0);

  if (!projectId) {
    alert("Please select a project.");
    return;
  }

  if (!(Number(spendForm.amount) > 0)) {
    alert("Please enter an amount greater than zero.");
    return;
  }

  try {
    const payload = {
      project: projectId,
      title: spendForm.title.trim(),
      category: spendForm.category,
      amount: Number(spendForm.amount || 0),
      date: spendForm.date || todayIso(),
      notes: spendForm.notes,
    };

    if (editingExpense) {
      await sendJson<Expense>(
        `${EXPENSE_API_URL}${editingExpense.id}/`,
        "PUT",
        payload
      );
    } else {
      await sendJson<Expense>(EXPENSE_API_URL, "POST", payload);
    }

    await loadExpenses();

    closeSpendForm();

    alert(
      editingExpense
        ? "Spend updated successfully."
        : "Spend added successfully."
    );
  } catch (error) {
    console.error("SAVE SPEND ERROR:", error);
    alert(`Unable to save spend.\n\n${toMessage(error)}`);
  }
};

const deleteSpend = async (id: number) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this spend?"
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${EXPENSE_API_URL}${id}/`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Unable to delete spend.");
      return;
    }

    await loadExpenses();

    alert("Spend deleted successfully.");
  } catch (error) {
    console.error("DELETE SPEND ERROR:", error);
    alert("Something went wrong.");
  }
};
const handlePaymentChange = (
  event: ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
) => {
  const { name, value } = event.target;

  setPaymentForm((previous) => ({
    ...previous,
    [name]: value,
  }));
};

// projectId lets the Payments page (or a project's Quick Actions) open the
// form pre-scoped to a project; omit it to let the user pick one manually.
const openPaymentForm = (projectId?: number) => {
  setEditingPayment(null);

  setPaymentForm({
    project: projectId
      ? String(projectId)
      : selectedProject
      ? String(selectedProject.id)
      : "",
    title: "",
    amount: "",
    payment_method: "",
    date: todayIso(),
    notes: "",
  });

  setShowPaymentForm(true);
};

const openEditPayment = (payment: Payment) => {
  setEditingPayment(payment);

  setPaymentForm({
    project: String(payment.project),
    title: payment.title || "",
    amount: String(payment.amount ?? ""),
    payment_method: payment.mode || "",
    date: payment.date || todayIso(),
    notes: payment.notes || "",
  });

  setShowPaymentForm(true);
};

const closePaymentForm = () => {
  setShowPaymentForm(false);
  setEditingPayment(null);
};

const savePayment = async (event: FormEvent) => {
  event.preventDefault();

  const projectId = Number(
    paymentForm.project || selectedProject?.id || 0
  );

  if (!projectId) {
    alert("Please select a project.");
    return;
  }

  if (!paymentForm.payment_method) {
    alert("Please select a payment mode.");
    return;
  }

  if (!(Number(paymentForm.amount) > 0)) {
    alert("Please enter an amount greater than zero.");
    return;
  }

  try {
    const payload = {
      project: projectId,
      title: paymentForm.title.trim() || "Client Payment",
      amount: Number(paymentForm.amount || 0),
      mode: paymentForm.payment_method,
      date: paymentForm.date || todayIso(),
      notes: paymentForm.notes,
    };

    if (editingPayment) {
      await sendJson<Payment>(
        `${PAYMENT_API_URL}${editingPayment.id}/`,
        "PUT",
        payload
      );
    } else {
      await sendJson<Payment>(PAYMENT_API_URL, "POST", payload);
    }

    await loadPayments();

    closePaymentForm();

    alert(
      editingPayment
        ? "Payment updated successfully."
        : "Payment added successfully."
    );
  } catch (error) {
    console.error("SAVE PAYMENT ERROR:", error);
    alert(`Unable to save payment.\n\n${toMessage(error)}`);
  }
};

const deletePayment = async (id: number) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this payment?"
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${PAYMENT_API_URL}${id}/`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Unable to delete payment.");
      return;
    }

    await loadPayments();

    alert("Payment deleted successfully.");
  } catch (error) {
    console.error("DELETE PAYMENT ERROR:", error);
    alert("Something went wrong.");
  }
};
  /* =========================================================
    QUOTATION FORM
  ========================================================= */

const generateQuotationNo = () => {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `WD${year}`;

  return nextDocumentNo(
    prefix,
    quotations.map((quotation) => quotation.quotation_no)
  );
};

const openCreateQuotation = (customer?: Customer, project?: Project) => {
  setEditingQuotation(null);
  setQuotationCustomer(customer || null);
  setQuotationProject(project || null);
  setUseManualCustomer(false);
  setManualCustomerForm({ name: "", phone: "" });

  setQuotationForm({
    ...emptyQuotationForm,
    date: todayIso(),
    phone: customer?.phone || "",
    quotation_no: generateQuotationNo(),
    terms: company.quotationTerms, // [Settings]
  });

  setQuotationItems([emptyQuotationItem()]);
  setPage("create-quotation");
};

const openEditQuotation = (quotation: Quotation) => {
  setEditingQuotation(quotation);

  const customer = customers.find(
    (item) => item.id === quotation.customer
  );
  const project =
    projects.find((item) => item.id === quotation.project) || null;

  setQuotationCustomer(customer || null);
  setQuotationProject(project);
  setUseManualCustomer(false);
  setManualCustomerForm({ name: "", phone: "" });

  setQuotationForm({
    quotation_no: quotation.quotation_no || "",
    date: quotation.date || todayIso(),
    subject: quotation.subject || "",
    phone: quotation.phone || "",
    gst_percent: String(quotation.gst_percent ?? "18"),
    status: quotation.status || "draft",
    terms: quotation.terms || DEFAULT_QUOTATION_TERMS,
  });

  setQuotationItems(
    quotation.items && quotation.items.length > 0
      ? quotation.items.map((item) => ({
          ...item,
          width: item.width != null ? String(item.width) : "",
          height: item.height != null ? String(item.height) : "",
          qty: String(item.qty ?? "1"),
          rate: String(item.rate ?? ""),
        }))
      : [emptyQuotationItem()]
  );

  setPage("edit-quotation");
};

const openQuotationDetails = (quotation: Quotation) => {
  setSelectedQuotation(quotation);
  setPage("quotation-details");
};

const handleQuotationChange = (
  event: ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
) => {
  const { name, value } = event.target;

  setQuotationForm((previous) => ({
    ...previous,
    [name]: value,
  }));
};

const handleQuotationCustomerChange = (
  event: ChangeEvent<HTMLSelectElement>
) => {
  const customerId = Number(event.target.value);
  const customer = customers.find((item) => item.id === customerId);

  setQuotationCustomer(customer || null);
  setQuotationProject(null);

  setQuotationForm((previous) => ({
    ...previous,
    phone: customer?.phone || previous.phone,
  }));
};

const handleManualCustomerChange = (
  event: ChangeEvent<HTMLInputElement>
) => {
  const { name, value } = event.target;

  setManualCustomerForm((previous) => ({
    ...previous,
    [name]: value,
  }));

  // Keep the printed "Phone" field in sync while the user is typing it here,
  // the same way picking an existing customer fills it in.
  if (name === "phone") {
    setQuotationForm((previous) => ({
      ...previous,
      phone: value,
    }));
  }
};

const toggleManualCustomer = (manual: boolean) => {
  setUseManualCustomer(manual);

  if (manual) {
    setQuotationCustomer(null);
    setQuotationProject(null);
  } else {
    setManualCustomerForm({ name: "", phone: "" });
  }
};

const handleQuotationProjectChange = (
  event: ChangeEvent<HTMLSelectElement>
) => {
  const projectId = Number(event.target.value);
  const project = projects.find((item) => item.id === projectId) || null;

  setQuotationProject(project);
};

const handleQuotationItemChange = (
  index: number,
  event: ChangeEvent<HTMLInputElement>
) => {
  const { name, value } = event.target;

  setQuotationItems((previous) =>
    previous.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [name]: value } : item
    )
  );
};

const addQuotationItem = (category = "") => {
  setQuotationItems((previous) => [
    ...previous,
    { ...emptyQuotationItem(), category },
  ]);
};

const removeQuotationItem = (index: number) => {
  setQuotationItems((previous) =>
    previous.length === 1
      ? previous
      : previous.filter((_, itemIndex) => itemIndex !== index)
  );
};

// Area only applies when both width and height are given (matches how
// flat-rate items like ventilators are quoted directly off qty x rate).
const calcItemArea = (item: QuotationItem) => {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  const qty = Number(item.qty || 0);

  return width > 0 && height > 0 ? round2(width * height * qty) : 0;
};

const calcItemTotal = (item: QuotationItem) => {
  const qty = Number(item.qty || 0);
  const rate = Number(item.rate || 0);
  const area = calcItemArea(item);

  return round2(area > 0 ? area * rate : qty * rate);
};

// Groups consecutive items sharing a category, mirroring the section
// headers (e.g. "DOUBLE OPENABLE WINDOWS") used in the printed quotation.
const groupQuotationItems = (items: QuotationItem[]) => {
  const groups: { category: string; items: QuotationItem[] }[] = [];

  items.forEach((item) => {
    const category = item.category?.trim() || "ITEMS";
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.category === category) {
      lastGroup.items.push(item);
    } else {
      groups.push({ category, items: [item] });
    }
  });

  return groups;
};

const quotationSubtotal = round2(
  quotationItems.reduce((total, item) => total + calcItemTotal(item), 0)
);

const quotationGstAmount = round2(
  (quotationSubtotal * Number(quotationForm.gst_percent || 0)) / 100
);

const quotationGrandTotal = round2(quotationSubtotal + quotationGstAmount);

const saveQuotation = async (event: FormEvent) => {
  event.preventDefault();

  if (useManualCustomer && !manualCustomerForm.name.trim()) {
    alert("Please enter the customer's name.");
    return;
  }

  if (!useManualCustomer && !quotationCustomer) {
    alert("Please select a customer first.");
    return;
  }

  const validItems = quotationItems.filter(
    (item) => item.rate && Number(item.rate) > 0
  );

  if (validItems.length === 0) {
    alert("Please add at least one quotation item with a rate.");
    return;
  }

  const wasEditing = Boolean(editingQuotation);

  try {
    // A manually-typed name (for one-off vendor quotations) is saved as a
    // minimal Customer record first, so the quotation can still link to it
    // the same way it links to any customer picked from the list.
    let customerForQuotation = quotationCustomer;

    if (useManualCustomer) {
      customerForQuotation = await sendJson<Customer>(API_URL, "POST", {
        name: manualCustomerForm.name.trim(),
        phone: manualCustomerForm.phone.trim(),
        email: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        status: "active",
      });

      setCustomers((previous) => [...previous, customerForQuotation!]);
      setQuotationCustomer(customerForQuotation);
      setUseManualCustomer(false);
    }

    if (!customerForQuotation) {
      alert("Please select a customer first.");
      return;
    }

    const payload = {
      customer: customerForQuotation.id,
      project: quotationProject ? quotationProject.id : null,
      quotation_no: quotationForm.quotation_no,
      date: quotationForm.date,
      subject: quotationForm.subject,
      phone: quotationForm.phone,
      gst_percent: Number(quotationForm.gst_percent || 0),
      status: quotationForm.status,
      terms: quotationForm.terms,
      items: validItems.map((item, index) => ({
        ...(item.id ? { id: item.id } : {}),
        product: item.product ?? null,
        category: item.category,
        width: item.width ? Number(item.width) : null,
        height: item.height ? Number(item.height) : null,
        qty: Number(item.qty || 0),
        rate: Number(item.rate || 0),
        order: index,
      })),
    };

    const url = editingQuotation
      ? `${QUOTATION_API_URL}${editingQuotation.id}/`
      : QUOTATION_API_URL;

    const savedQuotation = await sendJson<Quotation>(
      url,
      wasEditing ? "PUT" : "POST",
      payload
    );

    await loadQuotations();

    setSelectedQuotation(savedQuotation);
    setEditingQuotation(null);

    setPage("quotation-details");

    alert(
      wasEditing
        ? "Quotation updated successfully."
        : "Quotation created successfully."
    );
  } catch (error) {
    console.error("SAVE QUOTATION ERROR:", error);
    alert(`Unable to save quotation.\n\n${toMessage(error)}`);
  }
};

const deleteQuotation = async (id: number) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this quotation?"
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${QUOTATION_API_URL}${id}/`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Unable to delete quotation.");
      return;
    }

    if (selectedQuotation?.id === id) {
      setSelectedQuotation(null);
      setPage("quotations");
    }

    await loadQuotations();
    alert("Quotation deleted successfully.");
  } catch (error) {
    console.error(error);
    alert("Something went wrong.");
  }
};

const updateQuotationStatus = async (
  quotation: Quotation,
  status: Quotation["status"]
) => {
  if (quotation.status === status || quotationStatusUpdating === quotation.id) {
    return;
  }

  setQuotationStatusUpdating(quotation.id);

  try {
    const updated = await sendJson<Quotation>(
      `${QUOTATION_API_URL}${quotation.id}/`,
      "PATCH",
      { status }
    );

    setQuotations((previous) =>
      previous.map((item) => (item.id === updated.id ? updated : item))
    );

    setSelectedQuotation((previous) =>
      previous?.id === updated.id ? updated : previous
    );
  } catch (error) {
    console.error("UPDATE QUOTATION STATUS ERROR:", error);
    alert(`Unable to update status.\n\n${toMessage(error)}`);
  } finally {
    setQuotationStatusUpdating(null);
  }
};

const toggleArchiveQuotation = (id: number) => {
  setArchivedQuotationIds((previous) => {
    const next = previous.includes(id)
      ? previous.filter((item) => item !== id)
      : [...previous, id];

    writeArchivedIds("windaaro_archived_quotations", next);
    return next;
  });
};

const downloadQuotationPdf = (quotationArg?: Quotation) => {
  const quotation = quotationArg || selectedQuotation;
  if (!quotation) return;

  const client = customers.find(
    (item) => item.id === quotation.customer
  );

  const groupedItems = groupQuotationItems(quotation.items || []);

  // The Image column only appears when at least one row has a product photo,
  // so older text-only quotations keep their original layout.
  const showImages = itemsHaveImages(quotation.items || []);

  let sNo = 0;

  const sectionsHtml = groupedItems
    .map((group) => {
      const rows = group.items
        .map((item) => {
          sNo += 1;

          const area =
            item.area != null && item.area !== ""
              ? Number(item.area)
              : calcItemArea(item);

          const total =
            item.total != null && item.total !== ""
              ? Number(item.total)
              : calcItemTotal(item);

          const imageUrl = resolveMediaUrl(item.product_image);

          const imageCell = showImages
            ? `<td class="img-cell">${
                imageUrl
                  ? `<img class="prod-img" src="${escapeHtml(imageUrl)}" alt="" />`
                  : ""
              }${
                item.product_name
                  ? `<div class="prod-name">${escapeHtml(item.product_name)}</div>`
                  : ""
              }</td>`
            : "";

          return `
            <tr>
              <td>${sNo}</td>
              ${imageCell}
              <td>${escapeHtml(item.width || "-")}</td>
              <td>${escapeHtml(item.height || "-")}</td>
              <td>${escapeHtml(item.qty || "-")}</td>
              <td>${area > 0 ? money(area) : "-"}</td>
              <td class="rate-cell">₹ ${money(item.rate)}</td>
              <td class="total-cell">₹ ${money(total)}</td>
            </tr>`;
        })
        .join("");

      return `
        <tr class="category-row">
        <td colspan="${showImages ? 8 : 7}" style="text-align: center !important; vertical-align: middle;">
        ${escapeHtml(group.category)}
        </td>
</tr>
        ${rows}`;
    })
    .join("");

  const termsHtml = (quotation.terms || "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  const quotationWindow = window.open("", "_blank", "width=1100,height=800");

  if (!quotationWindow) {
    alert("Please allow pop-ups to download the quotation.");
    return;
  }

  // Cropped logo (see trimLogoPadding); falls back to the original file.
  const logoUrl = printLogoUrl();

  quotationWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Quotation ${escapeHtml(quotation.quotation_no)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 30px;
            font-family: Arial, Helvetica, sans-serif;
            color: #1a1a1a;
            background: #ffffff;
          }
          .sheet { max-width: 900px; margin: auto; border: 1px solid #d4af37; }
          .top-bar { height: 10px; background: #a5872c; }
          .bottom-bar { height: 10px; background: #1a1a1a; }
          .brand-band {
            background: #000000;
            padding: 24px 20px;
            text-align: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .brand-logo {
            display: block;
            height: 100px;
            width: auto;
            max-width: 90%;
            object-fit: contain;
            margin: 0 auto;
          }
          .title-bar {
            text-align: center;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 2px;
            border-top: 1px solid #d4af37;
            border-bottom: 1px solid #d4af37;
            padding: 8px 0;
          }
          .meta-table { width: 100%; border-collapse: collapse; }
          .meta-table td {
            border: 1px solid #d4af37;
            padding: 8px 12px;
            font-size: 15px;
            
          }
          .meta-table td.label { font-weight: 700; width: 90px; background: #faf6ea; }
          .meta-table td.value { }
          table.items-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
          .items-table th, .items-table td {
            border: 1px solid #d4af37;
            padding: 7px 8px;
            font-size: 12px;
            text-align: center;
          }
          .items-table thead th { background: #faf6ea; font-weight: 800; }
          .items-table td.img-cell { width: 92px; padding: 5px; }
          .prod-img {
            display: block;
            width: 72px;
            height: 72px;
            object-fit: cover;
            margin: 0 auto;
            border: 1px solid #d4af37;
            border-radius: 4px;
          }
          .prod-name { margin-top: 4px; font-size: 10px; line-height: 1.25; color: #555; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          .category-row td {
            background: #e9e4d6;
            font-weight: 800;
            text-align: left;
            font-size: 13px;
            letter-spacing: 0.3px;
          }
          .rate-cell, .total-cell { text-align: right; }
          .totals-table { width: 100%; border-collapse: collapse; }
          .totals-table td {
            border: 1px solid #d4af37;
            padding: 8px 12px;
            font-size: 13px;
            text-align: right;
          }
          .totals-table td.label { text-align: left; font-weight: 700; }
          .totals-table tr.grand-total td {
            font-weight: 800;
            font-size: 15px;
            background: #faf6ea;
          }
          .terms { padding: 16px 24px 4px; }
          .terms h3 {
            background: #e9e4d6;
            margin: 0 0 10px;
            padding: 7px 10px;
            font-size: 13px;
          }
          .terms p { margin: 5px 0; font-size: 12.5px; }
          .signature {
            text-align: right;
            padding: 26px 26px 10px;
            font-size: 13px;
          }
          .signature strong { color: #a5872c; }
          .signature-space { height: 46px; }
          .footer {
            text-align: center;
            padding: 8px;
            background: #1a1a1a;
            color: #d6d0c4;
            font-size: 11px;
            letter-spacing: 1px;
          }
          ${COMPANY_PRINT_CSS}
          @page { size: A4; margin: 8mm; }
          .terms, .signature { page-break-inside: avoid; }
          @media print {
            body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet { border: none; max-width: none; }
            .brand-band { padding: 14px 20px; }
            .brand-logo { height: 76px; }
            .title-bar { padding: 6px 0; font-size: 16px; }
            .meta-table td { padding: 6px 12px; }
            .items-table th, .items-table td { padding: 5px 8px; }
            .items-table td.img-cell { width: 80px; padding: 4px; }
            .prod-img { width: 56px; height: 56px; }
            .totals-table td { padding: 6px 12px; }
            .terms { padding: 12px 24px 0; }
            .terms p { margin: 3px 0; }
            .signature { padding: 14px 26px 8px; }
            .signature-space { height: 26px; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="top-bar"></div>

          <div class="brand-band" style="${letterheadBandStyle(company)}">
            <img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.name)} Logo" />
          </div>
          ${companyStripHtml(company)}

          <div class="title-bar">QUOTATION</div>

          <table class="meta-table">
            <tr>
              <td class="label">CLIENT:</td>
              <td class="value">${escapeHtml(client?.name || "-")}</td>
              <td class="label">DATE:</td>
              <td class="value">${escapeHtml(quotation.date || "-")}</td>
            </tr>
            <tr>
              <td class="label">PHONE:</td>
              <td class="value">${escapeHtml(
                quotation.phone || client?.phone || "-"
              )}</td>
              <td class="label">Q NO:</td>
              <td class="value">${escapeHtml(quotation.quotation_no)}</td>
            </tr>
            <tr>
              <td class="label">SUB:</td>
              <td class="value" colspan="3">${escapeHtml(
                quotation.subject || "-"
              )}</td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th>${t('s_no')}</th>
                ${showImages ? `<th>${t('image')}</th>` : ""}
                <th>${t('width')}</th>
                <th>${t('height')}</th>
                <th>${t('qty')}</th>
                <th>${t('area_sq_ft')}</th>
                <th>${t('rate')}</th>
                <th>${t('total')}</th>
              </tr>
            </thead>
            <tbody>${sectionsHtml}</tbody>
          </table>

<table class="totals-table">
  <tr>
    <td class="label"></td>
    <td class="total-label">${t('total')}</td>
    <td class="currency">₹</td>
    <td class="amount">
      ${money2(quotation.subtotal)}
    </td>
  </tr>

  <tr>
    <td class="label"></td>
    <td class="total-label">
      GST ${escapeHtml(
        String(quotation.gst_percent ?? "0")
      )}%
    </td>
    <td class="currency">₹</td>
    <td class="amount">
      ${money2(quotation.gst_amount)}
    </td>
  </tr>

  <tr class="grand-total">
    <td class="label"></td>
    <td class="total-label">${t('grand_total')}</td>
    <td class="currency">₹</td>
    <td class="amount">
      ${money2(quotation.grand_total)}
    </td>
  </tr>
</table>

          <div class="terms">
            <h3>TERMS &amp; CONDITIONS</h3>
            ${termsHtml}
          </div>

          ${signatureBlockHtml(
            company,
            t('for_windaaro').replace(/WINDAARO/g, () => escapeHtml(company.name))
          )}

          <div class="footer">${companyFooterHtml(company)}</div>

          <div class="bottom-bar"></div>
        </div>
      </body>
    </html>
  `);

  quotationWindow.document.close();
  quotationWindow.focus();

  printWhenReady(quotationWindow);
};

const filteredQuotations = quotations.filter((quotation) => {
  const client = customers.find((item) => item.id === quotation.customer);

  const searchText = `
    ${quotation.quotation_no}
    ${quotation.subject}
    ${client?.name || ""}
  `.toLowerCase();

  const isArchived = archivedQuotationIds.includes(quotation.id);
  if (isArchived !== showArchivedQuotations) return false;

  return searchText.includes(quotationSearch.toLowerCase());
});

// One row per customer who has at least one quotation, with the
// aggregates a "which of my clients have asked for a quotation" page
// needs — this doesn't touch the Quotation list/form/details pages at all.
type QuotationClientSummary = {
  customer: Customer;
  quotationCount: number;
  totalValue: number;
  latestStatus: Quotation["status"];
  latestDate: string;
};

const quotationClientSummaries: QuotationClientSummary[] = Array.from(
  new Set(quotations.map((quotation) => quotation.customer))
)
  .map((customerId) => {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return null;

    const customerQuotations = quotations.filter(
      (quotation) => quotation.customer === customerId
    );

    const totalValue = customerQuotations.reduce(
      (total, quotation) => total + Number(quotation.grand_total || 0),
      0
    );

    const latest = [...customerQuotations].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    )[0];

    const summary: QuotationClientSummary = {
      customer,
      quotationCount: customerQuotations.length,
      totalValue,
      latestStatus: latest?.status || "draft",
      latestDate: latest?.date || "",
    };

    return summary;
  })
  .filter((item): item is QuotationClientSummary => item !== null)
  .sort((a, b) => a.customer.name.localeCompare(b.customer.name));

const filteredQuotationClients = quotationClientSummaries.filter(
  (summary) => {
    const searchText = `
      ${summary.customer.name}
      ${summary.customer.phone}
      ${summary.customer.email || ""}
      ${summary.customer.city || ""}
    `.toLowerCase();

    return searchText.includes(quotationClientSearch.toLowerCase());
  }
);

const quotationClientsAcceptedCount = quotationClientSummaries.filter(
  (summary) => summary.latestStatus === "accepted"
).length;

const quotationClientsPendingCount = quotationClientSummaries.filter(
  (summary) =>
    summary.latestStatus === "draft" || summary.latestStatus === "sent"
).length;

const quotationClientsTotalValue = quotationClientSummaries.reduce(
  (total, summary) => total + summary.totalValue,
  0
);

  /* =========================================================
    INVOICE FORM
  ========================================================= */

const generateInvoiceNo = () => {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `INV${year}`;

  return nextDocumentNo(
    prefix,
    invoices.map((invoice) => invoice.invoice_no)
  );
};

const openCreateInvoice = (customer?: Customer, project?: Project) => {
  setEditingInvoice(null);
  setInvoiceCustomer(customer || null);
  setInvoiceProject(project || null);

  setInvoiceForm({
    ...emptyInvoiceForm,
    invoice_date: todayIso(),
    due_date: todayIso(),
    invoice_no: generateInvoiceNo(),
    terms: company.invoiceTerms, // [Settings]
  });

  setInvoiceItems([emptyInvoiceItem()]);
  setPage("create-invoice");
};

const openEditInvoice = (invoice: Invoice) => {
  setEditingInvoice(invoice);

  const customer = customers.find((item) => item.id === invoice.customer);
  const project =
    projects.find((item) => item.id === invoice.project) || null;

  setInvoiceCustomer(customer || null);
  setInvoiceProject(project);

  setInvoiceForm({
    invoice_no: invoice.invoice_no || "",
    invoice_date: invoice.invoice_date || todayIso(),
    due_date: invoice.due_date || todayIso(),
    gst_percent: String(invoice.gst_percent ?? "18"),
    discount: String(invoice.discount ?? "0"),
    paid_amount: String(invoice.paid_amount ?? "0"),
    status: invoice.status || "draft",
    terms: invoice.terms || DEFAULT_INVOICE_TERMS,
  });

  setInvoiceItems(
    invoice.items && invoice.items.length > 0
      ? invoice.items.map((item) => {
          const saved = readSavedInvoiceItem(item);

          return {
            ...item,
            description: saved.label,
            width: saved.width,
            height: saved.height,
            // For an area line the form's Qty is the piece count, not sq.ft.
            quantity: saved.hasDims
              ? saved.pieces
              : String(item.quantity ?? "1"),
            unit: item.unit || "nos",
            rate: String(item.rate ?? ""),
          };
        })
      : [emptyInvoiceItem()]
  );

  setPage("edit-invoice");
};

const openInvoiceDetails = (invoice: Invoice) => {
  setSelectedInvoice(invoice);
  setPage("invoice-details");
};

const handleInvoiceChange = (
  event: ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
) => {
  const { name, value } = event.target;

  setInvoiceForm((previous) => ({
    ...previous,
    [name]: value,
  }));
};

const handleInvoiceCustomerChange = (
  event: ChangeEvent<HTMLSelectElement>
) => {
  const customerId = Number(event.target.value);
  const customer = customers.find((item) => item.id === customerId);

  setInvoiceCustomer(customer || null);
  setInvoiceProject(null);
};

const handleInvoiceProjectChange = (event: ChangeEvent<HTMLSelectElement>) => {
  const projectId = Number(event.target.value);
  const project = projects.find((item) => item.id === projectId) || null;

  setInvoiceProject(project);
};

const handleInvoiceItemChange = (
  index: number,
  event: ChangeEvent<HTMLInputElement>
) => {
  const { name, value } = event.target;

  setInvoiceItems((previous) =>
    previous.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [name]: value } : item
    )
  );
};

const addInvoiceItem = () => {
  setInvoiceItems((previous) => [...previous, emptyInvoiceItem()]);
};

const removeInvoiceItem = (index: number) => {
  setInvoiceItems((previous) =>
    previous.length === 1
      ? previous
      : previous.filter((_, itemIndex) => itemIndex !== index)
  );
};

const invoiceSubtotal = round2(
  invoiceItems.reduce((total, item) => total + calcInvoiceItemAmount(item), 0)
);

const invoiceDiscount = Number(invoiceForm.discount || 0);
const invoiceTaxableAmount = round2(
  Math.max(invoiceSubtotal - invoiceDiscount, 0)
);

const invoiceGstAmount = round2(
  (invoiceTaxableAmount * Number(invoiceForm.gst_percent || 0)) / 100
);

const invoiceGrandTotal = round2(invoiceTaxableAmount + invoiceGstAmount);

const saveInvoice = async (event: FormEvent) => {
  event.preventDefault();

  if (!invoiceCustomer) {
    alert("Please select a customer first.");
    return;
  }

  const validItems = invoiceItems.filter(
    (item) => item.description.trim() && Number(item.rate) >= 0
  );

  if (validItems.length === 0) {
    alert("Please add at least one invoice item with a description.");
    return;
  }

  const wasEditing = Boolean(editingInvoice);

  try {
    const payload = {
      customer: invoiceCustomer.id,
      project: invoiceProject ? invoiceProject.id : null,
      invoice_no: invoiceForm.invoice_no,
      invoice_date: invoiceForm.invoice_date,
      due_date: invoiceForm.due_date || null,
      gst_percent: Number(invoiceForm.gst_percent || 0),
      discount: Number(invoiceForm.discount || 0),
      paid_amount: Number(invoiceForm.paid_amount || 0),
      status: invoiceForm.status,
      terms: invoiceForm.terms,
      items: validItems.map((item, index) => {
        const area = calcInvoiceItemArea(item);

        return {
          ...(item.id ? { id: item.id } : {}),
          product: item.product ?? null,
          description: encodeInvoiceItemDescription(item),
          unit: area > 0 ? "sqft" : item.unit,
          // Area lines bill by sq.ft, so amount = sq.ft x rate-per-sq.ft.
          quantity: area > 0 ? area : Number(item.quantity || 0),
          rate: Number(item.rate || 0),
          order: index,
        };
      }),
    };

    const url = editingInvoice
      ? `${INVOICE_API_URL}${editingInvoice.id}/`
      : INVOICE_API_URL;

    const savedInvoice = await sendJson<Invoice>(
      url,
      wasEditing ? "PUT" : "POST",
      payload
    );

    await loadInvoices();

    setSelectedInvoice(savedInvoice);
    setEditingInvoice(null);

    setPage("invoice-details");

    alert(
      wasEditing
        ? "Invoice updated successfully."
        : "Invoice created successfully."
    );
  } catch (error) {
    console.error("SAVE INVOICE ERROR:", error);
    alert(`Unable to save invoice.\n\n${toMessage(error)}`);
  }
};

const deleteInvoice = async (id: number) => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this invoice?"
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${INVOICE_API_URL}${id}/`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Unable to delete invoice.");
      return;
    }

    if (selectedInvoice?.id === id) {
      setSelectedInvoice(null);
      setPage("invoices");
    }

    await loadInvoices();
    alert("Invoice deleted successfully.");
  } catch (error) {
    console.error(error);
    alert("Something went wrong.");
  }
};

const updateInvoiceStatus = async (
  invoice: Invoice,
  status: Invoice["status"]
) => {
  if (invoice.status === status || invoiceStatusUpdating === invoice.id) {
    return;
  }

  setInvoiceStatusUpdating(invoice.id);

  try {
    const updated = await sendJson<Invoice>(
      `${INVOICE_API_URL}${invoice.id}/`,
      "PATCH",
      { status }
    );

    setInvoices((previous) =>
      previous.map((item) => (item.id === updated.id ? updated : item))
    );

    setSelectedInvoice((previous) =>
      previous?.id === updated.id ? updated : previous
    );
  } catch (error) {
    console.error("UPDATE INVOICE STATUS ERROR:", error);
    alert(`Unable to update status.\n\n${toMessage(error)}`);
  } finally {
    setInvoiceStatusUpdating(null);
  }
};

/** Creates an invoice straight from a quotation's own items — nothing is
 *  retyped, and the invoice keeps the quotation's layout (Width / Height /
 *  Qty / Area / Rate / Total). Items with dimensions are saved as
 *  quantity = total sq.ft and rate = the quotation's per-sq.ft rate, so the
 *  amount is exactly the quotation's line total (5 x 5 x 4 pcs at ₹460 =
 *  100 sq.ft x ₹460 = ₹46,000). Items without dimensions stay plain
 *  quantity x rate. The catalogue product id carries across too, so any
 *  product photo attached to the item still shows up on the invoice. */
const convertQuotationToInvoice = async (quotation: Quotation) => {
  if (convertingQuotationId === quotation.id) return;

  const client = customers.find((item) => item.id === quotation.customer);

  if (!client) {
    alert("Can't find the customer for this quotation.");
    return;
  }

  const sourceItems = (quotation.items || []).filter(
    (item) => Number(item.rate) > 0
  );

  if (sourceItems.length === 0) {
    alert("This quotation has no priced items to copy.");
    return;
  }

  const confirmed = window.confirm(
    `Create an invoice from quotation ${quotation.quotation_no} with its ${sourceItems.length} item(s)?`
  );
  if (!confirmed) return;

  setConvertingQuotationId(quotation.id);

  try {
    const items = sourceItems.map((item, index) => {
      const width = Number(item.width || 0);
      const height = Number(item.height || 0);
      const pieces = Number(item.qty || 0) || 1;
      const rate = Number(item.rate || 0);
      const hasDims = width > 0 && height > 0;

      // The quotation's category ("WINDOW") becomes the section header.
      const formItem: InvoiceItem = {
        description:
          item.category?.trim() || item.product_name?.trim() || "Item",
        width: hasDims ? String(width) : "",
        height: hasDims ? String(height) : "",
        quantity: String(pieces),
        unit: "nos",
        rate: String(rate),
      };

      return {
        product: item.product ?? null,
        description: encodeInvoiceItemDescription(formItem),
        unit: hasDims ? "sqft" : "nos",
        quantity: hasDims ? calcInvoiceItemArea(formItem) : pieces,
        rate,
        order: index,
      };
    });

    const payload = {
      customer: quotation.customer,
      project: quotation.project ?? null,
      invoice_no: generateInvoiceNo(),
      invoice_date: todayIso(),
      due_date: todayIso(),
      gst_percent: Number(quotation.gst_percent || 0),
      discount: 0,
      paid_amount: 0,
      status: "draft" as Invoice["status"],
      terms: company.invoiceTerms,
      items,
    };

    const savedInvoice = await sendJson<Invoice>(
      INVOICE_API_URL,
      "POST",
      payload
    );

    await loadInvoices();

    setSelectedInvoice(savedInvoice);
    setPage("invoice-details");

    alert(
      `Invoice ${savedInvoice.invoice_no} created from quotation ${quotation.quotation_no}.`
    );
  } catch (error) {
    console.error("CONVERT QUOTATION TO INVOICE ERROR:", error);
    alert(`Unable to create the invoice.\n\n${toMessage(error)}`);
  } finally {
    setConvertingQuotationId(null);
  }
};

// Shared shape so the same print window works for a live, unsaved draft
// (Preview, from the form) and a saved invoice (Download, from the details
// page) — only how the data is gathered differs between the two callers.
type InvoicePrintable = {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  status: string;
  terms: string;
  clientName: string;
  clientPhone: string;
  projectName: string;
  items: {
    description: string;
    quantity: string | number;
    unit: string;
    rate: string | number;
    amount: string | number;
    image?: string | null;
    // Set only for lines priced by area (width x height x qty).
    width?: string;
    height?: string;
    pieces?: string | number;
    area?: number;
  }[];
  subtotal: number;
  discount: number;
  gstPercent: string | number;
  gstAmount: number;
  grandTotal: number;
  paymentHistory: InvoicePaymentRow[];
};

// Payments are recorded against a project, so an invoice's "received
// payments" are the payments recorded for the invoice's project, oldest first.
const getInvoicePaymentHistory = (
  projectId: number | null | undefined
): InvoicePaymentRow[] => {
  if (!projectId) return [];

  return payments
    .filter((payment) => Number(payment.project) === Number(projectId))
    .slice()
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.id - b.id
    )
    .map((payment) => ({
      date: payment.date || "",
      amount: Number(payment.amount || 0),
    }));
};

const buildInvoicePrintDataFromForm = (): InvoicePrintable => ({
  invoice_no: invoiceForm.invoice_no,
  invoice_date: invoiceForm.invoice_date,
  due_date: invoiceForm.due_date,
  status: invoiceForm.status,
  terms: invoiceForm.terms,
  clientName: invoiceCustomer?.name || "-",
  clientPhone: invoiceCustomer?.phone || "-",
  projectName: invoiceProject?.name || "-",
  items: invoiceItems.map((item) => {
    const area = calcInvoiceItemArea(item);

    return {
      image: resolveMediaUrl(item.product_image),
      description: item.description,
      quantity: area > 0 ? area : item.quantity,
      unit: area > 0 ? "sqft" : item.unit,
      rate: item.rate,
      amount: calcInvoiceItemAmount(item),
      ...(area > 0
        ? {
            width: item.width,
            height: item.height,
            pieces: item.quantity,
            area,
          }
        : {}),
    };
  }),
  subtotal: invoiceSubtotal,
  discount: invoiceDiscount,
  gstPercent: invoiceForm.gst_percent,
  gstAmount: invoiceGstAmount,
  grandTotal: invoiceGrandTotal,
  paymentHistory: getInvoicePaymentHistory(invoiceProject?.id),
});

const buildInvoicePrintDataFromInvoice = (
  invoice: Invoice
): InvoicePrintable => {
  const client = customers.find((item) => item.id === invoice.customer);
  const project = projects.find((item) => item.id === invoice.project);

  return {
    invoice_no: invoice.invoice_no,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    status: invoice.status,
    terms: invoice.terms || "",
    clientName: client?.name || "-",
    clientPhone: client?.phone || "-",
    projectName: project?.name || "-",
    items: (invoice.items || []).map((item) => {
      const saved = readSavedInvoiceItem(item);

      return {
        image: resolveMediaUrl(item.product_image),
        description: saved.label,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount ?? calcInvoiceItemAmount(item),
        ...(saved.hasDims
          ? {
              width: saved.width,
              height: saved.height,
              pieces: saved.pieces,
              area: saved.area,
            }
          : {}),
      };
    }),
    subtotal: Number(invoice.subtotal ?? 0),
    discount: Number(invoice.discount ?? 0),
    gstPercent: invoice.gst_percent ?? 0,
    gstAmount: Number(invoice.gst_amount ?? 0),
    grandTotal: Number(invoice.grand_total ?? 0),
    paymentHistory: getInvoicePaymentHistory(invoice.project),
  };
};

const openInvoicePrintWindow = (
  data: InvoicePrintable,
  autoPrint: boolean
) => {
  // Image column only appears when at least one row has a product photo.
  const showImages = data.items.some((item) => Boolean(item.image));

  const itemColgroup = showImages
    ? `<colgroup>
              <col style="width: 7%" />
              <col style="width: 13%" />
              <col style="width: 30%" />
              <col style="width: 10%" />
              <col style="width: 11%" />
              <col style="width: 14.5%" />
              <col style="width: 14.5%" />
            </colgroup>`
    : `<colgroup>
              <col style="width: 8%" />
              <col style="width: 37%" />
              <col style="width: 12%" />
              <col style="width: 13%" />
              <col style="width: 15%" />
              <col style="width: 15%" />
            </colgroup>`;

  const itemRows = data.items
    .map(
      (item, index) => `
        <tr>
          <td class="c">${index + 1}</td>
          ${
            showImages
              ? `<td class="c img-cell">${
                  item.image
                    ? `<img class="prod-img" src="${escapeHtml(item.image)}" alt="" />`
                    : ""
                }</td>`
              : ""
          }
          <td class="l desc-cell">${escapeHtml(item.description || "-")}</td>
          <td class="c">${escapeHtml(item.unit || "-")}</td>
          <td class="c num">${money2(item.quantity)}</td>
          <td class="r num">${money2(item.rate)}</td>
          <td class="r num">${money2(item.amount)}</td>
        </tr>`
    )
    .join("");

  // Running totals so each row reads: previously paid + now paid = total
  // paid, and what is still left of the grand total.
  let runningPaid = 0;

  const paymentRows =
    data.paymentHistory.length === 0
      ? `<tr><td colspan="6" class="c empty-row">${t('no_payments_received_yet')}</td></tr>`
      : data.paymentHistory
          .map((row) => {
            const previousPaid = runningPaid;
            runningPaid += row.amount;
            const balance = Math.max(0, data.grandTotal - runningPaid);

            return `
        <tr>
          <td class="c">${escapeHtml(formatPrintDate(row.date))}</td>
          <td class="c num">${money2(previousPaid)}</td>
          <td class="c num now-paid">${money2(row.amount)}</td>
          <td class="c num total-paid">${money2(runningPaid)}</td>
          <td class="c num">₹ ${money2(data.grandTotal)}</td>
          <td class="c num balance">₹ ${money2(balance)}</td>
        </tr>`;
          })
          .join("");

  const termsHtml = (data.terms || "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  // Invoices made from a quotation (or with width/height filled in) print
  // in the quotation's layout: Width / Height / Qty / Area / Rate / Total,
  // with a section header per category.
  const useDimsLayout = data.items.some((item) => (item.area ?? 0) > 0);
  const dimsCols = showImages ? 8 : 7;

  const dimsColgroup = showImages
    ? `<colgroup>
              <col style="width: 6%" />
              <col style="width: 12%" />
              <col style="width: 10%" />
              <col style="width: 10%" />
              <col style="width: 8%" />
              <col style="width: 12%" />
              <col style="width: 20%" />
              <col style="width: 22%" />
            </colgroup>`
    : `<colgroup>
              <col style="width: 7%" />
              <col style="width: 12%" />
              <col style="width: 12%" />
              <col style="width: 10%" />
              <col style="width: 14%" />
              <col style="width: 21%" />
              <col style="width: 24%" />
            </colgroup>`;

  const dimsRows = data.items
    .map((item, index) => {
      const label = (item.description || "").trim() || "ITEMS";
      const previousLabel =
        index > 0
          ? (data.items[index - 1].description || "").trim() || "ITEMS"
          : null;
      const hasDims = (item.area ?? 0) > 0;

      const header =
        label !== previousLabel
          ? `<tr class="category-row"><td class="c" colspan="${dimsCols}">${escapeHtml(
              label
            )}</td></tr>`
          : "";

      const qtyText = hasDims
        ? money(item.pieces)
        : `${money(item.quantity)}${
            item.unit && item.unit !== "nos" ? " " + escapeHtml(item.unit) : ""
          }`;

      return `${header}
        <tr>
          <td class="c">${index + 1}</td>
          ${
            showImages
              ? `<td class="c img-cell">${
                  item.image
                    ? `<img class="prod-img" src="${escapeHtml(item.image)}" alt="" />`
                    : ""
                }</td>`
              : ""
          }
          <td class="c num">${hasDims ? money(item.width) : "-"}</td>
          <td class="c num">${hasDims ? money(item.height) : "-"}</td>
          <td class="c num">${qtyText}</td>
          <td class="c num">${hasDims ? money(item.area) : "-"}</td>
          <td class="r num">${money2(item.rate)}</td>
          <td class="r num">${money2(item.amount)}</td>
        </tr>`;
    })
    .join("");

  const itemsTableHtml = useDimsLayout
    ? `<table class="items-table">
            ${dimsColgroup}
            <thead>
              <tr>
                <th class="c">${t('s_no')}</th>
                ${showImages ? `<th class="c">${t('image')}</th>` : ""}
                <th class="c">${t('width')}</th>
                <th class="c">${t('height')}</th>
                <th class="c">${t('qty')}</th>
                <th class="c">${t('area_sq_ft')}</th>
                <th class="r">Rate (₹)</th>
                <th class="r">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>${dimsRows}</tbody>
          </table>`
    : `<table class="items-table">
            ${itemColgroup}
            <thead>
              <tr>
                <th class="c">${t('s_no')}</th>
                ${showImages ? `<th class="c">${t('image')}</th>` : ""}
                <th class="l">${t('description')}</th>
                <th class="c">${t('unit')}</th>
                <th class="c">${t('quantity')}</th>
                <th class="r">Rate (₹)</th>
                <th class="r">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>`;

  const invoiceWindow = window.open("", "_blank", "width=1100,height=800");

  if (!invoiceWindow) {
    alert("Please allow pop-ups to view/download the invoice.");
    return;
  }

  // Cropped logo (see trimLogoPadding); falls back to the original file.
  const logoUrl = printLogoUrl();

  invoiceWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice ${escapeHtml(data.invoice_no || "")}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 30px;
            font-family: Arial, Helvetica, sans-serif;
            color: #1a1a1a;
            background: #ffffff;
          }
          .sheet { max-width: 900px; margin: auto; border: 1px solid #d4af37; }
          .top-bar { height: 10px; background: #a5872c; }
          .bottom-bar { height: 10px; background: #1a1a1a; }

          /* ---------- Header / logo ---------- */
          .brand-band {
            background: #000000;
            padding: 24px 20px;
            text-align: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .brand-logo {
            display: block;
            height: 100px;
            width: auto;
            max-width: 90%;
            object-fit: contain;
            margin: 0 auto;
          }
          .title-bar {
            text-align: center;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 2px;
            border-top: 1px solid #d4af37;
            border-bottom: 1px solid #d4af37;
            padding: 8px 0;
          }

          /* ---------- Shared table rules ---------- */
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td {
            border: 1px solid #d4af37;
            vertical-align: middle;
            word-wrap: break-word;
            overflow-wrap: anywhere;
          }
          .c { text-align: center; }
          .l { text-align: left; }
          .r { text-align: right; }
          .num { white-space: nowrap; font-variant-numeric: tabular-nums; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }

          /* ---------- Meta (client / invoice details) ---------- */
          .meta-table td {
            padding: 8px 12px;
            font-size: 13px;
            text-align: left;
          }
          .meta-table td.label {
            font-weight: 700;
            background: #faf6ea;
            white-space: nowrap;
          }

          /* ---------- Items table ---------- */
          .items-table { margin-top: -1px; }
          .items-table th,
          .items-table td {
            padding: 9px 10px;
            font-size: 12.5px;
          }
          .items-table thead th {
            background: #f7efdc;
            font-weight: 800;
            font-size: 12.5px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .items-table td.img-cell { padding: 5px; }
          .items-table tr.category-row td {
            background: #faf6ea;
            color: #8a6d1f;
            font-weight: 800;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .prod-img {
            display: block;
            width: 64px;
            height: 64px;
            object-fit: cover;
            margin: 0 auto;
            border: 1px solid #d4af37;
            border-radius: 4px;
          }

          /* ---------- Totals box (right aligned) ---------- */
          .totals-box {
            width: 55%;
            margin: 14px 0 0 45%;
          }
          .totals-box td {
            padding: 9px 12px;
            font-size: 13px;
          }
          .totals-box td.tot-label { text-align: left; font-weight: 700; }
          .totals-box td.tot-value { text-align: right; }
          .totals-box tr.grand-total td {
            background: #f3e3b3;
            font-weight: 800;
            font-size: 16px;
            padding: 11px 12px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* ---------- Received payments ---------- */
          .section-heading {
            margin: 22px 0 0;
            padding: 0 12px 6px;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 20px;
            font-weight: 700;
            color: #8a6d1f;
            border-bottom: 1px solid #d4af37;
            page-break-after: avoid;
          }
          .pay-table { margin-top: 12px; }
          .pay-table th, .pay-table td {
            padding: 9px 10px;
            font-size: 12.5px;
            text-align: center;
          }
          .pay-table thead th {
            background: #f7efdc;
            font-weight: 800;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .pay-table td.now-paid { color: #1b6e2d; font-weight: 700; }
          .pay-table td.total-paid { font-weight: 800; }
          .pay-table td.balance { color: #a5701a; font-weight: 700; }
          .pay-table .empty-row { color: #777; padding: 14px 10px; }

          /* ---------- Terms / signature / footer ---------- */
          .terms { padding: 16px 24px 4px; page-break-inside: avoid; }
          .terms h3 {
            background: #e9e4d6;
            margin: 0 0 10px;
            padding: 7px 10px;
            font-size: 13px;
          }
          .terms p { margin: 5px 0; font-size: 12.5px; }
          .signature {
            text-align: right;
            padding: 26px 26px 10px;
            font-size: 13px;
            page-break-inside: avoid;
          }
          .signature strong { color: #a5872c; }
          .signature-space { height: 46px; }
          .footer {
            text-align: center;
            padding: 8px;
            background: #1a1a1a;
            color: #d6d0c4;
            font-size: 11px;
            letter-spacing: 1px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            text-align: center;
            padding: 14px;
          }
          .no-print button {
            background: #a5872c;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 9px 18px;
            font-size: 13px;
            cursor: pointer;
          }
          ${COMPANY_PRINT_CSS}
          @page { size: A4; margin: 8mm; }
          @media print {
            body { padding: 0; }
            .sheet { border: none; max-width: none; }
            .no-print { display: none; }
            .brand-band { padding: 16px 20px; }
            .brand-logo { height: 84px; }
            .title-bar { padding: 6px 0; font-size: 16px; }
            .meta-table td { padding: 6px 12px; }
            .items-table th, .items-table td { padding: 7px 10px; }
            .totals-box { margin-top: 10px; }
            .totals-box td { padding: 7px 12px; }
            .totals-box tr.grand-total td { padding: 9px 12px; }
            .section-heading { margin-top: 14px; font-size: 18px; }
            .pay-table { margin-top: 8px; }
            .pay-table th, .pay-table td { padding: 6px 10px; }
            .terms { padding: 16px 24px 0; }
            .signature { padding: 14px 26px 8px; }
            .signature-space { height: 28px; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="top-bar"></div>

          <div class="brand-band" style="${letterheadBandStyle(company)}">
            <img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(
    company.name
  )} Logo" />
          </div>
          ${companyStripHtml(company)}

          <div class="title-bar">INVOICE</div>

          <table class="meta-table">
            <colgroup>
              <col style="width: 14%" />
              <col style="width: 36%" />
              <col style="width: 16%" />
              <col style="width: 34%" />
            </colgroup>
            <tr>
              <td class="label">CLIENT:</td>
              <td>${escapeHtml(data.clientName)}</td>
              <td class="label">INVOICE NO:</td>
              <td>${escapeHtml(data.invoice_no)}</td>
            </tr>
            <tr>
              <td class="label">PHONE:</td>
              <td>${escapeHtml(data.clientPhone)}</td>
              <td class="label">DATE:</td>
              <td>${escapeHtml(data.invoice_date)}</td>
            </tr>
            <tr>
              <td class="label">PROJECT:</td>
              <td>${escapeHtml(data.projectName)}</td>
              <td class="label">DUE DATE:</td>
              <td>${escapeHtml(data.due_date || "-")}</td>
            </tr>
          </table>

          ${itemsTableHtml}

          <table class="totals-box">
            <colgroup>
              <col style="width: 55%" />
              <col style="width: 45%" />
            </colgroup>
            <tr>
              <td class="tot-label">${t('subtotal')}</td>
              <td class="tot-value num">₹ ${money2(data.subtotal)}</td>
            </tr>
            <tr>
              <td class="tot-label">Discount (₹)</td>
              <td class="tot-value num">${
                data.discount > 0 ? "- " : ""
              }₹ ${money2(data.discount)}</td>
            </tr>
            <tr>
              <td class="tot-label">GST (${escapeHtml(
                String(data.gstPercent ?? "0")
              )}%)</td>
              <td class="tot-value num">₹ ${money2(data.gstAmount)}</td>
            </tr>
            <tr class="grand-total">
              <td class="tot-label">${t('grand_total')}</td>
              <td class="tot-value num">₹ ${money2(data.grandTotal)}</td>
            </tr>
          </table>

          <h3 class="section-heading">${t('received_payments')}</h3>
          <table class="pay-table">
            <colgroup>
              <col style="width: 17%" />
              <col style="width: 17%" />
              <col style="width: 16%" />
              <col style="width: 16%" />
              <col style="width: 17%" />
              <col style="width: 17%" />
            </colgroup>
            <thead>
              <tr>
                <th>${t('date')}</th>
                <th>${t('previously_paid')}</th>
                <th>${t('now_paid')}</th>
                <th>${t('total_paid')}</th>
                <th>${t('grand_total')}</th>
                <th>${t('balance')}</th>
              </tr>
            </thead>
            <tbody>${paymentRows}</tbody>
          </table>

          ${bankBlockHtml(company)}

          <div class="terms">
            <h3>TERMS &amp; CONDITIONS</h3>
            ${termsHtml}
          </div>

          ${signatureBlockHtml(company, `For ${escapeHtml(company.name)}`)}

          <div class="no-print">
            <button onclick="window.print()">${t('print_save_as_pdf')}</button>
          </div>

          <div class="footer">${companyFooterHtml(company)}</div>

          <div class="bottom-bar"></div>
        </div>
      </body>
    </html>
  `);

  invoiceWindow.document.close();
  invoiceWindow.focus();

  if (!autoPrint) return;

  printWhenReady(invoiceWindow);
};

const previewInvoice = () => {
  if (!invoiceCustomer) {
    alert("Please select a customer first.");
    return;
  }

  openInvoicePrintWindow(buildInvoicePrintDataFromForm(), false);
};

const downloadInvoiceFromForm = () => {
  if (!invoiceCustomer) {
    alert("Please select a customer first.");
    return;
  }

  openInvoicePrintWindow(buildInvoicePrintDataFromForm(), true);
};

const toggleArchiveInvoice = (id: number) => {
  setArchivedInvoiceIds((previous) => {
    const next = previous.includes(id)
      ? previous.filter((item) => item !== id)
      : [...previous, id];

    writeArchivedIds("windaaro_archived_invoices", next);
    return next;
  });
};

const downloadInvoicePdf = (invoiceArg?: Invoice) => {
  const invoice = invoiceArg || selectedInvoice;
  if (!invoice) return;
  openInvoicePrintWindow(buildInvoicePrintDataFromInvoice(invoice), true);
};

// Running ledger context for a single payment: how much was collected on
// this project before it, the new total, and what remains against budget.
const getPaymentLedgerContext = (payment: Payment) => {
  const projectPayments = payments
    .filter((item) => Number(item.project) === Number(payment.project))
    .slice()
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.id - b.id
    );

  const index = projectPayments.findIndex((item) => item.id === payment.id);
  const uptoIndex = index === -1 ? projectPayments.length : index;

  const previouslyPaid = projectPayments
    .slice(0, uptoIndex)
    .reduce((total, item) => total + Number(item.amount || 0), 0);

  const totalPaid = previouslyPaid + Number(payment.amount || 0);
  const project = projects.find((item) => item.id === payment.project);
  const budget = Number(project?.budget || 0);
  const balance = Math.max(0, budget - totalPaid);

  return { project, previouslyPaid, totalPaid, budget, balance };
};

// Printable receipt for one payment row on the Payments page — same visual
// language as the invoice PDF (gold-on-cream), auto-prints once the logo
// has loaded (or after a short fallback timeout).
const downloadPaymentReceiptForRow = (payment: Payment) => {
  const project = projects.find((item) => item.id === payment.project);
  const client = customers.find((item) => item.id === project?.customer);
  const { previouslyPaid, totalPaid, budget, balance } =
    getPaymentLedgerContext(payment);

  const receiptWindow = window.open("", "_blank", "width=900,height=750");

  if (!receiptWindow) {
    alert("Please allow pop-ups to download the receipt.");
    return;
  }

  const logoUrl = printLogoUrl();
  const receiptNo = `RCPT-${String(payment.id).padStart(4, "0")}`;

  receiptWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Receipt ${escapeHtml(receiptNo)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 30px;
            font-family: Arial, Helvetica, sans-serif;
            color: #1a1a1a;
            background: #ffffff;
          }
          .sheet { max-width: 720px; margin: auto; border: 1px solid #d4af37; }
          .top-bar { height: 10px; background: #a5872c; }
          .bottom-bar { height: 10px; background: #1a1a1a; }
          .brand-band {
            background: #000000;
            padding: 22px 20px;
            text-align: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .brand-logo {
            display: block;
            height: 86px;
            width: auto;
            max-width: 90%;
            object-fit: contain;
            margin: 0 auto;
          }
          .title-bar {
            text-align: center;
            font-size: 17px;
            font-weight: 800;
            letter-spacing: 2px;
            border-top: 1px solid #d4af37;
            border-bottom: 1px solid #d4af37;
            padding: 8px 0;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d4af37; vertical-align: middle; }
          .meta-table td { padding: 8px 12px; font-size: 13px; text-align: left; }
          .meta-table td.label {
            font-weight: 700;
            background: #faf6ea;
            white-space: nowrap;
            width: 26%;
          }
          .amount-box {
            margin: 20px 16px;
            padding: 18px;
            text-align: center;
            border: 1px dashed #d4af37;
            border-radius: 6px;
            background: #fbf7ea;
          }
          .amount-box .amount-label {
            display: block;
            font-size: 12px;
            letter-spacing: 1px;
            color: #8a6d1f;
            font-weight: 700;
          }
          .amount-box .amount-value {
            display: block;
            font-size: 30px;
            font-weight: 800;
            color: #1b6e2d;
            margin: 6px 0;
          }
          .amount-box .mode-chip {
            display: inline-block;
            font-size: 11.5px;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 20px;
            background: #1a1a1a;
            color: #f4e6b8;
            letter-spacing: 0.5px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .section-heading {
            margin: 20px 16px 0;
            padding: 0 0 6px;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 17px;
            font-weight: 700;
            color: #8a6d1f;
            border-bottom: 1px solid #d4af37;
          }
          .pay-table { margin: 12px 16px; width: calc(100% - 32px); }
          .pay-table th, .pay-table td {
            padding: 9px 10px;
            font-size: 12.5px;
            text-align: center;
          }
          .pay-table thead th {
            background: #f7efdc;
            font-weight: 800;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .pay-table td.now-paid { color: #1b6e2d; font-weight: 700; }
          .pay-table td.total-paid { font-weight: 800; }
          .pay-table td.balance { color: #a5701a; font-weight: 700; }
          .terms { padding: 4px 24px 4px; }
          .terms h3 { background: #e9e4d6; margin: 0 0 8px; padding: 7px 10px; font-size: 13px; }
          .terms p { margin: 4px 0; font-size: 12.5px; }
          .signature { text-align: right; padding: 20px 26px 10px; font-size: 13px; }
          .signature strong { color: #a5872c; }
          .signature-space { height: 40px; }
          .footer {
            text-align: center;
            padding: 8px;
            background: #1a1a1a;
            color: #d6d0c4;
            font-size: 11px;
            letter-spacing: 1px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { text-align: center; padding: 14px; }
          .no-print button {
            background: #a5872c;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 9px 18px;
            font-size: 13px;
            cursor: pointer;
          }
          ${COMPANY_PRINT_CSS}
          @page { size: A4; margin: 10mm; }
          @media print {
            body { padding: 0; }
            .sheet { border: none; max-width: none; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="top-bar"></div>

          <div class="brand-band" style="${letterheadBandStyle(company)}">
            <img class="brand-logo" src="${escapeHtml(
              logoUrl
            )}" alt="${escapeHtml(company.name)} Logo" />
          </div>
          ${companyStripHtml(company)}

          <div class="title-bar">${t('payment_receipt')}</div>

          <table class="meta-table">
            <tr>
              <td class="label">RECEIPT NO:</td>
              <td>${escapeHtml(receiptNo)}</td>
              <td class="label">DATE:</td>
              <td>${escapeHtml(formatPrintDate(payment.date))}</td>
            </tr>
            <tr>
              <td class="label">CLIENT:</td>
              <td>${escapeHtml(client?.name || "-")}</td>
              <td class="label">PHONE:</td>
              <td>${escapeHtml(client?.phone || "-")}</td>
            </tr>
            <tr>
              <td class="label">PROJECT:</td>
              <td colspan="3">${escapeHtml(
                project?.name || `Project #${payment.project}`
              )}</td>
            </tr>
          </table>

          <div class="amount-box">
            <span class="amount-label">AMOUNT RECEIVED</span>
            <span class="amount-value">₹ ${money2(payment.amount)}</span>
            <span class="mode-chip">${escapeHtml(
              paymentModeLabel(payment.mode)
            )}</span>
          </div>

          <h3 class="section-heading">${t('project_ledger_summary')}</h3>
          <table class="pay-table">
            <thead>
              <tr>
                <th>${t('project_budget')}</th>
                <th>${t('previously_paid')}</th>
                <th>${t('this_payment')}</th>
                <th>${t('total_paid')}</th>
                <th>${t('balance_due')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>₹ ${money2(budget)}</td>
                <td>₹ ${money2(previouslyPaid)}</td>
                <td class="now-paid">₹ ${money2(payment.amount)}</td>
                <td class="total-paid">₹ ${money2(totalPaid)}</td>
                <td class="balance">₹ ${money2(balance)}</td>
              </tr>
            </tbody>
          </table>

          ${
            payment.notes
              ? `<div class="terms"><h3>${t('notes')}</h3><p>${escapeHtml(
                  payment.notes
                )}</p></div>`
              : ""
          }

          ${signatureBlockHtml(company, `For ${escapeHtml(company.name)}`)}

          <div class="no-print">
            <button onclick="window.print()">${t('print_save_as_pdf')}</button>
          </div>

          <div class="footer">${companyFooterHtml(company)}</div>

          <div class="bottom-bar"></div>
        </div>
      </body>
    </html>
  `);

  receiptWindow.document.close();
  receiptWindow.focus();

  printWhenReady(receiptWindow);
};

const filteredInvoices = invoices.filter((invoice) => {
  const client = customers.find((item) => item.id === invoice.customer);

  const searchText = `
    ${invoice.invoice_no}
    ${client?.name || ""}
  `.toLowerCase();

  const isArchived = archivedInvoiceIds.includes(invoice.id);
  if (isArchived !== showArchivedInvoices) return false;

  return searchText.includes(invoiceSearch.toLowerCase());
});

/* =========================================================
  FILTER PAYMENTS (Payments page)
========================================================= */

const filteredPayments = payments
  .filter((payment) => {
    const project = projects.find((item) => item.id === payment.project);
    const client = customers.find((item) => item.id === project?.customer);

    const searchText = `
      ${project?.name || ""}
      ${client?.name || ""}
      ${payment.title || ""}
    `.toLowerCase();

    const matchesSearch = searchText.includes(paymentSearch.toLowerCase());

    const matchesProject =
      paymentProjectFilter === "all" ||
      Number(payment.project) === Number(paymentProjectFilter);

    const matchesMode =
      paymentModeFilter === "all" || payment.mode === paymentModeFilter;

    return matchesSearch && matchesProject && matchesMode;
  })
  .slice()
  .sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id
  );

const filteredPaymentsTotal = filteredPayments.reduce(
  (total, payment) => total + Number(payment.amount || 0),
  0
);

const paymentModeCounts: Record<string, number> = {
  all: payments.length,
  cash: payments.filter((payment) => payment.mode === "cash").length,
  bank_transfer: payments.filter(
    (payment) => payment.mode === "bank_transfer"
  ).length,
  upi: payments.filter((payment) => payment.mode === "upi").length,
  cheque: payments.filter((payment) => payment.mode === "cheque").length,
};

const paymentsGrandTotal = payments.reduce(
  (total, payment) => total + Number(payment.amount || 0),
  0
);

const paymentsThisMonthTotal = payments
  .filter((payment) => {
    const date = parseDate(payment.date);
    return (
      date !== null &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  })
  .reduce((total, payment) => total + Number(payment.amount || 0), 0);

const paymentsDistinctProjectCount = new Set(
  payments.map((payment) => payment.project)
).size;

/* =========================================================
  FILTER EXPENSES (Spend page)
========================================================= */

const SPEND_CATEGORIES = ["Material", "Labour", "Transport", "Other"];

// "Other" also catches any older expense whose category isn't one of the
// standard ones, so no expense is ever unreachable from the chips.
const expenseMatchesCategory = (expense: Expense, key: string) => {
  if (key === "all") return true;

  const category = expense.category || "";

  return key === "Other"
    ? !["Material", "Labour", "Transport"].includes(category)
    : category === key;
};

const expenseCategoryLabel = (category?: string) => {
  const key = (category || "").toLowerCase();

  return ["material", "labour", "transport", "other"].includes(key)
    ? t(key)
    : category || t("other");
};

const expenseTime = (value?: string) => {
  const parsed = value ? parseDate(value) ?? new Date(value) : null;
  const time = parsed ? parsed.getTime() : 0;

  return Number.isNaN(time) ? 0 : time;
};

const filteredExpenses = expenses
  .filter((expense) => {
    const project = projects.find((item) => item.id === expense.project);
    const client = customers.find((item) => item.id === project?.customer);

    const searchText = `
      ${project?.name || ""}
      ${client?.name || ""}
      ${expense.title || ""}
      ${expense.category || ""}
      ${expense.notes || ""}
    `.toLowerCase();

    const matchesSearch = searchText.includes(spendSearch.toLowerCase());

    const matchesProject =
      spendProjectFilter === "all" ||
      Number(expense.project) === Number(spendProjectFilter);

    return (
      matchesSearch &&
      matchesProject &&
      expenseMatchesCategory(expense, spendCategoryFilter)
    );
  })
  .slice()
  .sort(
    (a, b) => expenseTime(b.date) - expenseTime(a.date) || b.id - a.id
  );

const filteredExpensesTotal = filteredExpenses.reduce(
  (total, expense) => total + Number(expense.amount || 0),
  0
);

const spendCategoryCounts: Record<string, number> = {
  all: expenses.length,
  ...Object.fromEntries(
    SPEND_CATEGORIES.map((category) => [
      category,
      expenses.filter((expense) => expenseMatchesCategory(expense, category))
        .length,
    ])
  ),
};

const spendThisMonthTotal = expenses
  .filter((expense) => {
    const date = parseDate(expense.date);
    return (
      date !== null &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  })
  .reduce((total, expense) => total + Number(expense.amount || 0), 0);

const spendDistinctProjectCount = new Set(
  expenses.map((expense) => expense.project)
).size;

  /* =========================================================
    FILTER CUSTOMERS
  ========================================================= */

  const filteredCustomers = customers.filter((customer) => {
    const searchText = `
      ${customer.name}
      ${customer.phone}
      ${customer.email}
      ${customer.city}
      ${customer.state}
    `.toLowerCase();

    const matchesSearch = searchText.includes(
      search.toLowerCase()
    );

    const matchesStatus =
      statusFilter === "all" ||
      customer.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
/* =========================================================
  FILTER PROJECTS
========================================================= */

const filteredProjects = projects.filter((project) => {
  const searchText = `
    ${project.name}
    ${project.site_address}
    ${project.city}
    ${project.state}
    ${project.pincode}
  `.toLowerCase();

  const matchesSearch = searchText.includes(
    projectSearch.toLowerCase()
  );

  const matchesStatus =
    projectStatusFilter === "all" ||
    project.status === projectStatusFilter;

  return matchesSearch && matchesStatus;
});

/* =========================================================
  PROJECT FINANCIAL ROLLUPS (for Projects table)
========================================================= */

const getProjectFinancials = (project: Project) => {
  const projectExpenses = expenses.filter(
    (expense) => expense.project === project.id
  );

  const projectPayments = payments.filter(
    (payment) => payment.project === project.id
  );

  const spent = projectExpenses.reduce(
    (total, expense) => total + Number(expense.amount || 0),
    0
  );

  const collected = projectPayments.reduce(
    (total, payment) => total + Number(payment.amount || 0),
    0
  );

  const budget = Number(project.budget || 0);
  const pending = Math.max(0, budget - collected);
  const progress =
    budget > 0 ? Math.min(100, Math.round((collected / budget) * 100)) : 0;

  const lastPayment = projectPayments
    .slice()
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

  return { spent, collected, pending, progress, lastPayment };
};

const projectCustomerLookup = (customerId: number) =>
  customers.find((item) => item.id === customerId);

const totalProjectsCount = projects.length;

const ongoingProjectsCount = projects.filter(
  (project) => project.status === "in_progress"
).length;

const projectsTotalBudget = projects.reduce(
  (total, project) => total + Number(project.budget || 0),
  0
);

const projectsTotalReceivable = projects.reduce((total, project) => {
  const { pending } = getProjectFinancials(project);
  return total + pending;
}, 0);

const formatShortDate = (value?: string) => {
  if (!value) return "-";

  return (parseDate(value) ?? new Date(value)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatRelativeDays = (value?: string) => {
  if (!value) return "";

  const diffMs = nowTs - new Date(value).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  return `${diffDays}d ago`;
};

  /* =========================================================
    SIDEBAR
  ========================================================= */

  const sidebar = () => (
    <aside className={`sidebar${sidebarOpen ? " mobile-open" : ""}`}>
    <div
      className={`logo${
        company.logoDataUrl && company.letterheadTone === "light"
          ? " logo-on-light"
          : ""
      }`}
    >
      <img
        src={company.logoDataUrl || logo}
        alt={`${company.name} logo`}
        className="logo-image"
      />

      <button
        type="button"
        className="sidebar-close-btn"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      >
        ✕
      </button>
    </div>

      <nav>
        <div className="nav-title">{t('nav_main')}</div>

        <button
          type="button"
          className={`nav-item ${
            page === "dashboard" ? "active" : ""
          }`}
          onClick={() => goToPage("dashboard")}
        >
          ▦ <span>{t('dashboard')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${
            page === "customers" || page === "client-profile"
              ? "active"
              : ""
          }`}
          onClick={() => goToPage("customers")}
        >
          ◉ <span>{t('customers')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${
            page === "projects" ||
            page === "create-project" ||
            page === "edit-project" ||
            page === "project-details"
              ? "active"
              : ""
          }`}
          onClick={() => goToPage("projects")}
        >
          ◫ <span>{t('projects')}</span>
        </button>

        <div className="nav-title">{t('nav_business')}</div>

        <button
          type="button"
          className={`nav-item ${page === "products" ? "active" : ""}`}
          onClick={() => goToPage("products")}
        >
          ▣ <span>{t('products')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${
            page === "quotations" ||
            page === "create-quotation" ||
            page === "edit-quotation" ||
            page === "quotation-details" ||
            page === "quotation-clients"
              ? "active"
              : ""
          }`}
          onClick={() => goToPage("quotations")}
        >
          ✎ <span>{t('quotations')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${
            page === "invoices" ||
            page === "create-invoice" ||
            page === "edit-invoice" ||
            page === "invoice-details"
              ? "active"
              : ""
          }`}
          onClick={() => goToPage("invoices")}
        >
          ▥ <span>{t('invoices')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${page === "payments" ? "active" : ""}`}
          onClick={() => goToPage("payments")}
        >
          ₹ <span>{t('payments')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${page === "spend" ? "active" : ""}`}
          onClick={() => goToPage("spend")}
        >
          ▤ <span>{t('spend')}</span>
        </button>

        <div className="nav-title">{t('nav_management')}</div>

        <button
          type="button"
          className={`nav-item ${page === "reports" ? "active" : ""}`}
          onClick={() => goToPage("reports")}
          >
          ◈ <span>{t('reports')}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${page === "settings" ? "active" : ""}`}
          onClick={() => goToPage("settings")}
        >
          ⚙ <span>{t('settings')}</span>
        </button>
      </nav>

      <button
        type="button"
        className={`sidebar-bottom sidebar-bottom-btn ${page === "admin" ? "active" : ""}`}
        onClick={() => goToPage("admin")}
      >
        <div className="user-avatar">
          {company.name.charAt(0).toUpperCase() || "W"}
        </div>

        <div>
          <strong>{company.name}</strong>
          <small>{t('administrator')}</small>
        </div>
      </button>
    </aside>
  );

  // Mobile only: dims the page and closes the drawer when tapped outside it.
  const sidebarBackdrop = () =>
    sidebarOpen ? (
      <div
        className="sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
    ) : null;

  /* =========================================================
  TOPBAR
  Duplicate heading removed here
  ========================================================= */

const topbar = () => {
  const greeting = getGreeting(now);

  return (
  <header className="topbar">
    <button
      type="button"
      className="hamburger-btn"
      aria-label="Open menu"
      onClick={() => setSidebarOpen(true)}
    >
      ☰
    </button>

    <div className="topbar-pills">
      <div className="dashboard-topbar-pill dashboard-topbar-greeting">
        <span className="dashboard-topbar-dot"></span>
        <div>
          <span className="dashboard-topbar-label">{t('hi_there')}</span>
          <strong>
            {greeting.text} {greeting.emoji}
          </strong>
        </div>
      </div>

      <div className="dashboard-topbar-pill">
        <span className="dashboard-topbar-icon">📅</span>
        <div>
          <span className="dashboard-topbar-label">{t('today')}</span>
          <strong>{formatWelcomeDate(now)}</strong>
        </div>
      </div>

      <div className="dashboard-topbar-pill">
        <span className="dashboard-topbar-icon">🕐</span>
        <div>
          <span className="dashboard-topbar-label">{t('time')}</span>
          <strong>
            <LiveClock />
          </strong>
        </div>
      </div>
    </div>

    <div className="top-actions">
      <div className="language-select-wrap">
        <span className="language-select-icon">🌐</span>
        <select
          className="language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          aria-label="Select language"
        >
          <option value="en">English</option>
          <option value="ta">தமிழ்</option>
          <option value="hi">हिंदी</option>
        </select>
        <span className="language-select-arrow">▾</span>
      </div>
      <button className="icon-btn">⌕</button>
      <button className="icon-btn">◔</button>
      <div className="profile">{company.name.charAt(0).toUpperCase() || "W"}</div>
    </div>
  </header>
  );
};
  /* =========================================================
    DASHBOARD
  ========================================================= */

  const dashboard = () => {
    const greeting = getGreeting(now);

    // Newest first by date, then by id so same-day entries keep their
    // entry order.
    const dateValue = (value?: string) => {
      const parsed = value ? parseDate(value) ?? new Date(value) : null;
      const time = parsed ? parsed.getTime() : 0;
      return Number.isNaN(time) ? 0 : time;
    };

    const recentPayments = payments
      .slice()
      .sort((a, b) => dateValue(b.date) - dateValue(a.date) || b.id - a.id)
      .slice(0, 5);

    const recentExpenses = expenses
      .slice()
      .sort((a, b) => dateValue(b.date) - dateValue(a.date) || b.id - a.id)
      .slice(0, 5);

    return (
    <section className="content">
      <div className="dashboard-welcome">
        <div>
          <h1>
            {greeting.text}, <span className="dashboard-welcome-name">{t('team')}</span>{" "}
            {greeting.emoji}
          </h1>
          <p>{t('heres_whats_happening')}</p>
        </div>

        <div className="dashboard-welcome-actions">
          <div className="dashboard-welcome-date">
            📅 {formatFullDate(now)}
          </div>

          <button
            type="button"
            className="gold-btn"
            onClick={() => openCreateProject()}
          >
            + New Project
          </button>
        </div>
      </div>

<div className="dashboard-stats">

  <div className="dashboard-stat-card clients-card">
    <div className="dashboard-stat-top">
      <div className="dashboard-stat-icon">👥</div>

      <span className="dashboard-stat-badge purple-badge">
        ↑ ALL TIME
      </span>
    </div>

    <span className="dashboard-stat-label">
      TOTAL CLIENTS
    </span>

    <strong className="dashboard-stat-value">
      {customers.length}
    </strong>

    <div className="dashboard-stat-line purple-line"></div>
  </div>


  <div className="dashboard-stat-card projects-card">
    <div className="dashboard-stat-top">
      <div className="dashboard-stat-icon">▣</div>

      <span className="dashboard-stat-badge orange-badge">
        ⚡ LIVE
      </span>
    </div>

    <span className="dashboard-stat-label">
      ACTIVE PROJECTS
    </span>

    <strong className="dashboard-stat-value">
      {
        projects.filter(
          (project) =>
            project.status?.toLowerCase() !== "completed"
        ).length
      }
    </strong>

    <div className="dashboard-stat-line orange-line"></div>
  </div>


  <div className="dashboard-stat-card revenue-card">
    <div className="dashboard-stat-top">
      <div className="dashboard-stat-icon">↗</div>

      <span className="dashboard-stat-badge green-badge">
        ↑ INFLOW
      </span>
    </div>

    <span className="dashboard-stat-label">
      REVENUE RECEIVED
    </span>

    <strong className="dashboard-stat-value">
      ₹{dashboardTotalPaid.toLocaleString("en-IN")}
    </strong>

    <div className="dashboard-stat-line green-line"></div>
  </div>


  <div className="dashboard-stat-card expenses-card">
    <div className="dashboard-stat-top">
      <div className="dashboard-stat-icon">▣</div>

      <span className="dashboard-stat-badge red-badge">
        ↓ OUTFLOW
      </span>
    </div>

    <span className="dashboard-stat-label">
      TOTAL EXPENSES
    </span>

    <strong className="dashboard-stat-value">
      ₹{dashboardTotalSpend.toLocaleString("en-IN")}
    </strong>

    <div className="dashboard-stat-line red-line"></div>
  </div>

</div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>{t('recent_customers')}</h2>
              
            </div>

            <button
              className="gold-btn"
              onClick={() => setPage("customers")}
            >
              View All
            </button>
          </div>

          {customers.length > 0 ? (
            customers.slice(0, 3).map((customer) => (
              <div className="customer-row" key={customer.id}>
                <div className="customer-avatar">
                  {customer.name?.charAt(0).toUpperCase() || "C"}
                </div>

                <div className="customer-info">
                  <strong>{customer.name}</strong>

                  <span>
                    {customer.phone} · {customer.city}
                  </span>
                </div>

                <div className="status">
                  {customer.status || "active"}
                </div>
              </div>
            ))
          ) : (
            <p>{t('no_customers_available')}</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>{t('quick_actions')}</h2>
            </div>
          </div>

          <div className="quick-actions">
            <button
              className="quick-action-card quick-action-gold"
              onClick={() => openCreateProject()}
            >
              <span className="quick-action-icon">◫</span>
              <span className="quick-action-label">{t('new_project')}</span>
            </button>

            <button
              className="quick-action-card quick-action-blue"
              onClick={openAddCustomer}
            >
              <span className="quick-action-icon">◉</span>
              <span className="quick-action-label">{t('add_customer')}</span>
            </button>

            <button
              className="quick-action-card quick-action-green"
              onClick={() => setPage("quotations")}
            >
              <span className="quick-action-icon">✎</span>
              <span className="quick-action-label">{t('new_quotation')}</span>
            </button>

            <button
              className="quick-action-card quick-action-red"
              onClick={() => openCreateInvoice()}
            >
              <span className="quick-action-icon">▥</span>
              <span className="quick-action-label">{t('create_invoice')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-grid dashboard-grid-even">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>{t('recent_payments')}</h2>
            </div>

            <button className="gold-btn" onClick={() => setPage("payments")}>
              View All
            </button>
          </div>

          {recentPayments.length > 0 ? (
            recentPayments.map((payment) => {
              const project = projects.find(
                (item) => item.id === payment.project
              );
              const client = customers.find(
                (item) => item.id === project?.customer
              );

              return (
                <div
                  className={`recent-row${project ? " clickable" : ""}`}
                  key={payment.id}
                  onClick={project ? () => openProjectDetails(project) : undefined}
                >
                  <div className="recent-icon in">↗</div>

                  <div className="recent-main">
                    <strong>
                      {project?.name || `Project #${payment.project}`}
                    </strong>
                    <span>
                      {client?.name || "Unknown client"} ·{" "}
                      {formatShortDate(payment.date)}
                    </span>
                  </div>

                  <div className="recent-amount">
                    <strong className="in">₹{money2(payment.amount)}</strong>
                    <span
                      className={`payment-mode-badge mode-${
                        payment.mode || "other"
                      }`}
                    >
                      {paymentModeLabel(payment.mode)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p>{t('no_payments_received_yet')}</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>{t('recent_spend')}</h2>
            </div>

            <button className="gold-btn" onClick={() => setPage("spend")}>
              View All
            </button>
          </div>

          {recentExpenses.length > 0 ? (
            recentExpenses.map((expense) => {
              const project = projects.find(
                (item) => item.id === expense.project
              );

              return (
                <div
                  className={`recent-row${project ? " clickable" : ""}`}
                  key={expense.id}
                  onClick={project ? () => openProjectDetails(project) : undefined}
                >
                  <div className="recent-icon out">↙</div>

                  <div className="recent-main">
                    <strong>{expense.title || expense.category || "Expense"}</strong>
                    <span>
                      {project?.name || `Project #${expense.project}`} ·{" "}
                      {formatShortDate(expense.date)}
                    </span>
                  </div>

                  <div className="recent-amount">
                    <strong className="out">₹{money2(expense.amount)}</strong>
                    {expense.category && (
                      <span className="recent-category">
                        {expense.category}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p>{t('no_expenses_recorded_yet')}</p>
          )}
        </div>
      </div>
    </section>
    );
  };

  /* =========================================================
    CUSTOMERS PAGE
  ========================================================= */

  const customersPage = () => (
    <section className="content">
      <div className="customers-header">
        <div>
          <h2>{t('customers')}</h2>
          <p>{t('manage_your_customer_information')}</p>
        </div>

        <button
          className="gold-btn"
          onClick={openAddCustomer}
        >
          + Add Customer
        </button>
      </div>

      <div className="customers-toolbar">
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value)
          }
        >
          <option value="all">{t('all_status')}</option>
          <option value="active">{t('active')}</option>
          <option value="completed">{t('completed')}</option>
        </select>
      </div>

      <div className="customers-table-wrap">
        <table className="customers-table">
          <thead>
            <tr>
              <th>{t('name')}</th>
              <th>{t('phone')}</th>
              <th>{t('email')}</th>
              <th>{t('location')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>{t('loading_customers')}</td>
              </tr>
            ) : filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={6}>{t('no_customers_found')}</td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <strong>{customer.name}</strong>
                  </td>

                  <td>{customer.phone}</td>

                  <td>{customer.email || "-"}</td>

                  <td>
                    {customer.city}, {customer.state}
                  </td>

                  <td>
                    <span
                      className={`status-badge ${customer.status}`}
                    >
                      {customer.status}
                    </span>
                  </td>

                  <td>
                    <button
                      className="small-btn"
                      onClick={() =>
                        openEditCustomer(customer)
                      }
                    >
                      Edit
                    </button>

                    <button
                      className="danger-btn"
                      onClick={() =>
                        deleteCustomer(customer.id)
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

/* =========================================================
  PROJECTS PAGE
========================================================= */

const projectsPage = () => (
  <section className="content">
    <div className="customers-header projects-page-header">
      <div className="projects-page-heading">
        <div className="projects-page-icon">◫</div>

        <div>
          <h2>{t('projects')}</h2>
          <p>Track budgets, spending &amp; payment collection</p>
        </div>
      </div>

      <button
        className="gold-btn"
        onClick={() => openCreateProject()}
      >
        + New Project
      </button>
    </div>

    <div className="projects-stats">
      <div className="projects-stat-card projects-stat-total">
        <div className="projects-stat-top">
          <div className="projects-stat-icon">▦</div>

          <span className="projects-stat-badge badge-indigo">
            ↑ ALL
          </span>
        </div>

        <span className="projects-stat-label">{t('total_projects')}</span>
        <strong className="projects-stat-value">
          {totalProjectsCount}
        </strong>

        <div className="projects-stat-line line-indigo">
          <span style={{ width: "100%" }}></span>
        </div>
      </div>

      <div className="projects-stat-card projects-stat-ongoing">
        <div className="projects-stat-top">
          <div className="projects-stat-icon">▶</div>

          <span className="projects-stat-badge badge-green">
            ⚡ LIVE
          </span>
        </div>

        <span className="projects-stat-label">{t('ongoing')}</span>
        <strong className="projects-stat-value">
          {ongoingProjectsCount}
        </strong>

        <div className="projects-stat-line line-green">
          <span
            style={{
              width: `${
                totalProjectsCount > 0
                  ? Math.round(
                      (ongoingProjectsCount / totalProjectsCount) * 100
                    )
                  : 0
              }%`,
            }}
          ></span>
        </div>
      </div>

      <div className="projects-stat-card projects-stat-budget">
        <div className="projects-stat-top">
          <div className="projects-stat-icon">▣</div>

          <span className="projects-stat-badge badge-gold">
            — TOTAL
          </span>
        </div>

        <span className="projects-stat-label">{t('total_budget')}</span>
        <strong className="projects-stat-value">
          ₹{projectsTotalBudget.toLocaleString("en-IN")}
        </strong>

        <div className="projects-stat-line line-gold">
          <span style={{ width: "100%" }}></span>
        </div>
      </div>

      <div className="projects-stat-card projects-stat-receivable">
        <div className="projects-stat-top">
          <div className="projects-stat-icon">!</div>

          <span className="projects-stat-badge badge-red">
            ↓ DUE
          </span>
        </div>

        <span className="projects-stat-label">{t('total_receivable')}</span>
        <strong className="projects-stat-value">
          ₹{projectsTotalReceivable.toLocaleString("en-IN")}
        </strong>

        <div className="projects-stat-line line-red">
          <span
            style={{
              width: `${
                projectsTotalBudget > 0
                  ? Math.round(
                      (projectsTotalReceivable / projectsTotalBudget) * 100
                    )
                  : 0
              }%`,
            }}
          ></span>
        </div>
      </div>
    </div>

    <div className="projects-toolbar">
      <div className="projects-search">
        <span className="projects-search-icon">⌕</span>

        <input
          type="text"
          placeholder="Search projects, clients..."
          value={projectSearch}
          onChange={(event) =>
            setProjectSearch(event.target.value)
          }
        />
      </div>

      <div className="projects-filter-pills">
        <button
          type="button"
          className={`filter-pill ${
            projectStatusFilter === "all" ? "active" : ""
          }`}
          onClick={() => setProjectStatusFilter("all")}
        >
          All
        </button>

        <button
          type="button"
          className={`filter-pill dot-indigo ${
            projectStatusFilter === "in_progress" ? "active" : ""
          }`}
          onClick={() => setProjectStatusFilter("in_progress")}
        >
          Ongoing
        </button>

        <button
          type="button"
          className={`filter-pill dot-green ${
            projectStatusFilter === "completed" ? "active" : ""
          }`}
          onClick={() => setProjectStatusFilter("completed")}
        >
          Completed
        </button>

        <button
          type="button"
          className={`filter-pill dot-orange ${
            projectStatusFilter === "cancelled" ? "active" : ""
          }`}
          onClick={() => setProjectStatusFilter("cancelled")}
        >
          On Hold
        </button>
      </div>

      <span className="projects-count-label">
        {filteredProjects.length} projects
      </span>
    </div>

    <div className="projects-table-wrap">
      <table className="projects-table detailed-projects-table">
        <thead>
          <tr>
            <th>Project &amp; Client</th>
            <th>{t('spent')}</th>
            <th>{t('collected')}</th>
            <th>{t('pending')}</th>
            <th>{t('progress')}</th>
            <th>{t('status')}</th>
            <th>{t('timeline')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>

        <tbody>
          {filteredProjects.length === 0 ? (
            <tr>
              <td colSpan={8}>{t('no_projects_found')}</td>
            </tr>
          ) : (
            filteredProjects.map((project) => {
              const { spent, collected, pending, progress, lastPayment } =
                getProjectFinancials(project);

              const client = projectCustomerLookup(project.customer);

              return (
                <tr key={project.id}>
                  <td>
                    <div className="project-client-cell">
                      <div className="project-id-badge">
                        {(project.name || "??").slice(0, 2).toUpperCase()}
                      </div>

                      <div>
                        <strong>{project.name}</strong>
                        <span>{client?.name || "Unknown client"}</span>
                      </div>
                    </div>
                  </td>

                  <td className="amount-cell">
                    ₹{spent.toLocaleString("en-IN")}
                  </td>

                  <td>
                    <span className="collected-pill">
                      ✓ ₹{collected.toLocaleString("en-IN")}
                    </span>
                  </td>

                  <td className="pending-cell">
                    ₹{pending.toLocaleString("en-IN")}
                  </td>

                  <td>
                    <div className="progress-cell">
                      <div className="progress-track">
                        <span
                          style={{ width: `${progress}%` }}
                        ></span>
                      </div>
                      <small>{progress}%</small>
                    </div>
                  </td>

                  <td>
                    <span
                      className={`status-badge ${project.status}`}
                    >
                      {(project.status || "new").replace("_", " ")}
                    </span>
                  </td>

                  <td>
                    <div className="timeline-cell">
                      <div className="timeline-row">
                        <span className="timeline-dot dot-indigo"></span>
                        <div>
                          <small>{t('created')}</small>
                          <strong>
                            {formatShortDate(project.created_at)}
                          </strong>
                        </div>
                      </div>

                      {lastPayment && (
                        <div className="timeline-row">
                          <span className="timeline-dot dot-blue"></span>
                          <div>
                            <small>{t('last_payment')}</small>
                            <strong>
                              {formatShortDate(lastPayment.date)}
                            </strong>
                            <span className="timeline-relative">
                              {formatRelativeDays(lastPayment.date)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action-btn"
                        title={t('view_project')}
                        onClick={() => openProjectDetails(project)}
                      >
                        👁
                      </button>

                      <button
                        type="button"
                        className="row-action-btn"
                        title="Edit project"
                        onClick={() => openEditProject(project)}
                      >
                        ✎
                      </button>

                      <button
                        type="button"
                        className="row-action-btn danger"
                        title="Delete project"
                        onClick={() => deleteProject(project.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  </section>
);

  /* =========================================================
    CREATE PROJECT PAGE
  ========================================================= */

  const createProjectPage = () => (
    <section className="content">
      <div className="customers-header">
        <div>
          <h2>
  {editingProject
    ? t('edit_project')
    : t('create_new_project')}
</h2> 
          <p>{editingProject
  ? t('update_your_project_details')
  : t('create_a_new_project_for_your_customer')}</p>
        </div>

        <button
          className="gold-btn"
          onClick={() => setPage("projects")}
        >
          ← Back to Projects
        </button>
      </div>

      <div className="project-form-card">
        <form onSubmit={saveProject}>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>{t('customer')}</label>

              <select
                value={projectCustomer?.id || ""}
                onChange={handleProjectCustomerChange}
                required
              >
                <option value="">{t('select_customer')}</option>

                {customers.map((customer) => (
                  <option
                    key={customer.id}
                    value={customer.id}
                  >
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
            </div>
                <div className="form-group full-width">
                <label>{t('project_name')}</label>

                    <input
                      type="text"
                      name="name"
                      value={projectForm.name}
                      onChange={handleProjectChange}
                      placeholder="Enter project name"
                      required
                    />
              </div>
            <div className="form-group">
              <label>{t('project_budget')}</label>

                <input
                  type="number"
                  name="budget"
                  value={projectForm.budget}
                  onChange={handleProjectChange}
                  placeholder="Enter project budget"
                  min="0"
                  required
                />
            </div>

            <div className="form-group">
              <label>{t('site_address')}</label>

              <input
                name="site_address"
                value={projectForm.site_address}
                onChange={handleProjectChange}
                placeholder="Enter site address"
                required
              />
            </div>

            <div className="form-group">
              <label>{t('city')}</label>

              <input
                name="city"
                value={projectForm.city}
                onChange={handleProjectChange}
                placeholder="Enter city"
              />
            </div>

            <div className="form-group">
              <label>{t('state')}</label>

              <input
                name="state"
                value={projectForm.state}
                onChange={handleProjectChange}
                placeholder="Enter state"
              />
            </div>

            <div className="form-group">
              <label>{t('pincode')}</label>

              <input
                name="pincode"
                value={projectForm.pincode}
                onChange={handleProjectChange}
                placeholder="Enter pincode"
              />
            </div>

            <div className="form-group">
              <label>{t('status')}</label>

              <select
                name="status"
                value={projectForm.status}
                onChange={handleProjectChange}
              >
                <option value="new">{t('new')}</option>
                <option value="in_progress">
                  In Progress
                </option>
                <option value="completed">{t('completed')}</option>
                <option value="cancelled">{t('cancelled')}</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>{t('notes')}</label>

              <textarea
                name="notes"
                value={projectForm.notes}
                onChange={handleProjectChange}
                placeholder="Enter project notes"
                rows={4}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={() => setPage("projects")}
            >
              Cancel
            </button>

            <button type="submit" className="gold-btn">
  {editingProject
    ? "Update Project"
    : "Save Project"}
</button>
          </div>
        </form>
      </div>
    </section>
  );

/* =========================================================
  QUOTATIONS PAGE
========================================================= */

const quotationsPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{t('quotations')}</h2>
        <p>{t('create_and_manage_client_quotations')}</p>
      </div>

      <div className="quotation-detail-actions">
        <button
          className="small-btn"
          onClick={() => setPage("quotation-clients")}
        >
          Quotation Clients
        </button>

        <button
          className="gold-btn"
          onClick={() => openCreateQuotation()}
        >
          + New Quotation
        </button>
      </div>
    </div>

    <div className="customers-toolbar doc-toolbar">
      <input
        type="text"
        placeholder="Search quotation no, client, subject..."
        value={quotationSearch}
        onChange={(event) => setQuotationSearch(event.target.value)}
      />

      <button
        type="button"
        className={`archive-toggle-btn ${
          showArchivedQuotations ? "active" : ""
        }`}
        onClick={() => setShowArchivedQuotations((previous) => !previous)}
      >
        {showArchivedQuotations ? "▤ Viewing Archived" : "▤ Show Archived"}
      </button>

      <div className="view-toggle">
        <button
          type="button"
          className={quotationViewMode === "grid" ? "active" : ""}
          onClick={() => setQuotationViewMode("grid")}
          title="Grid view"
        >
          ▦
        </button>
        <button
          type="button"
          className={quotationViewMode === "list" ? "active" : ""}
          onClick={() => setQuotationViewMode("list")}
          title="List view"
        >
          ☰
        </button>
      </div>
    </div>

    {filteredQuotations.length === 0 ? (
      <p className="empty-history doc-empty">
        {showArchivedQuotations
          ? "No archived quotations."
          : "No quotations found."}
      </p>
    ) : quotationViewMode === "grid" ? (
      <div className="doc-grid">
        {filteredQuotations.map((quotation) => {
          const client = customers.find(
            (item) => item.id === quotation.customer
          );
          const isArchived = archivedQuotationIds.includes(quotation.id);

          return (
            <div className="doc-card" key={quotation.id}>
              <div className="doc-card-top">
                <span className="doc-card-icon quotation-icon">📄</span>
                <span className="doc-card-date">
                  {formatPrintDate(quotation.date)}
                </span>
              </div>

              <div className="doc-card-body">
                <h3
                  className="doc-card-title"
                  onClick={() => openQuotationDetails(quotation)}
                >
                  {client?.name || "Unnamed Client"}
                  {client?.city ? (
                    <span className="doc-card-title-sub">
                      ({client.city})
                    </span>
                  ) : null}
                </h3>

                <div className="doc-card-amount">
                  ₹{money(quotation.grand_total)}
                </div>

                <div className="doc-card-id">
                  # {quotation.quotation_no}
                </div>

                <select
                  className={`status-select status-${quotation.status} doc-card-status`}
                  value={quotation.status}
                  disabled={quotationStatusUpdating === quotation.id}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updateQuotationStatus(
                      quotation,
                      event.target.value as Quotation["status"]
                    )
                  }
                >
                  {QUOTATION_STATUSES.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {quotationStatusLabel(statusOption)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="doc-card-divider" />

              <div className="doc-card-actions">
                <button
                  className="doc-action view"
                  onClick={() => openQuotationDetails(quotation)}
                >
                  👁 View
                </button>

                <button
                  className="doc-action download"
                  onClick={() => downloadQuotationPdf(quotation)}
                >
                  ⬇ Download
                </button>

                <button
                  className="doc-action archive"
                  onClick={() => toggleArchiveQuotation(quotation.id)}
                >
                  {isArchived ? "↩ Unarchive" : "🗄 Archive"}
                </button>
              </div>

              <div className="doc-card-secondary">
                <button
                  className="doc-link-btn"
                  onClick={() => openEditQuotation(quotation)}
                >
                  Edit
                </button>
                <button
                  className="doc-link-btn danger"
                  onClick={() => deleteQuotation(quotation.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="customers-table-wrap">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Quotation</th>
              <th>{t('client')}</th>
              <th>{t('subject')}</th>
              <th>{t('date')}</th>
              <th>{t('grand_total')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredQuotations.map((quotation) => {
              const client = customers.find(
                (item) => item.id === quotation.customer
              );

              return (
                <tr key={quotation.id}>
                  <td>
                    <strong>{quotation.quotation_no}</strong>
                  </td>

                  <td>{client?.name || "-"}</td>

                  <td>{quotation.subject || "-"}</td>

                  <td className="date-cell">{quotation.date || "-"}</td>

                  <td className="amount-cell">
                    ₹{money(quotation.grand_total)}
                  </td>

                  <td>
                    <select
                      className={`status-select status-${quotation.status}`}
                      value={quotation.status}
                      disabled={quotationStatusUpdating === quotation.id}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        updateQuotationStatus(
                          quotation,
                          event.target.value as Quotation["status"]
                        )
                      }
                    >
                      {QUOTATION_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {quotationStatusLabel(statusOption)}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <button
                      className="small-btn"
                      onClick={() => openQuotationDetails(quotation)}
                    >
                      View
                    </button>

                    <button
                      className="small-btn"
                      onClick={() => downloadQuotationPdf(quotation)}
                    >
                      Download
                    </button>

                    <button
                      className="small-btn"
                      onClick={() => openEditQuotation(quotation)}
                    >
                      Edit
                    </button>

                    <button
                      className="small-btn"
                      onClick={() => toggleArchiveQuotation(quotation.id)}
                    >
                      {archivedQuotationIds.includes(quotation.id)
                        ? "Unarchive"
                        : "Archive"}
                    </button>

                    <button
                      className="danger-btn"
                      onClick={() => deleteQuotation(quotation.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

/* =========================================================
  QUOTATION CLIENTS PAGE
========================================================= */

const quotationClientsPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{t('quotation_clients')}</h2>
        <p>
          You have {quotationClientSummaries.length} client
          {quotationClientSummaries.length === 1 ? "" : "s"} who have asked
          for a quotation
        </p>
      </div>

      <button className="gold-btn" onClick={() => setPage("quotations")}>
        ← Back to Quotations
      </button>
    </div>

    <div className="client-stats-grid">
      <div className="client-stat-card">
        <span>{t('quotation_clients')}</span>
        <strong>{quotationClientSummaries.length}</strong>
        <small>{t('clients_who_have_requested_a_quotation')}</small>
      </div>

      <div className="client-stat-card">
        <span>{t('accepted')}</span>
        <strong>{quotationClientsAcceptedCount}</strong>
        <small>{t('latest_quotation_accepted')}</small>
      </div>

      <div className="client-stat-card">
        <span>{t('pending')}</span>
        <strong>{quotationClientsPendingCount}</strong>
        <small>{t('still_draft_or_sent')}</small>
      </div>

      <div className="client-stat-card">
        <span>{t('total_quotation_value')}</span>
        <strong>₹{money(quotationClientsTotalValue)}</strong>
        <small>Across all quotations</small>
      </div>
    </div>

    <div className="customers-toolbar">
      <input
        type="text"
        placeholder="Search by name, phone, email, city..."
        value={quotationClientSearch}
        onChange={(event) => setQuotationClientSearch(event.target.value)}
      />
    </div>

    <div className="customers-table-wrap">
      <table className="customers-table">
        <thead>
          <tr>
            <th>{t('client')}</th>
            <th>{t('contact')}</th>
            <th>{t('location')}</th>
            <th>{t('quotations')}</th>
            <th>{t('total_value')}</th>
            <th>{t('latest_status')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>

        <tbody>
          {filteredQuotationClients.length === 0 ? (
            <tr>
              <td colSpan={7}>
                No clients have asked for a quotation yet.
              </td>
            </tr>
          ) : (
            filteredQuotationClients.map((summary) => (
              <tr key={summary.customer.id}>
                <td>
                  <strong>{summary.customer.name}</strong>
                </td>

                <td>
                  {summary.customer.phone}
                  {summary.customer.email ? (
                    <>
                      <br />
                      {summary.customer.email}
                    </>
                  ) : null}
                </td>

                <td>
                  {summary.customer.city || summary.customer.state
                    ? `${summary.customer.city || ""}${
                        summary.customer.city && summary.customer.state
                          ? ", "
                          : ""
                      }${summary.customer.state || ""}`
                    : "-"}
                </td>

                <td>{summary.quotationCount}</td>

                <td className="amount-cell">₹{money(summary.totalValue)}</td>

                <td>
                  <span
                    className={`status-badge ${summary.latestStatus}`}
                  >
                    {summary.latestStatus}
                  </span>
                </td>

                <td>
                  <button
                    className="small-btn"
                    onClick={() => {
                      setQuotationSearch(summary.customer.name);
                      setPage("quotations");
                    }}
                  >
                    View Quotations
                  </button>

                  <button
                    className="small-btn"
                    onClick={() => openClientProfile(summary.customer.id)}
                  >
                    Client Profile
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);

const quotationFormPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>
          {editingQuotation ? t('edit_quotation') : t('create_new_quotation')}
        </h2>
        <p>
          {editingQuotation
            ? "Update quotation details"
            : "Build a quotation for your customer"}
        </p>
      </div>

      <button
        className="gold-btn"
        onClick={() => setPage("quotations")}
      >
        ← Back to Quotations
      </button>
    </div>

    <div className="project-form-card">
      <form onSubmit={saveQuotation}>
        <div className="form-grid">
          <div className="form-group customer-field-group">
            <label>{t('customer')}</label>

            <div className="customer-mode-toggle">
              <button
                type="button"
                className={!useManualCustomer ? "mode-btn active" : "mode-btn"}
                onClick={() => toggleManualCustomer(false)}
              >
                Existing Customer
              </button>
              <button
                type="button"
                className={useManualCustomer ? "mode-btn active" : "mode-btn"}
                onClick={() => toggleManualCustomer(true)}
              >
                Type Name Manually
              </button>
            </div>

            {useManualCustomer ? (
              <div className="manual-customer-fields">
                <input
                  name="name"
                  value={manualCustomerForm.name}
                  onChange={handleManualCustomerChange}
                  placeholder="Customer / vendor name"
                  required
                />
                <input
                  name="phone"
                  value={manualCustomerForm.phone}
                  onChange={handleManualCustomerChange}
                  placeholder="Phone (optional)"
                />
                <small className="field-hint">
                  A lightweight customer record is created automatically when
                  you save this quotation.
                </small>
              </div>
            ) : (
              <select
                value={quotationCustomer?.id || ""}
                onChange={handleQuotationCustomerChange}
                required
              >
                <option value="">{t('select_customer')}</option>

                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>{t('project_optional')}</label>

            <select
              value={quotationProject?.id || ""}
              onChange={handleQuotationProjectChange}
              disabled={useManualCustomer}
            >
              <option value="">
                {useManualCustomer ? "Not available for manual customers" : "No project linked"}
              </option>

              {!useManualCustomer &&
                projects
                  .filter(
                    (project) =>
                      !quotationCustomer ||
                      Number(project.customer) === Number(quotationCustomer.id)
                  )
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('quotation_no')}</label>

            <input
              name="quotation_no"
              value={quotationForm.quotation_no}
              onChange={handleQuotationChange}
              placeholder="e.g. WD2601"
              required
            />
          </div>

          <div className="form-group">
            <label>{t('date')}</label>

            <input
              type="date"
              name="date"
              value={quotationForm.date}
              onChange={handleQuotationChange}
              required
            />
          </div>

          <div className="form-group">
            <label>{t('subject')}</label>

            <input
              name="subject"
              value={quotationForm.subject}
              onChange={handleQuotationChange}
              placeholder="e.g. UPVC WINDOWS"
            />
          </div>

          <div className="form-group">
            <label>{t('phone')}</label>

            <input
              name="phone"
              value={quotationForm.phone}
              onChange={handleQuotationChange}
              placeholder="Client phone"
            />
          </div>

          <div className="form-group">
            <label>GST %</label>

            <input
              type="number"
              name="gst_percent"
              value={quotationForm.gst_percent}
              onChange={handleQuotationChange}
              min="0"
              step="0.01"
            />
          </div>

          <div className="form-group">
            <label>{t('status')}</label>

            <select
              name="status"
              value={quotationForm.status}
              onChange={handleQuotationChange}
            >
              <option value="draft">{t('draft')}</option>
              <option value="sent">{t('sent')}</option>
              <option value="accepted">{t('accepted')}</option>
              <option value="rejected">{t('rejected')}</option>
            </select>
          </div>
        </div>

        <div className="quotation-items-header">
          <h3>{t('items')}</h3>

          <div className="quotation-items-actions">
            <button
              type="button"
              className="small-btn product-pick-btn"
              onClick={() => openProductPicker("quotation")}
            >
              ▣ {t('add_from_products')}
            </button>

            <button
              type="button"
              className="small-btn"
              onClick={() =>
                addQuotationItem(
                  quotationItems[quotationItems.length - 1]?.category || ""
                )
              }
            >
              + Add Row
            </button>

            <button
              type="button"
              className="small-btn"
              onClick={() => addQuotationItem("")}
            >
              + New Category
            </button>
          </div>
        </div>

        <div className="history-table-wrapper">
          <table className="quotation-items-table has-product-col">
            <thead>
              <tr>
                <th>{t('product')}</th>
                <th>{t('category')}</th>
                <th>{t('width')}</th>
                <th>{t('height')}</th>
                <th>{t('qty')}</th>
                <th>{t('area')}</th>
                <th>{t('rate')}</th>
                <th>{t('total')}</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {quotationItems.map((item, index) => {
                const area = calcItemArea(item);
                const total = calcItemTotal(item);

                return (
                  <tr key={index}>
                    <td className="qi-product-cell">
                      <div className="qi-product">
                        <ProductThumb
                          src={item.product_image}
                          name={item.product_name}
                        />
                        <select
                          value={item.product ?? ""}
                          onChange={(event) =>
                            handleQuotationItemProduct(
                              index,
                              event.target.value
                            )
                          }
                        >
                          <option value="">{t('custom_item')}</option>
                          {renderProductOptions(
                            item.product,
                            item.product_name
                          )}
                        </select>
                      </div>
                    </td>

                    <td>
                      <input
                        name="category"
                        value={item.category}
                        onChange={(event) =>
                          handleQuotationItemChange(index, event)
                        }
                        placeholder="Category (e.g. DOUBLE OPENABLE WINDOWS)"
                      />
                    </td>

                    <td>
                      <input
                        name="width"
                        value={item.width}
                        onChange={(event) =>
                          handleQuotationItemChange(index, event)
                        }
                        placeholder="ft"
                        inputMode="decimal"
                      />
                    </td>

                    <td>
                      <input
                        name="height"
                        value={item.height}
                        onChange={(event) =>
                          handleQuotationItemChange(index, event)
                        }
                        placeholder="ft"
                        inputMode="decimal"
                      />
                    </td>

                    <td>
                      <input
                        name="qty"
                        value={item.qty}
                        onChange={(event) =>
                          handleQuotationItemChange(index, event)
                        }
                        inputMode="decimal"
                      />
                    </td>

                    <td className="quotation-readonly-cell">
                      {area > 0 ? money(area) : "-"}
                    </td>

                    <td>
                      <input
                        name="rate"
                        value={item.rate}
                        onChange={(event) =>
                          handleQuotationItemChange(index, event)
                        }
                        inputMode="decimal"
                      />
                    </td>

                    <td className="quotation-readonly-cell">
                      ₹{money(total)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => removeQuotationItem(index)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="quotation-totals">
          <div>
            <span>{t('subtotal')}</span>
            <strong>₹{money(quotationSubtotal)}</strong>
          </div>

          <div>
            <span>GST {quotationForm.gst_percent || 0}%</span>
            <strong>₹{money(quotationGstAmount)}</strong>
          </div>

          <div className="quotation-grand-total">
            <span>{t('grand_total')}</span>
            <strong>₹{money(quotationGrandTotal)}</strong>
          </div>
        </div>

        <div className="form-grid quotation-terms-grid">
          <div className="form-group full-width">
            <label>Terms &amp; Conditions</label>

            <textarea
              name="terms"
              value={quotationForm.terms}
              onChange={handleQuotationChange}
              rows={7}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={() => setPage("quotations")}
          >
            Cancel
          </button>

          <button type="submit" className="gold-btn">
            {editingQuotation ? t('update_quotation') : t('save_quotation')}
          </button>
        </div>
      </form>
    </div>
  </section>
);

const quotationDetailsPage = () => {
  if (!selectedQuotation) {
    return (
      <section className="content">
        <div className="customers-header">
          <div>
            <h2>Quotation</h2>
            <p>{t('quotation_not_found')}</p>
          </div>
        </div>

        <div className="panel empty-state-panel">
          <p>{t('no_quotation_selected')}</p>

          <button
            className="primary-btn"
            onClick={() => setPage("quotations")}
          >
            Back to Quotations
          </button>
        </div>
      </section>
    );
  }

  const client = customers.find(
    (item) => item.id === selectedQuotation.customer
  );
  const project = projects.find(
    (item) => item.id === selectedQuotation.project
  );
  const groupedItems = groupQuotationItems(selectedQuotation.items || []);
  const showImages = itemsHaveImages(selectedQuotation.items || []);

  let sNo = 0;

  return (
    <section className="content">
      <div className="customers-header">
        <div>
          <h2>Quotation {selectedQuotation.quotation_no}</h2>
          <p>
            {client?.name || "-"} · {selectedQuotation.subject || "-"}
          </p>
        </div>

        <div className="quotation-detail-actions">
          <button
            className="small-btn"
            onClick={() => openEditQuotation(selectedQuotation)}
          >
            Edit
          </button>

          <button className="gold-btn" onClick={() => downloadQuotationPdf()}>
            Download / Print
          </button>

          <button
            type="button"
            className="gold-btn convert-to-invoice-btn"
            disabled={convertingQuotationId === selectedQuotation.id}
            onClick={() => convertQuotationToInvoice(selectedQuotation)}
            title="Create an invoice with the same items and photos — nothing to retype."
          >
            {convertingQuotationId === selectedQuotation.id
              ? "Creating invoice…"
              : "Convert to Invoice"}
          </button>

          <button
            className="cancel-btn"
            onClick={() => setPage("quotations")}
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{t('quotation_information')}</h2>
          </div>
        </div>

        <div className="project-info-grid">
          <div>
            <span>{t('client')}</span>
            <strong>{client?.name || "-"}</strong>
          </div>

          <div>
            <span>{t('phone')}</span>
            <strong>
              {selectedQuotation.phone || client?.phone || "-"}
            </strong>
          </div>

          <div>
            <span>{t('date')}</span>
            <strong>{selectedQuotation.date || "-"}</strong>
          </div>

          <div>
            <span>{t('subject')}</span>
            <strong>{selectedQuotation.subject || "-"}</strong>
          </div>

          <div>
            <span>{t('project')}</span>
            <strong>{project?.name || "-"}</strong>
          </div>

          <div className="quotation-status-field">
            <span>{t('status')}</span>
            <div className="quotation-status-buttons">
              {QUOTATION_STATUSES.map((statusOption) => (
                <button
                  key={statusOption}
                  type="button"
                  className={`status-pill status-${statusOption} ${
                    selectedQuotation.status === statusOption ? "active" : ""
                  }`}
                  disabled={
                    quotationStatusUpdating === selectedQuotation.id
                  }
                  onClick={() =>
                    updateQuotationStatus(selectedQuotation, statusOption)
                  }
                >
                  {quotationStatusLabel(statusOption)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{t('items')}</h2>
          </div>
        </div>

        <div className="history-table-wrapper">
          <table className="history-table quotation-view-table">
            <thead>
              <tr>
                <th>{t('s_no')}</th>
                {showImages && <th>{t('image')}</th>}
                <th>{t('width')}</th>
                <th>{t('height')}</th>
                <th>{t('qty')}</th>
                <th>{t('area_sq_ft')}</th>
                <th>{t('rate')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>

            <tbody>
              {groupedItems.map((group, groupIndex) => (
                <Fragment key={groupIndex}>
                  <tr className="quotation-category-row">
                    <td colSpan={showImages ? 8 : 7}>{group.category}</td>
                  </tr>

                  {group.items.map((item) => {
                    sNo += 1;

                    return (
                      <tr key={item.id ?? `${groupIndex}-${sNo}`}>
                        <td>{sNo}</td>
                        {showImages && (
                          <td>
                            <ProductThumb
                              src={item.product_image}
                              name={item.product_name}
                            />
                          </td>
                        )}
                        <td>{item.width || "-"}</td>
                        <td>{item.height || "-"}</td>
                        <td>{item.qty}</td>
                        <td>
                          {item.area ? money(item.area) : "-"}
                        </td>
                        <td>₹{money(item.rate)}</td>
                        <td className="amount-cell">
                          ₹{money(item.total)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="quotation-totals">
          <div>
            <span>{t('subtotal')}</span>
            <strong>₹{money(selectedQuotation.subtotal)}</strong>
          </div>

          <div>
            <span>GST {selectedQuotation.gst_percent}%</span>
            <strong>₹{money(selectedQuotation.gst_amount)}</strong>
          </div>

          <div className="quotation-grand-total">
            <span>{t('grand_total')}</span>
            <strong>₹{money(selectedQuotation.grand_total)}</strong>
          </div>
        </div>
      </div>

      {selectedQuotation.terms && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Terms &amp; Conditions</h2>
            </div>
          </div>

          <div className="quotation-terms">
            {selectedQuotation.terms
              .split("\n")
              .filter((line) => line.trim())
              .map((line, index) => (
                <p key={index}>{line}</p>
              ))}
          </div>
        </div>
      )}
    </section>
  );
};

/* =========================================================
  INVOICES PAGE
========================================================= */

const invoicesPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{t('invoices')}</h2>
        <p>{t('create_and_track_client_invoices')}</p>
      </div>

      <button className="gold-btn" onClick={() => openCreateInvoice()}>
        + New Invoice
      </button>
    </div>

    <div className="customers-toolbar doc-toolbar">
      <input
        type="text"
        placeholder="Search invoice no, client..."
        value={invoiceSearch}
        onChange={(event) => setInvoiceSearch(event.target.value)}
      />

      <button
        type="button"
        className={`archive-toggle-btn ${
          showArchivedInvoices ? "active" : ""
        }`}
        onClick={() => setShowArchivedInvoices((previous) => !previous)}
      >
        {showArchivedInvoices ? "▤ Viewing Archived" : "▤ Show Archived"}
      </button>

      <div className="view-toggle">
        <button
          type="button"
          className={invoiceViewMode === "grid" ? "active" : ""}
          onClick={() => setInvoiceViewMode("grid")}
          title="Grid view"
        >
          ▦
        </button>
        <button
          type="button"
          className={invoiceViewMode === "list" ? "active" : ""}
          onClick={() => setInvoiceViewMode("list")}
          title="List view"
        >
          ☰
        </button>
      </div>
    </div>

    {filteredInvoices.length === 0 ? (
      <p className="empty-history doc-empty">
        {showArchivedInvoices
          ? "No archived invoices."
          : "No invoices found."}
      </p>
    ) : invoiceViewMode === "grid" ? (
      <div className="doc-grid">
        {filteredInvoices.map((invoice) => {
          const client = customers.find(
            (item) => item.id === invoice.customer
          );
          const isArchived = archivedInvoiceIds.includes(invoice.id);

          return (
            <div className="doc-card" key={invoice.id}>
              <div className="doc-card-top">
                <span className="doc-card-icon invoice-icon">📄</span>
                <span className="doc-card-date">
                  {formatPrintDate(invoice.invoice_date)}
                </span>
              </div>

              <div className="doc-card-body">
                <h3
                  className="doc-card-title"
                  onClick={() => openInvoiceDetails(invoice)}
                >
                  {client?.name || "Unnamed Client"}
                  {client?.city ? (
                    <span className="doc-card-title-sub">
                      ({client.city})
                    </span>
                  ) : null}
                </h3>

                <div className="doc-card-amount">
                  ₹{money(invoice.grand_total)}
                </div>

                <div className="doc-card-id"># {invoice.invoice_no}</div>

                <select
                  className={`status-select status-${invoice.status} doc-card-status`}
                  value={invoice.status}
                  disabled={invoiceStatusUpdating === invoice.id}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updateInvoiceStatus(
                      invoice,
                      event.target.value as Invoice["status"]
                    )
                  }
                >
                  {INVOICE_STATUSES.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {invoiceStatusLabel(statusOption)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="doc-card-divider" />

              <div className="doc-card-actions">
                <button
                  className="doc-action view"
                  onClick={() => openInvoiceDetails(invoice)}
                >
                  👁 View
                </button>

                <button
                  className="doc-action download"
                  onClick={() => downloadInvoicePdf(invoice)}
                >
                  ⬇ Download
                </button>

                <button
                  className="doc-action archive"
                  onClick={() => toggleArchiveInvoice(invoice.id)}
                >
                  {isArchived ? "↩ Unarchive" : "🗄 Archive"}
                </button>
              </div>

              <div className="doc-card-secondary">
                <button
                  className="doc-link-btn"
                  onClick={() => openEditInvoice(invoice)}
                >
                  Edit
                </button>
                <button
                  className="doc-link-btn danger"
                  onClick={() => deleteInvoice(invoice.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="customers-table-wrap">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>{t('client')}</th>
              <th>{t('date')}</th>
              <th>{t('due_date')}</th>
              <th>{t('grand_total')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredInvoices.map((invoice) => {
              const client = customers.find(
                (item) => item.id === invoice.customer
              );

              return (
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.invoice_no}</strong>
                  </td>

                  <td>{client?.name || "-"}</td>

                  <td className="date-cell">{invoice.invoice_date || "-"}</td>

                  <td className="date-cell">{invoice.due_date || "-"}</td>

                  <td className="amount-cell">
                    ₹{money(invoice.grand_total)}
                  </td>

                  <td>
                    <select
                      className={`status-select status-${invoice.status}`}
                      value={invoice.status}
                      disabled={invoiceStatusUpdating === invoice.id}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        updateInvoiceStatus(
                          invoice,
                          event.target.value as Invoice["status"]
                        )
                      }
                    >
                      {INVOICE_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {invoiceStatusLabel(statusOption)}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <button
                      className="small-btn"
                      onClick={() => openInvoiceDetails(invoice)}
                    >
                      View
                    </button>

                    <button
                      className="small-btn"
                      onClick={() => downloadInvoicePdf(invoice)}
                    >
                      Download
                    </button>

                    <button
                      className="small-btn"
                      onClick={() => openEditInvoice(invoice)}
                    >
                      Edit
                    </button>

                    <button
                      className="small-btn"
                      onClick={() => toggleArchiveInvoice(invoice.id)}
                    >
                      {archivedInvoiceIds.includes(invoice.id)
                        ? "Unarchive"
                        : "Archive"}
                    </button>

                    <button
                      className="danger-btn"
                      onClick={() => deleteInvoice(invoice.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

/* =========================================================
  PAYMENTS PAGE
========================================================= */

const paymentsPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{t('payments')}</h2>
        <p>Track collections, receipts &amp; payment modes</p>
      </div>

      <button className="gold-btn" onClick={() => openPaymentForm()}>
        + Record Payment
      </button>
    </div>

    <div className="payments-summary">
      <div className="payments-summary-card">
        <span>{t('total_collected')}</span>
        <strong>₹{money(paymentsGrandTotal)}</strong>
      </div>

      <div className="payments-summary-card">
        <span>{t('transactions')}</span>
        <strong>{payments.length}</strong>
      </div>

      <div className="payments-summary-card">
        <span>{t('this_month')}</span>
        <strong>₹{money(paymentsThisMonthTotal)}</strong>
      </div>

      <div className="payments-summary-card">
        <span>{t('projects_paid')}</span>
        <strong>{paymentsDistinctProjectCount}</strong>
      </div>
    </div>

    <div className="customers-toolbar doc-toolbar payments-toolbar">
      <select
        className="project-filter-select"
        value={paymentProjectFilter}
        onChange={(event) =>
          setPaymentProjectFilter(
            event.target.value === "all"
              ? "all"
              : Number(event.target.value)
          )
        }
      >
        <option value="all">{t('all_clients_projects')}</option>

        {projects.map((project) => {
          const client = customers.find(
            (item) => item.id === project.customer
          );

          return (
            <option key={project.id} value={project.id}>
              {client ? `${client.name} — ` : ""}
              {project.name}
            </option>
          );
        })}
      </select>

      <input
        type="text"
        placeholder="Search project, client..."
        value={paymentSearch}
        onChange={(event) => setPaymentSearch(event.target.value)}
      />

      <div className="mode-filter-chips">
        {(
          [
            { key: "all", label: "All" },
            { key: "cash", label: "Cash" },
            { key: "bank_transfer", label: "Bank" },
            { key: "upi", label: "Online/UPI" },
            { key: "cheque", label: "Cheque" },
          ] as const
        ).map((option) => (
          <button
            type="button"
            key={option.key}
            className={`mode-chip ${
              paymentModeFilter === option.key ? "active" : ""
            }`}
            onClick={() => setPaymentModeFilter(option.key)}
          >
            {option.label}
            <span className="chip-count">
              {paymentModeCounts[option.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="view-toggle">
        <button
          type="button"
          className={paymentViewMode === "list" ? "active" : ""}
          onClick={() => setPaymentViewMode("list")}
          title="List view"
        >
          ☰
        </button>
        <button
          type="button"
          className={paymentViewMode === "grid" ? "active" : ""}
          onClick={() => setPaymentViewMode("grid")}
          title="Grid view"
        >
          ▦
        </button>
      </div>
    </div>

    {filteredPayments.length === 0 ? (
      <p className="empty-history doc-empty">
        {payments.length === 0
          ? "No payments recorded yet. Click “Record Payment” to add one."
          : "No payments match your search or filters."}
      </p>
    ) : paymentViewMode === "list" ? (
      <div className="payments-table-wrapper">
        <table className="customers-table payments-table">
          <thead>
            <tr>
              <th>Project &amp; Client</th>
              <th>{t('date')}</th>
              <th>{t('payment_mode')}</th>
              <th>{t('amount')}</th>
              <th>{t('receipt')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredPayments.map((payment) => {
              const project = projects.find(
                (item) => item.id === payment.project
              );
              const client = customers.find(
                (item) => item.id === project?.customer
              );

              return (
                <tr key={payment.id}>
                  <td className="payment-project-cell">
                    <strong>
                      {project?.name || `Project #${payment.project}`}
                    </strong>
                    <span>{client?.name || "Unknown client"}</span>
                  </td>

                  <td className="date-cell">
                    {formatShortDate(payment.date)}
                  </td>

                  <td>
                    <span
                      className={`payment-mode-badge mode-${
                        payment.mode || "other"
                      }`}
                    >
                      {paymentModeLabel(payment.mode)}
                    </span>
                  </td>

                  <td>
                    <div className="payment-amount-cell">
                      <span className="payment-amount-value">
                        ₹{money2(payment.amount)}
                      </span>
                      <span className="received-tag">{t('received')}</span>
                    </div>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => downloadPaymentReceiptForRow(payment)}
                    >
                      PDF
                    </button>
                  </td>

                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action-btn"
                        title="Edit payment"
                        onClick={() => openEditPayment(payment)}
                      >
                        ✎
                      </button>

                      <button
                        type="button"
                        className="row-action-btn"
                        title={t('download_receipt')}
                        onClick={() => downloadPaymentReceiptForRow(payment)}
                      >
                        ⬇
                      </button>

                      <button
                        type="button"
                        className="row-action-btn danger"
                        title="Delete payment"
                        onClick={() => deletePayment(payment.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={3} className="payments-total-label">
                <span className="payments-total-text">
                  🧮 Total Collections ({filteredPayments.length} transactions)
                </span>
              </td>
              {/* Sits in the Amount column so the total lines up with the
                  amounts above it. */}
              <td className="payments-total-value">
                ₹{money2(filteredPaymentsTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="doc-grid">
        {filteredPayments.map((payment) => {
          const project = projects.find(
            (item) => item.id === payment.project
          );
          const client = customers.find(
            (item) => item.id === project?.customer
          );

          return (
            <div className="doc-card payment-card" key={payment.id}>
              <div className="doc-card-top">
                <span className="doc-card-icon payment-icon">₹</span>
                <span className="doc-card-date">
                  {formatShortDate(payment.date)}
                </span>
              </div>

              <div className="doc-card-body">
                <h3 className="doc-card-title">
                  {project?.name || `Project #${payment.project}`}
                  {client?.name ? (
                    <span className="doc-card-title-sub">
                      ({client.name})
                    </span>
                  ) : null}
                </h3>

                <div className="doc-card-amount">
                  ₹{money(payment.amount)}
                </div>

                <div className="doc-card-id">
                  <span
                    className={`payment-mode-badge mode-${
                      payment.mode || "other"
                    }`}
                  >
                    {paymentModeLabel(payment.mode)}
                  </span>
                </div>
              </div>

              <div className="doc-card-divider" />

              <div className="doc-card-actions">
                <button
                  className="doc-action receipt"
                  onClick={() => downloadPaymentReceiptForRow(payment)}
                >
                  🧾 Receipt
                </button>

                <button
                  className="doc-action view"
                  onClick={() => openEditPayment(payment)}
                >
                  ✎ Edit
                </button>
              </div>

              <div className="doc-card-secondary">
                <button
                  className="doc-link-btn danger"
                  onClick={() => deletePayment(payment.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </section>
);

const spendPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{t('spend')}</h2>
        <p>Track project expenses by category</p>
      </div>

      <button className="gold-btn" onClick={() => openSpendForm()}>
        + {t('add_spend')}
      </button>
    </div>

    <div className="payments-summary">
      <div className="payments-summary-card">
        <span>{t('total_spend')}</span>
        <strong>₹{money(dashboardTotalSpend)}</strong>
      </div>

      <div className="payments-summary-card">
        <span>{t('transactions')}</span>
        <strong>{expenses.length}</strong>
      </div>

      <div className="payments-summary-card">
        <span>{t('this_month')}</span>
        <strong>₹{money(spendThisMonthTotal)}</strong>
      </div>

      <div className="payments-summary-card">
        <span>{t('projects_with_spend')}</span>
        <strong>{spendDistinctProjectCount}</strong>
      </div>
    </div>

    <div className="customers-toolbar doc-toolbar payments-toolbar">
      <select
        className="project-filter-select"
        value={spendProjectFilter}
        onChange={(event) =>
          setSpendProjectFilter(
            event.target.value === "all" ? "all" : Number(event.target.value)
          )
        }
      >
        <option value="all">{t('all_clients_projects')}</option>

        {projects.map((project) => {
          const client = customers.find(
            (item) => item.id === project.customer
          );

          return (
            <option key={project.id} value={project.id}>
              {client ? `${client.name} — ` : ""}
              {project.name}
            </option>
          );
        })}
      </select>

      <input
        type="text"
        placeholder="Search expense, project, client..."
        value={spendSearch}
        onChange={(event) => setSpendSearch(event.target.value)}
      />

      <div className="mode-filter-chips">
        {[
          { key: "all", label: "All" },
          ...SPEND_CATEGORIES.map((category) => ({
            key: category,
            label: expenseCategoryLabel(category),
          })),
        ].map((option) => (
          <button
            type="button"
            key={option.key}
            className={`mode-chip ${
              spendCategoryFilter === option.key ? "active" : ""
            }`}
            onClick={() => setSpendCategoryFilter(option.key)}
          >
            {option.label}
            <span className="chip-count">
              {spendCategoryCounts[option.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="view-toggle">
        <button
          type="button"
          className={spendViewMode === "list" ? "active" : ""}
          onClick={() => setSpendViewMode("list")}
          title="List view"
        >
          ☰
        </button>
        <button
          type="button"
          className={spendViewMode === "grid" ? "active" : ""}
          onClick={() => setSpendViewMode("grid")}
          title="Grid view"
        >
          ▦
        </button>
      </div>
    </div>

    {filteredExpenses.length === 0 ? (
      <p className="empty-history doc-empty">
        {expenses.length === 0
          ? "No spend recorded yet. Click “Add Spend” to add one."
          : "No spend matches your search or filters."}
      </p>
    ) : spendViewMode === "list" ? (
      <div className="payments-table-wrapper">
        <table className="customers-table payments-table">
          <thead>
            <tr>
              <th>Expense &amp; Project</th>
              <th>{t('date')}</th>
              <th>{t('category')}</th>
              <th>{t('amount')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredExpenses.map((expense) => {
              const project = projects.find(
                (item) => item.id === expense.project
              );
              const client = customers.find(
                (item) => item.id === project?.customer
              );

              return (
                <tr key={expense.id}>
                  <td className="payment-project-cell">
                    <strong>
                      {expense.title || expense.category || "Expense"}
                    </strong>
                    <span>
                      {project?.name || `Project #${expense.project}`}
                      {client?.name ? ` · ${client.name}` : ""}
                    </span>
                  </td>

                  <td className="date-cell">
                    {formatShortDate(expense.date)}
                  </td>

                  <td>
                    <span
                      className={`expense-category-badge cat-${(
                        expense.category || "other"
                      ).toLowerCase()}`}
                    >
                      {expenseCategoryLabel(expense.category)}
                    </span>
                  </td>

                  <td>
                    <span className="expense-amount-value">
                      ₹{money2(expense.amount)}
                    </span>
                  </td>

                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action-btn"
                        title="Edit spend"
                        onClick={() => openEditSpend(expense)}
                      >
                        ✎
                      </button>

                      <button
                        type="button"
                        className="row-action-btn danger"
                        title="Delete spend"
                        onClick={() => deleteSpend(expense.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={3} className="payments-total-label">
                <span className="payments-total-text">
                  🧮 Total Spend ({filteredExpenses.length} transactions)
                </span>
              </td>
              {/* Sits in the Amount column so the total lines up with the
                  amounts above it. */}
              <td className="payments-total-value expense-total-value">
                ₹{money2(filteredExpensesTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="doc-grid">
        {filteredExpenses.map((expense) => {
          const project = projects.find(
            (item) => item.id === expense.project
          );
          const client = customers.find(
            (item) => item.id === project?.customer
          );

          return (
            <div className="doc-card expense-card" key={expense.id}>
              <div className="doc-card-top">
                <span className="doc-card-icon expense-icon">▤</span>
                <span className="doc-card-date">
                  {formatShortDate(expense.date)}
                </span>
              </div>

              <div className="doc-card-body">
                <h3 className="doc-card-title">
                  {expense.title || expense.category || "Expense"}
                  <span className="doc-card-title-sub">
                    ({project?.name || `Project #${expense.project}`}
                    {client?.name ? ` · ${client.name}` : ""})
                  </span>
                </h3>

                <div className="doc-card-amount expense-card-amount">
                  ₹{money(expense.amount)}
                </div>

                <div className="doc-card-id">
                  <span
                    className={`expense-category-badge cat-${(
                      expense.category || "other"
                    ).toLowerCase()}`}
                  >
                    {expenseCategoryLabel(expense.category)}
                  </span>
                </div>
              </div>

              <div className="doc-card-divider" />

              <div className="doc-card-actions">
                <button
                  className="doc-action view"
                  onClick={() => openEditSpend(expense)}
                >
                  ✎ Edit
                </button>
              </div>

              <div className="doc-card-secondary">
                <button
                  className="doc-link-btn danger"
                  onClick={() => deleteSpend(expense.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </section>
);

const invoiceFormPage = () => (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{editingInvoice ? t('edit_invoice') : t('create_new_invoice')}</h2>
        <p>
          {editingInvoice
            ? "Update invoice details"
            : "Bill a customer for completed work"}
        </p>
      </div>

      <button className="gold-btn" onClick={() => setPage("invoices")}>
        ← Back to Invoices
      </button>
    </div>

    <div className="project-form-card">
      <form onSubmit={saveInvoice}>
        <div className="form-grid">
          <div className="form-group">
            <label>{t('customer')}</label>

            <select
              value={invoiceCustomer?.id || ""}
              onChange={handleInvoiceCustomerChange}
              required
            >
              <option value="">{t('select_customer')}</option>

              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} - {customer.phone}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('project_optional')}</label>

            <select
              value={invoiceProject?.id || ""}
              onChange={handleInvoiceProjectChange}
            >
              <option value="">{t('no_project_linked')}</option>

              {projects
                .filter(
                  (project) =>
                    !invoiceCustomer ||
                    Number(project.customer) === Number(invoiceCustomer.id)
                )
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('invoice_no')}</label>

            <input
              name="invoice_no"
              value={invoiceForm.invoice_no}
              onChange={handleInvoiceChange}
              placeholder="e.g. INV2601"
              required
            />
          </div>

          <div className="form-group">
            <label>{t('invoice_date')}</label>

            <input
              type="date"
              name="invoice_date"
              value={invoiceForm.invoice_date}
              onChange={handleInvoiceChange}
              required
            />
          </div>

          <div className="form-group">
            <label>{t('due_date')}</label>

            <input
              type="date"
              name="due_date"
              value={invoiceForm.due_date}
              onChange={handleInvoiceChange}
            />
          </div>

          <div className="form-group">
            <label>{t('status')}</label>

            <select
              name="status"
              value={invoiceForm.status}
              onChange={handleInvoiceChange}
            >
              {INVOICE_STATUSES.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {invoiceStatusLabel(statusOption)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="quotation-items-header">
          <h3>{t('company_details')}</h3>
        </div>

        <div className="project-info-grid">
          <div>
            <span>{t('company')}</span>
            <strong>{company.name}</strong>
          </div>

          <div>
            <span>{t('address')}</span>
            <strong>{company.address || "Not set - add it in Settings"}</strong>
          </div>

          <div>
            <span>{t('phone')}</span>
            <strong>{company.phone || "Not set - add it in Settings"}</strong>
          </div>

          <div>
            <span>{t('gst_number')}</span>
            <strong>{company.gstNumber || "Not registered"}</strong>
          </div>
        </div>

        <div className="quotation-items-header">
          <h3>{t('items')}</h3>

          <div className="quotation-items-actions">
            <button
              type="button"
              className="small-btn product-pick-btn"
              onClick={() => openProductPicker("invoice")}
            >
              ▣ {t('add_from_products')}
            </button>

            <button
              type="button"
              className="small-btn"
              onClick={addInvoiceItem}
            >
              + Add Item
            </button>
          </div>
        </div>

        <div className="history-table-wrapper">
          <table className="quotation-items-table has-product-col">
            <thead>
              <tr>
                <th>{t('product')}</th>
                <th>{t('description')}</th>
                <th>{t('width')}</th>
                <th>{t('height')}</th>
                <th>{t('qty')}</th>
                <th>{t('area')}</th>
                <th>{t('unit')}</th>
                <th>{t('rate')}</th>
                <th>{t('amount')}</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {invoiceItems.map((item, index) => {
                const amount = calcInvoiceItemAmount(item);
                const area = calcInvoiceItemArea(item);

                return (
                  <tr key={index}>
                    <td className="qi-product-cell">
                      <div className="qi-product">
                        <ProductThumb
                          src={item.product_image}
                          name={item.product_name}
                        />
                        <select
                          value={item.product ?? ""}
                          onChange={(event) =>
                            handleInvoiceItemProduct(
                              index,
                              event.target.value
                            )
                          }
                        >
                          <option value="">{t('custom_item')}</option>
                          {renderProductOptions(
                            item.product,
                            item.product_name
                          )}
                        </select>
                      </div>
                    </td>

                    <td>
                      <input
                        name="description"
                        value={item.description}
                        onChange={(event) =>
                          handleInvoiceItemChange(index, event)
                        }
                        placeholder="e.g. Supply & install UPVC window"
                      />
                    </td>

                    <td>
                      <input
                        name="width"
                        value={item.width ?? ""}
                        onChange={(event) =>
                          handleInvoiceItemChange(index, event)
                        }
                        placeholder="ft"
                        inputMode="decimal"
                      />
                    </td>

                    <td>
                      <input
                        name="height"
                        value={item.height ?? ""}
                        onChange={(event) =>
                          handleInvoiceItemChange(index, event)
                        }
                        placeholder="ft"
                        inputMode="decimal"
                      />
                    </td>

                    <td>
                      <input
                        name="quantity"
                        value={item.quantity}
                        onChange={(event) =>
                          handleInvoiceItemChange(index, event)
                        }
                        inputMode="decimal"
                      />
                    </td>

                    <td className="quotation-readonly-cell">
                      {area > 0 ? money(area) : "-"}
                    </td>

                    <td>
                      <input
                        name="unit"
                        value={area > 0 ? "sqft" : item.unit}
                        disabled={area > 0}
                        onChange={(event) =>
                          handleInvoiceItemChange(index, event)
                        }
                        placeholder="sqft / nos"
                      />
                    </td>

                    <td>
                      <input
                        name="rate"
                        value={item.rate}
                        onChange={(event) =>
                          handleInvoiceItemChange(index, event)
                        }
                        inputMode="decimal"
                        title={area > 0 ? "Rate per sq.ft" : undefined}
                      />
                    </td>

                    <td className="quotation-readonly-cell">
                      ₹{money(amount)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => removeInvoiceItem(index)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="form-grid quotation-terms-grid">
          <div className="form-group">
            <label>Discount (₹)</label>

            <input
              type="number"
              name="discount"
              value={invoiceForm.discount}
              onChange={handleInvoiceChange}
              min="0"
              step="0.01"
            />
          </div>

          <div className="form-group">
            <label>GST %</label>

            <input
              type="number"
              name="gst_percent"
              value={invoiceForm.gst_percent}
              onChange={handleInvoiceChange}
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="quotation-totals">
          <div>
            <span>{t('subtotal')}</span>
            <strong>₹{money(invoiceSubtotal)}</strong>
          </div>

          <div>
            <span>{t('discount')}</span>
            <strong>₹{money(invoiceDiscount)}</strong>
          </div>

          <div>
            <span>GST {invoiceForm.gst_percent || 0}%</span>
            <strong>₹{money(invoiceGstAmount)}</strong>
          </div>

          <div className="quotation-grand-total">
            <span>{t('grand_total')}</span>
            <strong>₹{money(invoiceGrandTotal)}</strong>
          </div>
        </div>

        <div className="form-grid quotation-terms-grid">
          <div className="form-group full-width">
            <label>Terms &amp; Conditions</label>

            <textarea
              name="terms"
              value={invoiceForm.terms}
              onChange={handleInvoiceChange}
              rows={6}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={() => setPage("invoices")}
          >
            Back to Invoices
          </button>

          <button
            type="button"
            className="small-btn"
            onClick={previewInvoice}
          >
            Preview Invoice
          </button>

          <button
            type="button"
            className="small-btn"
            onClick={downloadInvoiceFromForm}
          >
            Download PDF / Print
          </button>

          <button type="submit" className="gold-btn">
            {editingInvoice ? t('update_invoice') : t('save_invoice')}
          </button>
        </div>
      </form>
    </div>
  </section>
);

const invoiceDetailsPage = () => {
  if (!selectedInvoice) {
    return (
      <section className="content">
        <div className="customers-header">
          <div>
            <h2>Invoice</h2>
            <p>{t('invoice_not_found')}</p>
          </div>
        </div>

        <div className="panel empty-state-panel">
          <p>{t('no_invoice_selected')}</p>

          <button className="primary-btn" onClick={() => setPage("invoices")}>
            Back to Invoices
          </button>
        </div>
      </section>
    );
  }

  const client = customers.find(
    (item) => item.id === selectedInvoice.customer
  );
  const project = projects.find(
    (item) => item.id === selectedInvoice.project
  );

  // Same columns as the quotation (Width / Height / Qty / Area / Rate /
  // Total) whenever any line is priced by area.
  const detailRows = (selectedInvoice.items || []).map((item) => ({
    item,
    ...readSavedInvoiceItem(item),
  }));
  const detailHasDims = detailRows.some((row) => row.hasDims);
  const detailShowImages = itemsHaveImages(selectedInvoice.items || []);

  return (
    <section className="content">
      <div className="customers-header">
        <div>
          <h2>Invoice {selectedInvoice.invoice_no}</h2>
          <p>{client?.name || "-"}</p>
        </div>

        <div className="quotation-detail-actions">
          <button
            className="small-btn"
            onClick={() => openEditInvoice(selectedInvoice)}
          >
            Edit
          </button>

          <button className="gold-btn" onClick={() => downloadInvoicePdf()}>
            Download / Print
          </button>

          <button
            className="cancel-btn"
            onClick={() => setPage("invoices")}
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{t('invoice_information')}</h2>
          </div>
        </div>

        <div className="project-info-grid">
          <div>
            <span>{t('client')}</span>
            <strong>{client?.name || "-"}</strong>
          </div>

          <div>
            <span>{t('phone')}</span>
            <strong>{client?.phone || "-"}</strong>
          </div>

          <div>
            <span>{t('invoice_date')}</span>
            <strong>{selectedInvoice.invoice_date || "-"}</strong>
          </div>

          <div>
            <span>{t('due_date')}</span>
            <strong>{selectedInvoice.due_date || "-"}</strong>
          </div>

          <div>
            <span>{t('project')}</span>
            <strong>{project?.name || "-"}</strong>
          </div>

          <div>
            <span>{t('company')}</span>
            <strong>{company.name}</strong>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{t('items')}</h2>
          </div>
        </div>

        <div className="history-table-wrapper">
          {detailHasDims ? (
            <table className="history-table quotation-view-table">
              <thead>
                <tr>
                  <th>{t('s_no')}</th>
                  {detailShowImages && <th>{t('image')}</th>}
                  <th>{t('width')}</th>
                  <th>{t('height')}</th>
                  <th>{t('qty')}</th>
                  <th>{t('area_sq_ft')}</th>
                  <th>{t('rate')}</th>
                  <th>{t('total')}</th>
                </tr>
              </thead>

              <tbody>
                {detailRows.map((row, index) => {
                  const label = row.label || "ITEMS";
                  const previousLabel =
                    index > 0 ? detailRows[index - 1].label || "ITEMS" : null;

                  return (
                    <Fragment key={row.item.id ?? index}>
                      {label !== previousLabel && (
                        <tr className="quotation-category-row">
                          <td colSpan={detailShowImages ? 8 : 7}>{label}</td>
                        </tr>
                      )}

                      <tr>
                        <td>{index + 1}</td>
                        {detailShowImages && (
                          <td>
                            <ProductThumb
                              src={row.item.product_image}
                              name={row.item.product_name}
                            />
                          </td>
                        )}
                        <td>{row.hasDims ? money(row.width) : "-"}</td>
                        <td>{row.hasDims ? money(row.height) : "-"}</td>
                        <td>
                          {row.hasDims
                            ? money(row.pieces)
                            : `${money(row.item.quantity)}${
                                row.item.unit && row.item.unit !== "nos"
                                  ? ` ${row.item.unit}`
                                  : ""
                              }`}
                        </td>
                        <td>{row.hasDims ? money(row.area) : "-"}</td>
                        <td>₹{money(row.item.rate)}</td>
                        <td className="amount-cell">
                          ₹{money(row.item.amount)}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="history-table quotation-view-table">
              <thead>
                <tr>
                  <th>#</th>
                  {detailShowImages && <th>{t('image')}</th>}
                  <th>{t('description')}</th>
                  <th>{t('qty')}</th>
                  <th>{t('unit')}</th>
                  <th>{t('rate')}</th>
                  <th>{t('amount')}</th>
                </tr>
              </thead>

              <tbody>
                {detailRows.map((row, index) => (
                  <tr key={row.item.id ?? index}>
                    <td>{index + 1}</td>
                    {detailShowImages && (
                      <td>
                        <ProductThumb
                          src={row.item.product_image}
                          name={row.item.product_name}
                        />
                      </td>
                    )}
                    <td>{row.label}</td>
                    <td>{row.item.quantity}</td>
                    <td>{row.item.unit || "-"}</td>
                    <td>₹{money(row.item.rate)}</td>
                    <td className="amount-cell">
                      ₹{money(row.item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="quotation-totals">
          <div>
            <span>{t('subtotal')}</span>
            <strong>₹{money(selectedInvoice.subtotal)}</strong>
          </div>

          <div>
            <span>{t('discount')}</span>
            <strong>₹{money(selectedInvoice.discount)}</strong>
          </div>

          <div>
            <span>GST {selectedInvoice.gst_percent}%</span>
            <strong>₹{money(selectedInvoice.gst_amount)}</strong>
          </div>

          <div className="quotation-grand-total">
            <span>{t('grand_total')}</span>
            <strong>₹{money(selectedInvoice.grand_total)}</strong>
          </div>
        </div>
      </div>

      {selectedInvoice.terms && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Terms &amp; Conditions</h2>
            </div>
          </div>

          <div className="quotation-terms">
            {selectedInvoice.terms
              .split("\n")
              .filter((line) => line.trim())
              .map((line, index) => (
                <p key={index}>{line}</p>
              ))}
          </div>
        </div>
      )}
    </section>
  );
};

  const spendModal = () => {
  if (!showSpendForm) return null;

  const standardCategory = SPEND_CATEGORIES.includes(spendForm.category);

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <h2>{editingExpense ? t('edit_spend') : t('add_spend')}</h2>
            <p>{t('record_project_expense')}</p>
          </div>

          <button
            className="close-btn"
            onClick={closeSpendForm}
          >
            ×
          </button>
        </div>

        <form onSubmit={saveSpend}>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Project Reference *</label>

              <select
                name="project"
                value={spendForm.project}
                onChange={handleSpendChange}
                required
              >
                <option value="">{t('select_project')}</option>

                {projects.map((project) => {
                  const client = customers.find(
                    (item) => item.id === project.customer
                  );

                  return (
                    <option key={project.id} value={project.id}>
                      {client ? `${client.name} — ` : ""}
                      {project.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group full-width">
              <label>{t('expense_title')}</label>

              <input
                name="title"
                value={spendForm.title}
                onChange={handleSpendChange}
                placeholder="Eg: Cement Purchase"
                required
              />
            </div>

            <div className="form-group">
              <label>{t('category')}</label>

              <select
                name="category"
                value={spendForm.category}
                onChange={handleSpendChange}
                required
              >
                <option value="">{t('select_category')}</option>
                <option value="Material">{t('material')}</option>
                <option value="Labour">{t('labour')}</option>
                <option value="Transport">{t('transport')}</option>
                <option value="Other">{t('other')}</option>
                {/* Keeps an older, non-standard category selectable when editing. */}
                {spendForm.category && !standardCategory && (
                  <option value={spendForm.category}>
                    {spendForm.category}
                  </option>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>{t('amount')}</label>

              <input
                type="number"
                name="amount"
                value={spendForm.amount}
                onChange={handleSpendChange}
                placeholder="Enter amount"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className="form-group full-width">
              <label>{t('date')}</label>

              <input
                type="date"
                name="date"
                value={spendForm.date}
                onChange={handleSpendChange}
                required
              />
            </div>

            <div className="form-group full-width">
              <label>{t('notes')}</label>

              <textarea
                name="notes"
                value={spendForm.notes}
                onChange={handleSpendChange}
                placeholder="Enter notes"
                rows={4}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={closeSpendForm}
            >
              Cancel
            </button>

            <button type="submit" className="gold-btn">
              {editingExpense ? t('update_spend') : "Save Spend"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
const paymentModal = () => {
  if (!showPaymentForm) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box payment-modal-box">
        <div className="modal-header payment-modal-header">
          <div>
            <span className="payment-modal-icon">₹</span>
            <div>
              <h2>
                {editingPayment ? t('edit_payment') : t('record_new_payment')}
              </h2>
              <p>{t('update_client_ledger_and_project_balance')}</p>
            </div>
          </div>

          <button className="close-btn" onClick={closePaymentForm}>
            ×
          </button>
        </div>

        <form onSubmit={savePayment}>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Project Reference *</label>

              <select
                name="project"
                value={paymentForm.project}
                onChange={handlePaymentChange}
                required
              >
                <option value="">{t('select_project')}</option>

                {projects.map((project) => {
                  const client = customers.find(
                    (item) => item.id === project.customer
                  );

                  return (
                    <option key={project.id} value={project.id}>
                      {client ? `${client.name} — ` : ""}
                      {project.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label>Amount Received *</label>

              <div className="amount-input-group">
                <span>₹</span>
                <input
                  type="number"
                  name="amount"
                  value={paymentForm.amount}
                  onChange={handlePaymentChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Date *</label>

              <input
                type="date"
                name="date"
                value={paymentForm.date}
                onChange={handlePaymentChange}
                required
              />
            </div>

            <div className="form-group full-width">
              <label>Payment Mode *</label>

              <div className="payment-mode-toggle">
                {PAYMENT_MODES.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`mode-btn ${
                      paymentForm.payment_method === option.value
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setPaymentForm((previous) => ({
                        ...previous,
                        payment_method: option.value,
                      }))
                    }
                  >
                    {option.icon} {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group full-width">
              <label>{t('reference_title_optional')}</label>

              <input
                name="title"
                value={paymentForm.title}
                onChange={handlePaymentChange}
                placeholder="Eg: Advance Payment"
              />
            </div>

            <div className="form-group full-width">
              <label>{t('notes_optional')}</label>

              <textarea
                name="notes"
                value={paymentForm.notes}
                onChange={handlePaymentChange}
                placeholder="Enter payment notes"
                rows={3}
              />
            </div>
          </div>

          <div className="ledger-note">
            <span className="ledger-note-icon">i</span>
            <span>
              <strong>Ledger Update:</strong> Saving this payment will
              automatically update the project's collection total and
              outstanding balance, and lets you generate a printable
              receipt.
            </span>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={closePaymentForm}
            >
              Cancel
            </button>

            <button type="submit" className="gold-btn">
              {editingPayment ? t('update_payment') : t('save_collection')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
  /* =========================================================
    CUSTOMER MODAL
  ========================================================= */

  const customerModal = () => {
    if (!showCustomerForm) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-box">
          <div className="modal-header">
            <div>
              <h2>
                {editingCustomer
                  ? t('edit_customer')
                  : t('add_customer')}
              </h2>

              <p>
                {editingCustomer
                  ? t('update_customer_information')
                  : t('enter_new_customer_information')}
              </p>
            </div>

            <button
              className="close-btn"
              onClick={closeCustomerForm}
            >
              ×
            </button>
          </div>

          <form onSubmit={saveCustomer}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('customer_name')}</label>

                <input
                  name="name"
                  value={customerForm.name}
                  onChange={handleCustomerChange}
                  placeholder="Enter customer name"
                  required
                />
              </div>

              <div className="form-group">
                <label>{t('phone')}</label>

                <input
                  name="phone"
                  value={customerForm.phone}
                  onChange={handleCustomerChange}
                  placeholder="Enter phone number"
                  required
                />
              </div>

              <div className="form-group">
                <label>{t('email')}</label>

                <input
                  type="email"
                  name="email"
                  value={customerForm.email}
                  onChange={handleCustomerChange}
                  placeholder="Enter email"
                />
              </div>

              <div className="form-group">
                <label>{t('address')}</label>

                <input
                  name="address"
                  value={customerForm.address}
                  onChange={handleCustomerChange}
                  placeholder="Enter address"
                />
              </div>

              <div className="form-group">
                <label>{t('city')}</label>

                <input
                  name="city"
                  value={customerForm.city}
                  onChange={handleCustomerChange}
                  placeholder="Enter city"
                />
              </div>

              <div className="form-group">
                <label>{t('state')}</label>

                <input
                  name="state"
                  value={customerForm.state}
                  onChange={handleCustomerChange}
                  placeholder="Enter state"
                />
              </div>

              <div className="form-group">
                <label>{t('pincode')}</label>

                <input
                  name="pincode"
                  value={customerForm.pincode}
                  onChange={handleCustomerChange}
                  placeholder="Enter pincode"
                />
              </div>

              <div className="form-group">
                <label>{t('status')}</label>

                <select
                  name="status"
                  value={customerForm.status}
                  onChange={handleCustomerChange}
                >
                  <option value="active">{t('active')}</option>
                  <option value="completed">
                    Completed
                  </option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={closeCustomerForm}
              >
                Cancel
              </button>

              <button type="submit" className="gold-btn">
                {editingCustomer
                  ? "Update Customer"
                  : "Save Customer"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const selectedProjectExpenses = selectedProject
  ? expenses.filter(
      (expense) => expense.project === selectedProject.id
    )
  : [];

const selectedProjectTotalSpend = selectedProjectExpenses.reduce(
  (total, expense) => total + Number(expense.amount || 0),
  0
);

const selectedProjectBudget = Number(
  selectedProject?.budget || 0
);

const selectedProjectPayments = selectedProject
  ? payments.filter(
      (payment) => payment.project === selectedProject.id
    )
  : [];

const selectedProjectTotalPaid = selectedProjectPayments.reduce(
  (total, payment) => total + Number(payment.amount || 0),
  0
);

const availableClientAmount = Math.max(
  0,
  selectedProjectTotalPaid - selectedProjectTotalSpend
);

const selectedProjectBalance = Math.max(
  0,
  selectedProjectBudget - selectedProjectTotalPaid
);

const downloadPaymentReceipt = () => {
  if (!selectedProject) return;

  // Oldest first, so "Previously Paid" and the running balance read correctly
  // no matter what order the API returned the rows in.
  const orderedPayments = selectedProjectPayments
    .slice()
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

  let runningPaid = 0;

  const receiptRows = orderedPayments
    .map((payment) => {
      const previousPaid = runningPaid;
      const totalPaid = previousPaid + Number(payment.amount || 0);
      const balance = Math.max(0, selectedProjectBudget - totalPaid);

      runningPaid = totalPaid;

      return `
        <tr>
          <td>${escapeHtml(payment.date || "-")}</td>
          <td>${money2(previousPaid)}</td>
          <td class="now-paid">${money2(payment.amount)}</td>
          <td class="bold">${money2(totalPaid)}</td>
          <td>₹ ${money2(selectedProjectBudget)}</td>
          <td class="balance">₹ ${money2(balance)}</td>
        </tr>`;
    })
    .join("");

  const receiptWindow = window.open("", "_blank", "width=1100,height=800");

  if (!receiptWindow) {
    alert("Please allow pop-ups to download the receipt.");
    return;
  }

  // The popup is about:blank, so the bundler's relative logo URL would not
  // resolve there. Make it absolute against the current page.
  const logoUrl = printLogoUrl();

  receiptWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Receipt - ${escapeHtml(selectedProject.name)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 30px;
            font-family: Arial, Helvetica, sans-serif;
            color: #f4f1e8;
            background: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt { max-width: 1050px; margin: auto; background: #000000; padding: 24px; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 24px;
            border-bottom: 3px solid #d4af37;
            padding-bottom: 16px;
            margin-bottom: 22px;
          }
          .brand { display: flex; align-items: center; gap: 14px; }
          .brand-logo { width: 78px; height: 78px; object-fit: contain; }
          h1 { margin: 0 0 5px; font-size: 28px; color: #d4af37; letter-spacing: 1px; }
          h2 { margin: 0; font-size: 20px; color: #d4af37; }
          p { margin: 5px 0; color: #d6d0c4; }
          .meta { text-align: right; font-size: 13px; line-height: 1.8; }
          .meta strong { color: #d4af37; }
          table { background: #000000; width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 18px; overflow: hidden; border: 1px solid #d4af37; border-radius: 8px; }
          th, td {
            border-right: 1px solid #d4af37;
            border-bottom: 1px solid #d4af37;
            padding: 12px 10px;
            text-align: center;
            font-size: 13px;
          }
          th:last-child, td:last-child { border-right: 0; }
          tbody tr:last-child td { border-bottom: 0; }
          th { background: #000000 !important; color: #d4af37 !important; font-size: 13px; font-weight: 800; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tbody tr:nth-child(even) td { background: #242424; }
          tbody tr:nth-child(odd) td { background: #171717; }
          .now-paid { color: #8ee28e; font-weight: 700; }
          .bold { color: #f4f1e8; font-weight: 700; }
          .balance { color: #72b7ff; font-weight: 700; }
          .footer { text-align: center; margin-top: 42px; padding-top: 18px; border-top: 1px solid #d4af37; }
          .footer h3 { color: #d4af37; margin-bottom: 5px; }
          .footer p { color: #d6d0c4; }
          @media (max-width: 700px) {
            body { padding: 12px; }
            .header { flex-direction: column; align-items: flex-start; }
            .meta { text-align: left; }
            .brand-logo { width: 62px; height: 62px; }
            th, td { padding: 8px 5px; font-size: 10px; }
          }
          @media print {
            body { padding: 0; background: #000000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .receipt { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="brand">
              <img class="brand-logo" src="${escapeHtml(
                logoUrl
              )}" alt="${escapeHtml(company.name)} Logo" />
              <div>
                <h1>${escapeHtml(company.name)}</h1>
                <h2>${t('payment_receipt')}</h2>
                <p>Project: ${escapeHtml(selectedProject.name)}</p>
              </div>
            </div>
            <div class="meta">
              <strong>Customer ID:</strong> ${escapeHtml(
                selectedProject.customer
              )}<br />
              <strong>Grand Total:</strong> ₹${money2(selectedProjectBudget)}
            </div>
          </div>

          <h2>${t('payment_history')}</h2>
          <table>
            <thead>
              <tr>
                <th>${t('date')}</th>
                <th>${t('previously_paid')}</th>
                <th>${t('now_paid')}</th>
                <th>${t('total_paid')}</th>
                <th>${t('grand_total')}</th>
                <th>${t('balance')}</th>
              </tr>
            </thead>
            <tbody>${receiptRows}</tbody>
          </table>

          <div class="footer">
            <h3>Thank You for Your Business!</h3>
            <p>${t('we_appreciate_your_trust')}</p>
          </div>
        </div>
      </body>
    </html>
  `);

  receiptWindow.document.close();
  receiptWindow.focus();

  printWhenReady(receiptWindow);
};

const dashboardTotalSpend = expenses.reduce(
  (total, expense) =>
    total + Number(expense.amount || 0),
  0
);

const dashboardTotalPaid = payments.reduce(
  (total, payment) =>
    total + Number(payment.amount || 0),
  0
);
const clientProfilePage = () => {
  if (!selectedCustomer) {
    return (
      <section className="content">
        <div className="customers-header">
          <div>
            <h2>{t('client_profile')}</h2>
            <p>{t('client_details_not_found')}</p>
          </div>
        </div>

        <div className="panel empty-state-panel">
          <p>{t('no_customer_selected')}</p>

          <button
            className="primary-btn"
            onClick={() => setPage("customers")}
          >
            Back to Customers
          </button>
        </div>
      </section>
    );
  }

  const customerProjects = projects.filter(
    (project) =>
      Number(project.customer) === Number(selectedCustomer.id)
  );

  const totalBudget = customerProjects.reduce(
    (total, project) =>
      total + Number(project.budget || 0),
    0
  );

  const clientPayments = payments.filter((payment) =>
    customerProjects.some(
      (project) =>
        Number(project.id) === Number(payment.project)
    )
  );

  const totalCollected = clientPayments.reduce(
    (total, payment) =>
      total + Number(payment.amount || 0),
    0
  );

  const outstanding = totalBudget - totalCollected;

  return (
    <section className="content client-profile-page">
      <div className="customers-header client-page-header">
        <div>
          <h2>{t('client_profile')}</h2>
          <p>{t('view_complete_customer_information')}</p>
        </div>

        <button
          type="button"
          className="gold-btn"
          onClick={() => setPage("customers")}
        >
          ← Back to Customers
        </button>
      </div>

      {/* CLIENT HEADER */}
      <div className="panel client-profile-card">
        <div className="client-profile-header">
          <div className="client-profile-avatar">
            {selectedCustomer.name?.charAt(0).toUpperCase() || "C"}
          </div>

          <div className="client-profile-main">
            <h3>{selectedCustomer.name}</h3>

            <p>{selectedCustomer.phone || "No phone number"}</p>

            <p>
              {selectedCustomer.email || "No email address"}
            </p>

            <span
              className={`status-badge ${
                selectedCustomer.status || "active"
              }`}
            >
              {selectedCustomer.status || "active"}
            </span>
          </div>

          <button
            type="button"
            className="primary-btn client-edit-btn"
            onClick={() => openEditCustomer(selectedCustomer)}
          >
            Edit Profile
          </button>
        </div>
      </div>

      {/* CLIENT STATS */}
      <div className="client-stats-grid">
        <div className="client-stat-card client-stat-projects">
          <span>{t('total_projects')}</span>
          <strong>{customerProjects.length}</strong>
          <small>{t('projects_assigned')}</small>
        </div>

        <div className="client-stat-card client-stat-budget">
          <span>{t('total_budget')}</span>
          <strong>
            ₹{totalBudget.toLocaleString("en-IN")}
          </strong>
          <small>{t('overall_project_value')}</small>
        </div>

        <div className="client-stat-card client-stat-collected">
          <span>{t('total_collected')}</span>
          <strong>
            ₹{totalCollected.toLocaleString("en-IN")}
          </strong>
          <small>{t('payments_received')}</small>
        </div>

        <div className="client-stat-card client-stat-outstanding">
          <span>{t('outstanding')}</span>
          <strong>
            ₹{outstanding.toLocaleString("en-IN")}
          </strong>
          <small>{t('remaining_amount')}</small>
        </div>
      </div>

      {/* CLIENT INFORMATION */}
      <div className="panel client-information-panel">
        <div className="panel-header">
          <div>
            <h2>{t('client_information')}</h2>
            <p>{t('personal_and_contact_details')}</p>
          </div>
        </div>

        <div className="client-information-grid">
          <div>
            <span>{t('phone')}</span>
            <strong>
              {selectedCustomer.phone || "Not provided"}
            </strong>
          </div>

          <div>
            <span>{t('email')}</span>
            <strong>
              {selectedCustomer.email || "Not provided"}
            </strong>
          </div>

          <div className="full-width">
            <span>{t('address')}</span>
            <strong>
              {selectedCustomer.address || "Not provided"}
            </strong>
          </div>

          <div>
            <span>{t('city')}</span>
            <strong>
              {selectedCustomer.city || "Not provided"}
            </strong>
          </div>

          <div>
            <span>{t('state')}</span>
            <strong>
              {selectedCustomer.state || "Not provided"}
            </strong>
          </div>

          <div>
            <span>{t('pincode')}</span>
            <strong>
              {selectedCustomer.pincode || "Not provided"}
            </strong>
          </div>
        </div>
      </div>

      {/* PROJECTS */}
      <div className="panel client-projects-panel">
        <div className="panel-header">
          <div>
            <h2>{t('client_projects')}</h2>
            <p>{t('projects_associated_with_this_client')}</p>
          </div>

          <span className="payment-count">
            {customerProjects.length} Projects
          </span>
        </div>

        {customerProjects.length === 0 ? (
          <div className="empty-history">
            No projects found for this client.
          </div>
        ) : (
          <div className="client-table-wrapper">
            <table className="customers-table client-projects-table">
              <thead>
                <tr>
                  <th>{t('project')}</th>
                  <th>{t('status')}</th>
                  <th>{t('budget')}</th>
                  <th>{t('action')}</th>
                </tr>
              </thead>

              <tbody>
                {customerProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <strong>{project.name}</strong>
                    </td>

                    <td>
                      <span
                        className={`status-badge ${project.status}`}
                      >
                        {(project.status || "new").replace("_", " ")}
                      </span>
                    </td>

                    <td>
                      ₹
                      {money(project.budget)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="small-btn"
                        onClick={() => openProjectDetails(project)}
                      >
                        View Project
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECENT PAYMENTS */}
      <div className="panel recent-payments-panel">
        <div className="panel-header payments-header">
          <div>
            <h2>{t('recent_payments')}</h2>
            <p>{t('payment_history_for_this_client')}</p>
          </div>

          <span className="payment-count">
            {clientPayments.length} Payments
          </span>
        </div>

        {clientPayments.length === 0 ? (
          <div className="empty-history">
            No payments recorded for this client.
          </div>
        ) : (
          <div className="payments-table-wrapper">
            <table className="customers-table payments-table">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('project')}</th>
                  <th>{t('title')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('mode')}</th>
                </tr>
              </thead>

              <tbody>
                {clientPayments
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() -
                      new Date(a.date).getTime()
                  )
                  .map((payment) => {
                    const paymentProject = customerProjects.find(
                      (project) =>
                        Number(project.id) ===
                        Number(payment.project)
                    );

                    return (
                      <tr key={payment.id}>
                        <td>
                          {payment.date
                            ? new Date(
                                payment.date
                              ).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>

                        <td>
                          <strong>
                            {paymentProject?.name ||
                              `Project #${payment.project}`}
                          </strong>
                        </td>

                        <td>
                          {payment.title || "Payment"}
                        </td>

                        <td className="payment-amount">
                          + ₹
                          {money(payment.amount)}
                        </td>

                        <td>
                          <span className="payment-mode">
                            {payment.mode || "Cash"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
  /* =========================================================
    PRODUCTS
    Catalogue with photos. Products can be picked inside the
    quotation / invoice forms, and their photo prints on the PDFs.
  ========================================================= */

  const loadProducts = async () => {
    try {
      setProducts(await fetchJson<Product[]>(PRODUCT_API_URL, "products"));
    } catch (error) {
      console.error(error);
    }
  };

  const productCategories = Array.from(
    new Set(
      products.map((product) => (product.category || "").trim()).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const activeProducts = products.filter((product) => product.is_active);
  const productsWithoutImage = products.filter(
    (product) => !product.image
  ).length;

  const filteredProducts = products.filter((product) => {
    if (productStatusFilter === "active" && !product.is_active) return false;
    if (productStatusFilter === "inactive" && product.is_active) return false;

    if (
      productCategoryFilter !== "all" &&
      (product.category || "").trim() !== productCategoryFilter
    ) {
      return false;
    }

    const searchText = `${product.name} ${product.code} ${product.category} ${product.description}`;

    return searchText
      .toLowerCase()
      .includes(productSearch.trim().toLowerCase());
  });

  /* ---------- add / edit form ---------- */

  const openAddProduct = () => {
    revokePreview(productImagePreview);
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductImageFile(null);
    setProductImagePreview(null);
    setProductRemoveImage(false);
    setShowProductForm(true);
  };

  const openEditProduct = (product: Product) => {
    revokePreview(productImagePreview);
    setEditingProduct(product);
    setProductForm({
      name: product.name || "",
      code: product.code || "",
      category: product.category || "",
      description: product.description || "",
      unit: product.unit || "sqft",
      rate: String(Number(product.rate ?? 0)),
      is_active: product.is_active,
    });
    setProductImageFile(null);
    setProductImagePreview(resolveMediaUrl(product.image));
    setProductRemoveImage(false);
    setShowProductForm(true);
  };

  const closeProductForm = () => {
    revokePreview(productImagePreview);
    setShowProductForm(false);
    setEditingProduct(null);
    setProductImageFile(null);
    setProductImagePreview(null);
    setProductRemoveImage(false);
    setProductDragOver(false);
  };

  const handleProductChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const target = event.target;
    const value =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.value;

    setProductForm((previous) => ({ ...previous, [target.name]: value }));
  };

  const chooseProductImage = (file?: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file (PNG, JPG or WEBP).");
      return;
    }

    if (file.size > MAX_PRODUCT_IMAGE_MB * 1024 * 1024) {
      alert(
        `That image is too large. Please choose one under ${MAX_PRODUCT_IMAGE_MB} MB.`
      );
      return;
    }

    revokePreview(productImagePreview);
    setProductImageFile(file);
    setProductImagePreview(URL.createObjectURL(file));
    setProductRemoveImage(false);
  };

  const handleProductImagePick = (event: ChangeEvent<HTMLInputElement>) => {
    chooseProductImage(event.target.files?.[0]);
    // Lets the same file be chosen again after removing it.
    event.target.value = "";
  };

  const handleProductImageDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setProductDragOver(false);
    chooseProductImage(event.dataTransfer.files?.[0]);
  };

  const removeProductImage = () => {
    revokePreview(productImagePreview);
    setProductImageFile(null);
    setProductImagePreview(null);
    // Only tell the server to delete a photo if one is actually stored.
    setProductRemoveImage(Boolean(editingProduct?.image));
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (productSaving) return;

    if (!productForm.name.trim()) {
      alert("Please enter the product name.");
      return;
    }

    const rate = Number(productForm.rate);

    if (productForm.rate === "" || Number.isNaN(rate) || rate < 0) {
      alert("Please enter a valid rate.");
      return;
    }

    // multipart, because the photo is a file (fetch sets the boundary).
    const body = new FormData();
    body.append("name", productForm.name.trim());
    body.append("code", productForm.code.trim());
    body.append("category", productForm.category.trim());
    body.append("description", productForm.description.trim());
    body.append("unit", productForm.unit.trim() || "nos");
    body.append("rate", String(rate));
    body.append("is_active", String(productForm.is_active));

    if (productImageFile) {
      body.append("image", productImageFile);
    } else if (productRemoveImage) {
      body.append("remove_image", "true");
    }

    setProductSaving(true);

    try {
      const response = await fetch(
        editingProduct
          ? `${PRODUCT_API_URL}${editingProduct.id}/`
          : PRODUCT_API_URL,
        { method: editingProduct ? "PATCH" : "POST", body }
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(responseText || `Request failed (${response.status})`);
      }

      await loadProducts();
      closeProductForm();
    } catch (error) {
      console.error("SAVE PRODUCT ERROR:", error);
      alert(`Unable to save product.\n\n${toMessage(error)}`);
    } finally {
      setProductSaving(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;

    try {
      const response = await fetch(`${PRODUCT_API_URL}${product.id}/`, {
        method: "DELETE",
      });

      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        alert(
          data?.detail ||
            "This product is used in existing documents. Mark it inactive instead."
        );
        return;
      }

      if (!response.ok) {
        alert("Unable to delete product.");
        return;
      }

      await loadProducts();
    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    }
  };

  const toggleProductActive = async (product: Product) => {
    try {
      const updated = await sendJson<Product>(
        `${PRODUCT_API_URL}${product.id}/`,
        "PATCH",
        { is_active: !product.is_active }
      );

      setProducts((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      console.error(error);
      alert(`Unable to update product.\n\n${toMessage(error)}`);
    }
  };

  /* ---------- using a product on a quotation / invoice ---------- */

  const applyProductToQuotationItem = (
    item: QuotationItem,
    product: Product
  ): QuotationItem => ({
    ...item,
    product: product.id,
    product_name: product.name,
    product_image: product.image,
    // The product's category becomes the section header on the quotation.
    category: product.category?.trim() || item.category?.trim() || product.name,
    rate: String(Number(product.rate || 0)),
  });

  const applyProductToInvoiceItem = (
    item: InvoiceItem,
    product: Product
  ): InvoiceItem => ({
    ...item,
    product: product.id,
    product_name: product.name,
    product_image: product.image,
    description: product.name,
    unit: product.unit || item.unit,
    rate: String(Number(product.rate || 0)),
  });

  const detachProduct = { product: null, product_name: null, product_image: null };

  const handleQuotationItemProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === Number(productId));

    setQuotationItems((previous) =>
      previous.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return product
          ? applyProductToQuotationItem(item, product)
          : { ...item, ...detachProduct };
      })
    );
  };

  const handleInvoiceItemProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === Number(productId));

    setInvoiceItems((previous) =>
      previous.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return product
          ? applyProductToInvoiceItem(item, product)
          : { ...item, ...detachProduct };
      })
    );
  };

  // <option>s for the per-row product select, grouped by category.
  const renderProductOptions = (
    currentId?: number | null,
    currentName?: string | null
  ) => {
    const list = products.filter(
      (product) => product.is_active || product.id === currentId
    );

    const groups = new Map<string, Product[]>();

    list.forEach((product) => {
      const key = (product.category || "").trim() || "Other";
      groups.set(key, [...(groups.get(key) || []), product]);
    });

    const options = Array.from(groups.entries()).map(([category, items]) => (
      <optgroup key={category} label={category}>
        {items.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </optgroup>
    ));

    // Product no longer in the list (e.g. products failed to load) — keep
    // the row's current selection visible instead of silently blanking it.
    if (currentId && !list.some((product) => product.id === currentId)) {
      options.push(
        <option key={`missing-${currentId}`} value={currentId}>
          {currentName || `Product #${currentId}`}
        </option>
      );
    }

    return options;
  };

  const startQuotationWithProduct = (product: Product) => {
    openCreateQuotation();
    setQuotationItems([
      applyProductToQuotationItem(emptyQuotationItem(), product),
    ]);
  };

  const startInvoiceWithProduct = (product: Product) => {
    openCreateInvoice();
    setInvoiceItems([applyProductToInvoiceItem(emptyInvoiceItem(), product)]);
  };

  /* ---------- "Add from Products" picker ---------- */

  const openProductPicker = (target: "quotation" | "invoice") => {
    setPickerSearch("");
    setPickerCategory("all");
    setPickerAdded({});
    setProductPickerTarget(target);
  };

  const closeProductPicker = () => setProductPickerTarget(null);

  const addProductFromPicker = (product: Product) => {
    if (productPickerTarget === "quotation") {
      setQuotationItems((previous) => {
        const onlyBlankRow =
          previous.length === 1 &&
          !previous[0].product &&
          !previous[0].category &&
          !previous[0].width &&
          !previous[0].height &&
          !previous[0].rate;

        const newItem = applyProductToQuotationItem(
          emptyQuotationItem(),
          product
        );

        return onlyBlankRow ? [newItem] : [...previous, newItem];
      });
    } else if (productPickerTarget === "invoice") {
      setInvoiceItems((previous) => {
        const onlyBlankRow =
          previous.length === 1 &&
          !previous[0].product &&
          !previous[0].description &&
          !previous[0].rate;

        const newItem = applyProductToInvoiceItem(
          emptyInvoiceItem(),
          product
        );

        return onlyBlankRow ? [newItem] : [...previous, newItem];
      });
    }

    setPickerAdded((previous) => ({
      ...previous,
      [product.id]: (previous[product.id] || 0) + 1,
    }));
  };

  /* ---------- products page ---------- */

  const productsPage = () => {
    const stats = [
      { label: t('total_products'), value: products.length, icon: "▣" },
      { label: t('active_products'), value: activeProducts.length, icon: "✓" },
      { label: t('categories'), value: productCategories.length, icon: "◫" },
      {
        label: t('missing_photos'),
        value: productsWithoutImage,
        icon: "🖼",
        warn: productsWithoutImage > 0,
      },
    ];

    return (
      <section className="content">
        <div className="customers-header">
          <div>
            <h2>{t('products')}</h2>
            <p>{t('products_subtitle')}</p>
          </div>

          <button type="button" className="gold-btn" onClick={openAddProduct}>
            + {t('add_product')}
          </button>
        </div>

        <div className="product-stats">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`product-stat ${stat.warn ? "warn" : ""}`}
            >
              <span className="product-stat-icon">{stat.icon}</span>
              <div>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="customers-toolbar doc-toolbar">
          <input
            type="text"
            placeholder={t('search_products')}
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
          />

          <select
            value={productCategoryFilter}
            onChange={(event) => setProductCategoryFilter(event.target.value)}
          >
            <option value="all">{t('all_categories')}</option>
            {productCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={productStatusFilter}
            onChange={(event) =>
              setProductStatusFilter(
                event.target.value as "all" | "active" | "inactive"
              )
            }
          >
            <option value="all">{t('all_status')}</option>
            <option value="active">{t('active')}</option>
            <option value="inactive">{t('inactive')}</option>
          </select>

          <div className="view-toggle">
            <button
              type="button"
              className={productViewMode === "grid" ? "active" : ""}
              onClick={() => setProductViewMode("grid")}
              title="Grid view"
            >
              ▦
            </button>
            <button
              type="button"
              className={productViewMode === "list" ? "active" : ""}
              onClick={() => setProductViewMode("list")}
              title="List view"
            >
              ☰
            </button>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="panel product-empty">
            <div className="product-empty-icon">▣</div>
            <h3>{t('no_products_yet')}</h3>
            <p>{t('no_products_yet_hint')}</p>
            <button type="button" className="gold-btn" onClick={openAddProduct}>
              + {t('add_product')}
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="empty-history doc-empty">{t('no_products_match')}</p>
        ) : productViewMode === "grid" ? (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className={`product-card ${product.is_active ? "" : "inactive"}`}
              >
                <div
                  className="product-card-media"
                  onClick={() => openEditProduct(product)}
                >
                  {product.image ? (
                    <img
                      src={resolveMediaUrl(product.image) || ""}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="product-card-placeholder">
                      <span>▣</span>
                      <small>No photo</small>
                    </div>
                  )}

                  {product.category && (
                    <span className="product-chip">{product.category}</span>
                  )}
                  {!product.is_active && (
                    <span className="product-chip product-chip-off">
                      {t('inactive')}
                    </span>
                  )}

                  <div
                    className="product-card-tools"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="icon-action"
                      title={t('edit')}
                      onClick={() => openEditProduct(product)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-action"
                      title={
                        product.is_active ? t('deactivate') : t('activate')
                      }
                      onClick={() => toggleProductActive(product)}
                    >
                      {product.is_active ? "◉" : "○"}
                    </button>
                    <button
                      type="button"
                      className="icon-action danger"
                      title={t('delete')}
                      onClick={() => deleteProduct(product)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="product-card-body">
                  <h3 title={product.name}>{product.name}</h3>
                  {product.code && (
                    <div className="product-code"># {product.code}</div>
                  )}
                  <p className="product-desc">
                    {product.description || "—"}
                  </p>

                  <div className="product-price">
                    <strong>₹{money(product.rate)}</strong>
                    <span>/ {productUnitLabel(product.unit)}</span>
                  </div>
                </div>

                <div className="product-card-actions">
                  <button
                    type="button"
                    className="small-btn"
                    disabled={!product.is_active}
                    onClick={() => startQuotationWithProduct(product)}
                  >
                    ✎ {t('quote_action')}
                  </button>
                  <button
                    type="button"
                    className="small-btn"
                    disabled={!product.is_active}
                    onClick={() => startInvoiceWithProduct(product)}
                  >
                    ▥ {t('invoice_action')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="history-table-wrapper">
            <table className="history-table product-table">
              <thead>
                <tr>
                  <th>{t('image')}</th>
                  <th>{t('product_name')}</th>
                  <th>{t('category')}</th>
                  <th>{t('unit')}</th>
                  <th>{t('rate')}</th>
                  <th>{t('status')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <ProductThumb
                        src={product.image}
                        name={product.name}
                        size="md"
                      />
                    </td>
                    <td>
                      <strong>{product.name}</strong>
                      {product.code && (
                        <div className="product-code"># {product.code}</div>
                      )}
                    </td>
                    <td>{product.category || "-"}</td>
                    <td>{productUnitLabel(product.unit)}</td>
                    <td className="amount-cell">₹{money(product.rate)}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          product.is_active ? "active" : "cancelled"
                        }`}
                      >
                        {product.is_active ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td>
                      <div className="product-row-actions">
                        <button
                          type="button"
                          className="small-btn"
                          onClick={() => openEditProduct(product)}
                        >
                          {t('edit')}
                        </button>
                        <button
                          type="button"
                          className="small-btn"
                          onClick={() => toggleProductActive(product)}
                        >
                          {product.is_active
                            ? t('deactivate')
                            : t('activate')}
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => deleteProduct(product)}
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  /* ---------- add / edit modal ---------- */

  const productModal = () => {
    if (!showProductForm) return null;

    const unitOptions = Array.from(
      new Set([...PRODUCT_UNITS.map((item) => item.value), productForm.unit])
    );

    return (
      <div className="modal-overlay">
        <div className="modal-box product-modal-box">
          <div className="modal-header">
            <div>
              <h2>
                {editingProduct ? t('edit_product') : t('add_product')}
              </h2>
              <p>{t('products_subtitle')}</p>
            </div>

            <button
              type="button"
              className="close-btn"
              onClick={closeProductForm}
            >
              ×
            </button>
          </div>

          <form onSubmit={saveProduct}>
            <div className="product-form-layout">
              <div className="product-image-field">
                <span className="product-field-label">
                  {t('product_image')}
                </span>

                <label
                  className={`product-dropzone ${
                    productDragOver ? "drag" : ""
                  } ${productImagePreview ? "has-image" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setProductDragOver(true);
                  }}
                  onDragLeave={() => setProductDragOver(false)}
                  onDrop={handleProductImageDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleProductImagePick}
                  />

                  {productImagePreview ? (
                    <img src={productImagePreview} alt="Product preview" />
                  ) : (
                    <div className="product-dropzone-empty">
                      <span className="dz-icon">🖼</span>
                      <strong>{t('upload_photo')}</strong>
                      <small>{t('drag_drop_hint')}</small>
                    </div>
                  )}
                </label>

                {productImagePreview && (
                  <div className="product-image-actions">
                    <label className="small-btn product-change-btn">
                      {t('change_photo')}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleProductImagePick}
                      />
                    </label>

                    <button
                      type="button"
                      className="danger-btn"
                      onClick={removeProductImage}
                    >
                      {t('remove_photo')}
                    </button>
                  </div>
                )}
              </div>

              <div className="form-grid product-fields">
                <div className="form-group full-width">
                  <label>{t('product_name')} *</label>
                  <input
                    name="name"
                    value={productForm.name}
                    onChange={handleProductChange}
                    placeholder="e.g. Double Openable Window"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>{t('category')}</label>
                  <input
                    name="category"
                    list="product-category-list"
                    value={productForm.category}
                    onChange={handleProductChange}
                    placeholder="e.g. DOUBLE OPENABLE WINDOWS"
                  />
                  <datalist id="product-category-list">
                    {productCategories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group">
                  <label>{t('product_code')}</label>
                  <input
                    name="code"
                    value={productForm.code}
                    onChange={handleProductChange}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group">
                  <label>{t('rate')} (₹) *</label>
                  <input
                    type="number"
                    name="rate"
                    value={productForm.rate}
                    onChange={handleProductChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>{t('unit')}</label>
                  <select
                    name="unit"
                    value={productForm.unit}
                    onChange={handleProductChange}
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {productUnitLabel(unit)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group full-width">
                  <label>{t('description')}</label>
                  <textarea
                    name="description"
                    value={productForm.description}
                    onChange={handleProductChange}
                    rows={3}
                    placeholder="Frame, glass, colour, hardware..."
                  />
                </div>

                <label className="product-toggle full-width">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={productForm.is_active}
                    onChange={handleProductChange}
                  />
                  <span>{t('product_active_hint')}</span>
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={closeProductForm}
              >
                {t('cancel')}
              </button>

              <button
                type="submit"
                className="gold-btn"
                disabled={productSaving}
              >
                {productSaving
                  ? "Saving..."
                  : editingProduct
                  ? t('update_product')
                  : t('save_product')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  /* ---------- picker modal (inside quotation / invoice forms) ---------- */

  const productPickerModal = () => {
    if (!productPickerTarget) return null;

    const query = pickerSearch.trim().toLowerCase();

    const list = activeProducts.filter((product) => {
      if (
        pickerCategory !== "all" &&
        (product.category || "").trim() !== pickerCategory
      ) {
        return false;
      }

      return `${product.name} ${product.code} ${product.category}`
        .toLowerCase()
        .includes(query);
    });

    const addedTotal = Object.values(pickerAdded).reduce(
      (sum, count) => sum + count,
      0
    );

    return (
      <div className="modal-overlay">
        <div className="modal-box product-picker-box">
          <div className="modal-header">
            <div>
              <h2>{t('add_from_products')}</h2>
              <p>{t('picker_hint')}</p>
            </div>

            <button
              type="button"
              className="close-btn"
              onClick={closeProductPicker}
            >
              ×
            </button>
          </div>

          {activeProducts.length === 0 ? (
            <div className="product-empty">
              <div className="product-empty-icon">▣</div>
              <h3>{t('no_products_yet')}</h3>
              <p>{t('no_products_yet_hint')}</p>
              <button
                type="button"
                className="gold-btn"
                onClick={() => {
                  closeProductPicker();
                  setPage("products");
                }}
              >
                + {t('add_product')}
              </button>
            </div>
          ) : (
            <>
              <div className="product-picker-filters">
                <input
                  type="text"
                  placeholder={t('search_products')}
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                  autoFocus
                />

                <select
                  value={pickerCategory}
                  onChange={(event) => setPickerCategory(event.target.value)}
                >
                  <option value="all">{t('all_categories')}</option>
                  {productCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {list.length === 0 ? (
                <p className="empty-history doc-empty">
                  {t('no_products_match')}
                </p>
              ) : (
                <div className="product-picker-grid">
                  {list.map((product) => {
                    const count = pickerAdded[product.id] || 0;

                    return (
                      <button
                        type="button"
                        key={product.id}
                        className={`picker-card ${count ? "added" : ""}`}
                        onClick={() => addProductFromPicker(product)}
                      >
                        <ProductThumb
                          src={product.image}
                          name={product.name}
                          size="md"
                        />

                        <span className="picker-card-info">
                          <strong>{product.name}</strong>
                          <small>{product.category || "—"}</small>
                          <em>
                            ₹{money(product.rate)} / {productUnitLabel(product.unit)}
                          </em>
                        </span>

                        {count > 0 && (
                          <span className="picker-badge">✓ ×{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="modal-actions picker-actions">
            <span className="picker-added-note">
              {addedTotal > 0 ? `✓ ${addedTotal} ${t('added')}` : ""}
            </span>

            <button
              type="button"
              className="gold-btn"
              onClick={closeProductPicker}
            >
              {t('done')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* =========================================================
  FINAL RETURN
  ========================================================= */

return (
  <div className="app-layout">
    {sidebar()}
    {sidebarBackdrop()}

    <main className="main-content">
      {topbar()}

      {page === "dashboard" && dashboard()}

      {page === "customers" && customersPage()}

      {page === "projects" && projectsPage()}

      {page === "create-project" && createProjectPage()}
      {page === "client-profile" && clientProfilePage()}
      {page === "edit-project" && createProjectPage()}
      {page === "quotations" && quotationsPage()}
      {page === "create-quotation" && quotationFormPage()}
      {page === "edit-quotation" && quotationFormPage()}
      {page === "quotation-details" && quotationDetailsPage()}
      {page === "quotation-clients" && quotationClientsPage()}
      {page === "invoices" && invoicesPage()}
      {page === "create-invoice" && invoiceFormPage()}
      {page === "edit-invoice" && invoiceFormPage()}
      {page === "invoice-details" && invoiceDetailsPage()}
      {page === "payments" && paymentsPage()}
      {page === "spend" && spendPage()}
      {page === "products" && productsPage()}
      {page === "reports" && (
      <ReportsPage
      language={language}
      customers={customers}
      projects={projects}
      products={products}
      expenses={expenses}
      payments={payments}
      quotations={quotations}
      invoices={invoices}
    />
  )}
      {page === "settings" && (
        <SettingsPage
          language={language}
          settings={company}
          onSave={saveCompany}
        />
      )}
      {page === "admin" && (
        <AdminPage
          language={language}
          company={company}
          customerCount={customers.length}
          projectCount={projects.length}
          productCount={products.length}
          quotationCount={quotations.length}
          invoiceCount={invoices.length}
          onNavigate={(next) => goToPage(next)}
        />
      )}
      {page === "project-details" && selectedProject && (
  <section className="content">
    <div className="customers-header">
      <div>
        <h2>{t('project_overview')}</h2>
        <p>{selectedProject.name}</p>
      </div>

      <button
        type="button"
        className="gold-btn"
        onClick={() => {
          setEditingProject(null);
          setProjectCustomer(null);
          setProjectForm(emptyProjectForm);
          setPage("projects");
        }}
      >
        ← Back to Projects
      </button>
    </div>
  <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{t('project_information')}</h2>
          
        </div>
      </div>

      <div className="project-info-grid">
        <div>
          <span>{t('project_name')}</span>
          <strong>{selectedProject.name}</strong>
        </div>

        <div>
          <span>{t('status')}</span>
          <strong>
            {(selectedProject.status || "new").replace("_", " ")}
          </strong>
        </div>

        <div>
          <span>{t('site_address')}</span>
          <strong>{selectedProject.site_address || "-"}</strong>
        </div>

        <div>
          <span>{t('location')}</span>
          <strong>
            {selectedProject.city}, {selectedProject.state}
          </strong>
        </div>
      </div>
    </div>

<div className="premium-stats">
  {/* Total Budget */}
  <div className="stat-card premium-card budget-card">
    <div className="stat-card-top">
      <span className="stat-label">{t('budget')}</span>
      <span className="stat-mini-icon">₹</span>
    </div>

    <div className="stat-card-content">
      <div className="stat-icon premium-icon budget-icon">₹</div>

      <div>
        <span className="stat-title">{t('total_budget')}</span>

        <strong>
          ₹{selectedProjectBudget.toLocaleString("en-IN")}
        </strong>

        <small>{t('project_budget')}</small>
      </div>
    </div>

    <div className="stat-progress">
      <span></span>
    </div>

    <div className="stat-decoration">⌂</div>
  </div>

  {/* Collection Paid */}
  <div className="stat-card premium-card collection-card">
    <div className="stat-card-top">
      <span className="stat-label">{t('received')}</span>
      <span className="stat-mini-icon">↗</span>
    </div>

    <div className="stat-card-content">
      <div className="stat-icon premium-icon collection-icon">▣</div>

      <div>
        <span className="stat-title">{t('collection_paid')}</span>

        <strong>
          ₹{selectedProjectTotalPaid.toLocaleString("en-IN")}
        </strong>

        <small>{t('client_payments')}</small>
      </div>
    </div>

    <div className="stat-progress">
      <span></span>
    </div>

    <div className="stat-decoration">↗</div>
  </div>

  {/* Total Spend */}
  <div className="stat-card premium-card spend-card">
    <div className="stat-card-top">
      <span className="stat-label">{t('expenses')}</span>
      <span className="stat-mini-icon">▤</span>
    </div>

    <div className="stat-card-content">
      <div className="stat-icon premium-icon spend-icon">▤</div>

      <div>
        <span className="stat-title">{t('total_spend')}</span>

        <strong>
          ₹{selectedProjectTotalSpend.toLocaleString("en-IN")}
        </strong>

        <small>{t('recorded_expenses')}</small>
      </div>
    </div>

    <div className="stat-progress">
      <span></span>
    </div>

    <div className="stat-decoration">▥</div>
  </div>

  {/* Available Client Amount */}
  <div className="stat-card premium-card available-card">
    <div className="stat-card-top">
      <span className="stat-label">{t('available')}</span>
      <span className="stat-mini-icon">₹</span>
    </div>

    <div className="stat-card-content">
      <div className="stat-icon premium-icon available-icon">₹</div>

      <div>
        <span className="stat-title">{t('available_client_amount')}</span>

        <strong>
          ₹{availableClientAmount.toLocaleString("en-IN")}
        </strong>

        <small>{t('client_payment_after_expenses')}</small>
      </div>
    </div>

    <div className="stat-progress">
      <span></span>
    </div>

    <div className="stat-decoration">▣</div>
  </div>

  {/* Outstanding Balance */}
  <div className="stat-card premium-card outstanding-card">
    <div className="stat-card-top">
      <span className="stat-label">{t('pending')}</span>
      <span className="stat-mini-icon">⌛</span>
    </div>

    <div className="stat-card-content">
      <div className="stat-icon premium-icon outstanding-icon">!</div>

      <div>
        <span className="stat-title">{t('outstanding_balance')}</span>

        <strong>
          ₹{selectedProjectBalance.toLocaleString("en-IN")}
        </strong>

        <small>{t('pending_amount')}</small>
      </div>
    </div>

    <div className="stat-progress">
      <span></span>
    </div>

    <div className="stat-decoration">◷</div>
  </div>
</div>


    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{t('quick_actions')}</h2>
        </div>
      </div>

      <div className="quick-actions">
        <button className="quick-action-card quick-action-gold" onClick={() => openSpendForm()}>
          <span className="quick-action-icon">⊟</span>
          <span className="quick-action-label">{t('add_spend')}</span>
        </button>
        <button className="quick-action-card quick-action-blue" onClick={() => openPaymentForm()}>
          <span className="quick-action-icon">₹</span>
          <span className="quick-action-label">{t('add_payment')}</span>
        </button>
        <button
          className="quick-action-card quick-action-green"
          onClick={() =>
            selectedProject &&
            openCreateQuotation(
              customers.find(
                (item) => item.id === selectedProject.customer
              ),
              selectedProject
            )
          }
        >
          <span className="quick-action-icon">✎</span>
          <span className="quick-action-label">{t('new_quotation')}</span>
        </button>
        <button
          className="quick-action-card quick-action-red"
          onClick={() =>
            selectedProject &&
            openCreateInvoice(
              customers.find(
                (item) => item.id === selectedProject.customer
              ),
              selectedProject
            )
          }
        >
          <span className="quick-action-icon">▥</span>
          <span className="quick-action-label">{t('new_invoice')}</span>
        </button>
        <button
          className="quick-action-card quick-action-gold"
          onClick={() => openEditProject(selectedProject)}
        >
          <span className="quick-action-icon">◫</span>
          <span className="quick-action-label">{t('edit_project')}</span>
        </button>
        <button
          className="quick-action-card quick-action-blue"
          onClick={() => selectedProject && openClientProfile(selectedProject.customer)}
        >
          <span className="quick-action-icon">◉</span>
          <span className="quick-action-label">{t('view_client')}</span>
        </button>
      </div>
    </div>

    <div className="history-grid">
      <div className="panel history-panel">
        <div className="panel-header">
          <div>
            <h2>{t('expense_history')}</h2>
          </div>
          <strong className="history-total">
            ₹{selectedProjectTotalSpend.toLocaleString("en-IN")}
          </strong>
        </div>

        {selectedProjectExpenses.length === 0 ? (
          <p className="empty-history">{t('no_expenses_recorded_yet')}</p>
        ) : (
          <div className="history-table-wrapper">
  <table className="history-table expense-history-table">
    <thead>
      <tr>
        <th>{t('title')}</th>
        <th>{t('category')}</th>
        <th>{t('amount')}</th>
        <th>{t('date')}</th>
      </tr>
    </thead>

    <tbody>
      {selectedProjectExpenses.map((expense) => (
        <tr key={expense.id}>
          <td className="title-cell">
            {expense.title}
          </td>

          <td>
            {expense.category || "-"}
          </td>

          <td className="amount-cell">
            ₹{money(expense.amount)}
          </td>

          <td className="date-cell">
            {expense.date || "-"}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
        )}
      </div>

      <div className="panel history-panel">
        <div className="panel-header">
          <div>
            <h2>{t('payment_history')}</h2>
          </div>
          <div className="history-header-actions">
            <strong className="history-total">
              ₹{selectedProjectTotalPaid.toLocaleString("en-IN")}
            </strong>
            <button
              type="button"
              className="receipt-btn"
              onClick={downloadPaymentReceipt}
            >
              Download Receipt
            </button>
          </div>
        </div>

        {selectedProjectPayments.length === 0 ? (
          <p className="empty-history">{t('no_payments_recorded_yet')}</p>
        ) : (
          <div className="history-table-wrapper">
  <table className="history-table payment-history-table">
    <thead>
      <tr>
        <th>{t('title')}</th>
        <th>{t('method')}</th>
        <th>{t('amount')}</th>
        <th>{t('date')}</th>
      </tr>
    </thead>

    <tbody>
      {selectedProjectPayments.map((payment) => (
        <tr key={payment.id}>
          <td className="title-cell">
            {payment.title || "Client Payment"}
          </td>

          <td className="method-cell">
            {payment.mode === "cash"
              ? "Cash"
              : payment.mode === "upi"
              ? "UPI"
              : payment.mode === "bank_transfer"
              ? "Bank Transfer"
              : payment.mode === "cheque"
              ? "Cheque"
              : "Other"}
          </td>

          <td className="amount-cell">
            ₹{money(payment.amount)}
          </td>

          <td className="date-cell">
            {payment.date || "-"}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
        )}
      </div>
    </div>
  </section>
)}
      {customerModal()}
      {spendModal()}
      {paymentModal()}
      {productModal()}
      {productPickerModal()}
    </main>
  </div>
);
}

export default App;