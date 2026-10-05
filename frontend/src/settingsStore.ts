/* =========================================================
  COMPANY SETTINGS — storage, validation and print helpers

  The Settings page edits these values, App.tsx reads them, and the
  quotation / invoice / receipt PDFs print them.

  Storage is localStorage (same approach the app already uses for the
  language and archived documents), so settings live in this browser.
  Everything that touches storage is in loadCompanySettings() and
  saveCompanySettings() below, so moving it to a Django endpoint later
  means changing those two functions only.
========================================================= */

import { escapeHtml as esc } from "./utils";

export type LetterheadTone = "dark" | "light";

export type CompanySettings = {
  name: string;
  tagline: string;
  address: string; // one line per row, printed as typed
  phone: string;
  email: string;
  gstNumber: string; // blank = not GST-registered
  logoDataUrl: string; // blank = use the built-in logo
  signatureDataUrl: string; // blank = print "Authorised Signatory" as text only
  letterheadTone: LetterheadTone; // colour of the band behind the logo
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  upiId: string;
  invoiceTerms: string;
  quotationTerms: string;
};

const STORAGE_KEY = "windaaro_company_settings";

/* ---------- standard terms ---------- */

export const DEFAULT_QUOTATION_TERMS = [
  "1. Quotation validity: 10 days from the date of issue.",
  "2. Payment terms: 70% advance, 30% before dispatch / installation.",
  "3. Final dimensions will be confirmed at site before production.",
  "4. Civil, electrical, plastering and painting works are excluded unless specifically mentioned.",
  "5. Manufacturing / installation period: 5 working days after approval and advance payment.",
  "6. Pinnet glass only, other glass will be extra.",
  "7. Scaffolding should be provided by your side.",
].join("\n");

export const buildDefaultInvoiceTerms = (companyName: string) =>
  [
    "1. Payment is due on or before the due date shown above.",
    `2. Please pay via bank transfer, UPI, or cheque in favour of ${
      companyName.trim() || "the company"
    }.`,
    "3. Late payments may attract additional charges.",
    "4. This is a computer-generated invoice.",
  ].join("\n");

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  name: "WINDAARO",
  tagline: "uPVC WINDOWS & DOORS",
  address: "",
  phone: "",
  email: "",
  gstNumber: "",
  logoDataUrl: "",
  signatureDataUrl: "",
  letterheadTone: "dark",
  bankAccountName: "",
  bankName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankBranch: "",
  upiId: "",
  invoiceTerms: buildDefaultInvoiceTerms("WINDAARO"),
  quotationTerms: DEFAULT_QUOTATION_TERMS,
};

export const DEFAULT_INVOICE_TERMS = DEFAULT_COMPANY_SETTINGS.invoiceTerms;

/* ---------- persistence ---------- */

const sanitize = (raw: unknown): CompanySettings => {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const result: CompanySettings = { ...DEFAULT_COMPANY_SETTINGS };

  (Object.keys(DEFAULT_COMPANY_SETTINGS) as (keyof CompanySettings)[]).forEach(
    (key) => {
      const value = source[key];

      if (key === "letterheadTone") {
        result.letterheadTone = value === "light" ? "light" : "dark";
      } else if (typeof value === "string") {
        result[key] = value as never;
      }
    }
  );

  if (!result.name.trim()) result.name = DEFAULT_COMPANY_SETTINGS.name;

  return result;
};

export const loadCompanySettings = (): CompanySettings => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? sanitize(JSON.parse(stored)) : { ...DEFAULT_COMPANY_SETTINGS };
  } catch {
    return { ...DEFAULT_COMPANY_SETTINGS };
  }
};

/** Returns false when the browser refuses the write (storage full or blocked). */
export const saveCompanySettings = (settings: CompanySettings): boolean => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

/* ---------- validation ---------- */

export type FieldError =
  | "required"
  | "phone"
  | "email"
  | "gst"
  | "ifsc"
  | "account"
  | "upi";

export type SettingsErrors = Partial<Record<keyof CompanySettings, FieldError>>;

const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Keys are added in on-screen order, so the first key is the first field to fix. */
export const validateCompanySettings = (s: CompanySettings): SettingsErrors => {
  const errors: SettingsErrors = {};

  if (!s.name.trim()) errors.name = "required";

  const phone = s.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!/^[+()\d\s.-]+$/.test(phone) || digits.length < 8 || digits.length > 15) {
      errors.phone = "phone";
    }
  }

  const email = s.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.email = "email";

  const gst = s.gstNumber.trim().toUpperCase();
  if (gst && !GST_PATTERN.test(gst)) errors.gstNumber = "gst";

  const account = s.bankAccountNumber.replace(/\s/g, "");
  if (account && !/^\d{9,18}$/.test(account)) errors.bankAccountNumber = "account";

  const ifsc = s.bankIfsc.trim().toUpperCase();
  if (ifsc && !IFSC_PATTERN.test(ifsc)) errors.bankIfsc = "ifsc";

  const upi = s.upiId.trim();
  if (upi && !UPI_PATTERN.test(upi)) errors.upiId = "upi";

  return errors;
};

/** Trims and tidies values right before they are saved. */
export const normalizeCompanySettings = (s: CompanySettings): CompanySettings => ({
  ...s,
  name: s.name.trim(),
  tagline: s.tagline.trim(),
  address: s.address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n"),
  phone: s.phone.trim(),
  email: s.email.trim(),
  gstNumber: s.gstNumber.trim().toUpperCase(),
  bankAccountName: s.bankAccountName.trim(),
  bankName: s.bankName.trim(),
  bankAccountNumber: s.bankAccountNumber.replace(/\s/g, ""),
  bankIfsc: s.bankIfsc.trim().toUpperCase(),
  bankBranch: s.bankBranch.trim(),
  upiId: s.upiId.trim(),
  invoiceTerms: s.invoiceTerms.trim(),
  quotationTerms: s.quotationTerms.trim(),
});

/* ---------- logo / signature upload ---------- */

const LOGO_MAX_WIDTH = 900;
const LOGO_MAX_HEIGHT = 450;
// Keeps the saved logo comfortably inside the ~5 MB localStorage budget.
const LOGO_MAX_CHARS = 1_000_000;

// Signatures print small, so they can stay lighter than the logo.
const SIGNATURE_MAX_WIDTH = 480;
const SIGNATURE_MAX_HEIGHT = 240;
const SIGNATURE_MAX_CHARS = 400_000;

/** Shared by prepareLogoDataUrl and prepareSignatureDataUrl: shrinks an
 *  uploaded image, crops empty transparent margins, returns a PNG data URL. */
const prepareImageDataUrl = (
  file: File,
  maxWidth: number,
  maxHeight: number,
  maxChars: number
): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read the image."));
    };

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const baseScale = Math.min(
          1,
          maxWidth / image.naturalWidth,
          maxHeight / image.naturalHeight
        );

        const render = (scale: number) => {
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable.");

          context.drawImage(image, 0, 0, width, height);

          const { data } = context.getImageData(0, 0, width, height);
          let minX = width;
          let minY = height;
          let maxX = -1;
          let maxY = -1;

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (data[(y * width + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (maxX < 0) return canvas.toDataURL("image/png"); // fully transparent

          const cropWidth = maxX - minX + 1;
          const cropHeight = maxY - minY + 1;

          if (cropWidth === width && cropHeight === height) {
            return canvas.toDataURL("image/png");
          }

          const cropped = document.createElement("canvas");
          cropped.width = cropWidth;
          cropped.height = cropHeight;
          cropped
            .getContext("2d")
            ?.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

          return cropped.toDataURL("image/png");
        };

        let scale = baseScale;
        let output = render(scale);

        for (let attempt = 0; attempt < 4 && output.length > maxChars; attempt++) {
          scale *= 0.75;
          output = render(scale);
        }

        resolve(output);
      } catch (error) {
        reject(error);
      }
    };

    image.src = objectUrl;
  });

/** Shrinks an uploaded logo, crops empty transparent margins, returns a PNG data URL. */
export const prepareLogoDataUrl = (file: File): Promise<string> =>
  prepareImageDataUrl(file, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT, LOGO_MAX_CHARS);

/** Shrinks an uploaded signature/stamp, crops empty transparent margins,
 *  returns a PNG data URL. A transparent-background PNG prints best. */
export const prepareSignatureDataUrl = (file: File): Promise<string> =>
  prepareImageDataUrl(
    file,
    SIGNATURE_MAX_WIDTH,
    SIGNATURE_MAX_HEIGHT,
    SIGNATURE_MAX_CHARS
  );

/* ---------- print helpers (HTML strings for the PDF windows) ---------- */

const textLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Inline style for the logo band. Dark is the stylesheet default. */
export const letterheadBandStyle = (c: CompanySettings) =>
  c.letterheadTone === "light" ? "background:#ffffff;" : "";

/** Address, phone, email and GST number, shown under the logo. Empty when nothing is filled in.
 *  The address and the GST number print in bold so they stand out on the letterhead. */
export const companyStripHtml = (c: CompanySettings) => {
  const address = textLines(c.address).map(esc).join("<br />");

  const contact = [
    c.phone.trim() && `<span><b>Ph:</b> ${esc(c.phone.trim())}</span>`,
    c.email.trim() && `<span><b>Email:</b> ${esc(c.email.trim())}</span>`,
    c.gstNumber.trim() &&
      `<span><b>GSTIN:</b> <span class="cs-gst-value">${esc(
        c.gstNumber.trim()
      )}</span></span>`,
  ]
    .filter(Boolean)
    .join("");

  if (!address && !contact) return "";

  return `<div class="company-strip">${
    address ? `<div class="cs-address">${address}</div>` : ""
  }${contact ? `<div class="cs-contact">${contact}</div>` : ""}</div>`;
};

/** The "For [Company] / Authorised Signatory" block at the bottom of a printed
 *  document. Uses the uploaded signature/stamp image when there is one,
 *  otherwise falls back to the empty signing space used before. */
export const signatureBlockHtml = (c: CompanySettings, forLabel: string) => {
  const signatureImage = c.signatureDataUrl
    ? `<img class="sign-image" src="${esc(c.signatureDataUrl)}" alt="Authorised signature" />`
    : `<div class="signature-space"></div>`;

  return `<div class="signature">
            <strong>${forLabel}</strong>
            ${signatureImage}
            Authorised Signatory
          </div>`;
};

/** Bank and UPI block for the bottom of an invoice. Empty when nothing is filled in. */
export const bankBlockHtml = (c: CompanySettings) => {
  const rows = [
    ["Account name", c.bankAccountName],
    ["Bank", c.bankName],
    ["Account no.", c.bankAccountNumber],
    ["IFSC", c.bankIfsc],
    ["Branch", c.bankBranch],
    ["UPI ID", c.upiId],
  ].filter(([, value]) => value.trim());

  if (rows.length === 0) return "";

  return `<div class="bank-block"><h3>PAYMENT DETAILS</h3><div class="bank-rows">${rows
    .map(
      ([label, value]) =>
        `<div><span>${esc(label)}</span><strong>${esc(value.trim())}</strong></div>`
    )
    .join("")}</div></div>`;
};

/** "Name • Tagline", leaving out the tagline when it is blank. */
export const companyFooterHtml = (c: CompanySettings) =>
  [c.name.trim(), c.tagline.trim()].filter(Boolean).map(esc).join(" &bull; ");

/** Styles for the blocks above. Drop into the <style> of each print window. */
export const COMPANY_PRINT_CSS = `
          .company-strip {
            padding: 10px 24px 11px;
            text-align: center;
            font-size: 12px;
            line-height: 1.55;
            color: #333333;
          }
          .company-strip .cs-address { font-weight: 700; }
          .company-strip .cs-contact { margin-top: 3px; }
          .company-strip .cs-contact span { display: inline-block; margin: 0 10px; }
          .company-strip b { color: #8a6d1f; }
          .company-strip .cs-gst-value { font-weight: 700; }
          .sign-image {
            display: block;
            height: 56px;
            max-width: 220px;
            width: auto;
            object-fit: contain;
            margin: 6px 0 4px auto;
          }
          @media print {
            .sign-image { height: 42px; margin: 4px 0 2px auto; }
          }
          .bank-block { padding: 14px 24px 0; page-break-inside: avoid; }
          .bank-block h3 {
            background: #e9e4d6;
            margin: 0 0 8px;
            padding: 7px 10px;
            font-size: 13px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .bank-rows {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px 28px;
            padding: 0 10px;
            font-size: 12.5px;
          }
          .bank-rows div { display: flex; gap: 8px; }
          .bank-rows span { min-width: 88px; color: #777777; }
          .bank-rows strong { overflow-wrap: anywhere; }
`;