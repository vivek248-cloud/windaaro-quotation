import { useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  DragEvent,
  FocusEvent as ReactFocusEvent,
  FormEvent,
  ReactNode,
} from "react";
import logo from "./assets/logo.png";
import type { Language } from "./i18n";
import {
  DEFAULT_QUOTATION_TERMS,
  buildDefaultInvoiceTerms,
  normalizeCompanySettings,
  prepareLogoDataUrl,
  prepareSignatureDataUrl,
  validateCompanySettings,
} from "./settingsStore";
import type {
  CompanySettings,
  FieldError,
  LetterheadTone,
} from "./settingsStore";
import "./SettingsPage.css";

/* =========================================================
  TEXT
  Kept here (not in i18n.ts) so this page is self-contained.
  A missing language falls back to English, like the rest of the app.
========================================================= */

const TEXT: Record<string, Record<Language, string>> = {
  settings: { en: "Settings", ta: "அமைப்புகள்", hi: "सेटिंग्स" },
  settings_subtitle: {
    en: "Company details, payment info and default terms used on your quotations, invoices and receipts.",
    ta: "உங்கள் மேற்கோள்கள், விலைப்பட்டியல்கள் மற்றும் ரசீதுகளில் பயன்படும் நிறுவன விவரங்கள், கட்டண விவரங்கள் மற்றும் இயல்புநிலை விதிமுறைகள்.",
    hi: "आपके कोटेशन, इनवॉइस और रसीदों में इस्तेमाल होने वाले कंपनी विवरण, भुगतान जानकारी और डिफ़ॉल्ट शर्तें।",
  },
  company_profile: { en: "Company profile", ta: "நிறுவன சுயவிவரம்", hi: "कंपनी प्रोफ़ाइल" },
  company_profile_hint: {
    en: "Printed at the top of every quotation, invoice and receipt.",
    ta: "ஒவ்வொரு மேற்கோள், விலைப்பட்டியல் மற்றும் ரசீதின் மேலேயும் அச்சிடப்படும்.",
    hi: "हर कोटेशन, इनवॉइस और रसीद के ऊपर छपता है।",
  },
  company_name: { en: "Company name", ta: "நிறுவனத்தின் பெயர்", hi: "कंपनी का नाम" },
  tagline: { en: "Tagline", ta: "வாசகம்", hi: "टैगलाइन" },
  tagline_hint: {
    en: "Shown in the footer of printed documents.",
    ta: "அச்சிடும் ஆவணங்களின் அடிப்பகுதியில் காட்டப்படும்.",
    hi: "छपे दस्तावेज़ों के फ़ुटर में दिखता है।",
  },
  address: { en: "Address", ta: "முகவரி", hi: "पता" },
  address_hint: {
    en: "One line per row, printed exactly as you type it.",
    ta: "ஒவ்வொரு வரிக்கும் ஒரு வரி; நீங்கள் தட்டச்சு செய்தபடியே அச்சாகும்.",
    hi: "हर पंक्ति में एक लाइन; जैसा लिखेंगे वैसा ही छपेगा।",
  },
  phone: { en: "Phone", ta: "தொலைபேசி", hi: "फ़ोन" },
  email: { en: "Email", ta: "மின்னஞ்சல்", hi: "ईमेल" },
  gst_number: { en: "GST number", ta: "ஜிஎஸ்டி எண்", hi: "जीएसटी नंबर" },
  gst_hint: {
    en: "15 characters, like 22AAAAA0000A1Z5. Leave blank if you're not GST-registered.",
    ta: "15 எழுத்துகள், எ.கா. 22AAAAA0000A1Z5. ஜிஎஸ்டி பதிவு இல்லையெனில் காலியாக விடவும்.",
    hi: "15 अक्षर, जैसे 22AAAAA0000A1Z5। जीएसटी पंजीकृत नहीं हैं तो खाली छोड़ें।",
  },

  logo: { en: "Logo", ta: "லோகோ", hi: "लोगो" },
  logo_hint: {
    en: "Printed in the header of every PDF. PNG, JPG or WEBP, up to 5 MB.",
    ta: "ஒவ்வொரு PDF-இன் மேற்பகுதியிலும் அச்சாகும். PNG, JPG அல்லது WEBP, அதிகபட்சம் 5 MB.",
    hi: "हर PDF के हेडर में छपता है। PNG, JPG या WEBP, अधिकतम 5 MB।",
  },
  upload_logo: { en: "Upload logo", ta: "லோகோவைப் பதிவேற்று", hi: "लोगो अपलोड करें" },
  replace_logo: { en: "Replace logo", ta: "லோகோவை மாற்று", hi: "लोगो बदलें" },
  use_builtin_logo: {
    en: "Use built-in logo",
    ta: "உள்ளமைந்த லோகோவைப் பயன்படுத்து",
    hi: "डिफ़ॉल्ट लोगो इस्तेमाल करें",
  },
  logo_processing: { en: "Preparing logo…", ta: "லோகோ தயாராகிறது…", hi: "लोगो तैयार हो रहा है…" },
  logo_type_error: {
    en: "Choose a PNG, JPG or WEBP image.",
    ta: "PNG, JPG அல்லது WEBP படத்தைத் தேர்ந்தெடுக்கவும்.",
    hi: "PNG, JPG या WEBP छवि चुनें।",
  },
  logo_size_error: {
    en: "That file is over 5 MB. Choose a smaller image.",
    ta: "அந்த கோப்பு 5 MB-ஐ விட பெரியது. சிறிய படத்தைத் தேர்ந்தெடுக்கவும்.",
    hi: "वह फ़ाइल 5 MB से बड़ी है। छोटी छवि चुनें।",
  },
  logo_read_error: {
    en: "Couldn't read that image. Try another file.",
    ta: "அந்தப் படத்தைப் படிக்க முடியவில்லை. வேறு கோப்பை முயற்சிக்கவும்.",
    hi: "वह छवि पढ़ी नहीं जा सकी। कोई दूसरी फ़ाइल आज़माएं।",
  },
  signature: { en: "Signature", ta: "கையொப்பம்", hi: "हस्ताक्षर" },
  signature_hint: {
    en: "Printed above \"Authorised Signatory\" on every quotation, invoice and receipt. PNG with a transparent background works best. PNG, JPG or WEBP, up to 5 MB.",
    ta: "ஒவ்வொரு மேற்கோள், விலைப்பட்டியல் மற்றும் ரசீதிலும் \"Authorised Signatory\" க்கு மேலே அச்சாகும். வெளிப்படையான பின்னணியுள்ள PNG சிறப்பாக இருக்கும். PNG, JPG அல்லது WEBP, அதிகபட்சம் 5 MB.",
    hi: "हर कोटेशन, इनवॉइस और रसीद पर \"Authorised Signatory\" के ऊपर छपता है। पारदर्शी बैकग्राउंड वाली PNG सबसे अच्छी लगती है। PNG, JPG या WEBP, अधिकतम 5 MB।",
  },
  upload_signature: { en: "Upload signature", ta: "கையொப்பத்தைப் பதிவேற்று", hi: "हस्ताक्षर अपलोड करें" },
  replace_signature: { en: "Replace signature", ta: "கையொப்பத்தை மாற்று", hi: "हस्ताक्षर बदलें" },
  remove_signature: { en: "Remove signature", ta: "கையொப்பத்தை அகற்று", hi: "हस्ताक्षर हटाएं" },
  signature_processing: { en: "Preparing signature…", ta: "கையொப்பம் தயாராகிறது…", hi: "हस्ताक्षर तैयार हो रहा है…" },
  signature_empty: {
    en: "No signature uploaded yet — documents will print \"Authorised Signatory\" as text only.",
    ta: "இன்னும் கையொப்பம் பதிவேற்றப்படவில்லை — ஆவணங்களில் \"Authorised Signatory\" என்ற உரையாக மட்டும் அச்சாகும்.",
    hi: "अभी तक कोई हस्ताक्षर अपलोड नहीं हुआ — दस्तावेज़ों पर सिर्फ़ \"Authorised Signatory\" टेक्स्ट के रूप में छपेगा।",
  },
  header_background: { en: "Header background", ta: "தலைப்பு பின்னணி", hi: "हेडर की पृष्ठभूमि" },
  tone_dark: { en: "Dark", ta: "அடர்", hi: "गहरा" },
  tone_light: { en: "Light", ta: "வெளிர்", hi: "हल्का" },
  tone_hint: {
    en: "Choose Light if your logo has dark lettering.",
    ta: "உங்கள் லோகோவில் அடர் நிற எழுத்துகள் இருந்தால் வெளிர் என்பதைத் தேர்ந்தெடுக்கவும்.",
    hi: "अगर आपके लोगो में गहरे रंग के अक्षर हैं तो हल्का चुनें।",
  },

  payment_details: { en: "Bank & UPI details", ta: "வங்கி & UPI விவரங்கள்", hi: "बैंक और UPI विवरण" },
  payment_details_hint: {
    en: "Printed at the bottom of invoices so customers know where to pay.",
    ta: "வாடிக்கையாளர்கள் எங்கு செலுத்த வேண்டும் என்பதை அறிய விலைப்பட்டியலின் கீழே அச்சாகும்.",
    hi: "इनवॉइस के नीचे छपता है ताकि ग्राहक जान सकें कि भुगतान कहां करना है।",
  },
  account_holder: { en: "Account holder name", ta: "கணக்கு வைத்திருப்பவர் பெயர்", hi: "खाताधारक का नाम" },
  bank_name: { en: "Bank name", ta: "வங்கியின் பெயர்", hi: "बैंक का नाम" },
  account_number: { en: "Account number", ta: "கணக்கு எண்", hi: "खाता संख्या" },
  ifsc: { en: "IFSC code", ta: "IFSC குறியீடு", hi: "IFSC कोड" },
  branch: { en: "Branch", ta: "கிளை", hi: "शाखा" },
  upi_id: { en: "UPI ID", ta: "UPI ஐடி", hi: "UPI आईडी" },

  default_terms: {
    en: "Default terms & conditions",
    ta: "இயல்புநிலை விதிமுறைகள் & நிபந்தனைகள்",
    hi: "डिफ़ॉल्ट नियम और शर्तें",
  },
  default_terms_hint: {
    en: "Pre-filled on each new quotation and invoice. You can still edit them on any document.",
    ta: "ஒவ்வொரு புதிய மேற்கோள் மற்றும் விலைப்பட்டியலிலும் முன்பே நிரப்பப்படும். எந்த ஆவணத்திலும் திருத்தலாம்.",
    hi: "हर नए कोटेशन और इनवॉइस में पहले से भरा रहेगा। किसी भी दस्तावेज़ में बदला जा सकता है।",
  },
  quotation_terms: { en: "Quotation terms", ta: "மேற்கோள் விதிமுறைகள்", hi: "कोटेशन की शर्तें" },
  invoice_terms: { en: "Invoice terms", ta: "விலைப்பட்டியல் விதிமுறைகள்", hi: "इनवॉइस की शर्तें" },
  terms_scope_hint: {
    en: "Applies to new documents only. Existing ones keep their own terms.",
    ta: "புதிய ஆவணங்களுக்கு மட்டும் பொருந்தும். ஏற்கனவே உள்ளவை தங்கள் விதிமுறைகளையே வைத்திருக்கும்.",
    hi: "सिर्फ़ नए दस्तावेज़ों पर लागू होता है। पुराने दस्तावेज़ अपनी शर्तें रखते हैं।",
  },
  restore_terms: { en: "Restore standard terms", ta: "நிலையான விதிமுறைகளை மீட்டமை", hi: "मानक शर्तें बहाल करें" },

  preview_title: { en: "How it prints", ta: "அச்சில் எப்படி தெரியும்", hi: "छपने पर कैसा दिखेगा" },
  preview_hint: {
    en: "Updates as you type.",
    ta: "நீங்கள் தட்டச்சு செய்யும்போதே மாறும்.",
    hi: "आपके लिखते ही बदलता है।",
  },
  preview_address_empty: {
    en: "Your address will appear here",
    ta: "உங்கள் முகவரி இங்கே தோன்றும்",
    hi: "आपका पता यहां दिखेगा",
  },
  preview_contact_empty: {
    en: "Phone, email and GST number will appear here",
    ta: "தொலைபேசி, மின்னஞ்சல், ஜிஎஸ்டி எண் இங்கே தோன்றும்",
    hi: "फ़ोन, ईमेल और जीएसटी नंबर यहां दिखेंगे",
  },

  save_changes: { en: "Save changes", ta: "மாற்றங்களைச் சேமி", hi: "बदलाव सहेजें" },
  discard_changes: { en: "Discard changes", ta: "மாற்றங்களை நீக்கு", hi: "बदलाव रद्द करें" },
  unsaved_changes: {
    en: "You have unsaved changes.",
    ta: "சேமிக்கப்படாத மாற்றங்கள் உள்ளன.",
    hi: "आपके बदलाव सहेजे नहीं गए हैं।",
  },
  all_saved: {
    en: "All changes saved on this device.",
    ta: "அனைத்து மாற்றங்களும் இந்தச் சாதனத்தில் சேமிக்கப்பட்டன.",
    hi: "सभी बदलाव इस डिवाइस पर सहेजे गए हैं।",
  },
  changes_saved: {
    en: "Changes saved. New PDFs use these details.",
    ta: "மாற்றங்கள் சேமிக்கப்பட்டன. புதிய PDF-கள் இந்த விவரங்களைப் பயன்படுத்தும்.",
    hi: "बदलाव सहेजे गए। नए PDF इन्हीं विवरणों का उपयोग करेंगे।",
  },
  save_failed: {
    en: "Couldn't save. Browser storage may be full or blocked. Try a smaller logo.",
    ta: "சேமிக்க முடியவில்லை. உலாவி சேமிப்பகம் நிரம்பியிருக்கலாம் அல்லது தடுக்கப்பட்டிருக்கலாம். சிறிய லோகோவை முயற்சிக்கவும்.",
    hi: "सहेजा नहीं जा सका। ब्राउज़र स्टोरेज भरा या बंद हो सकता है। छोटा लोगो आज़माएं।",
  },
  fix_errors: {
    en: "Fix the highlighted fields to save.",
    ta: "சேமிக்க, குறிக்கப்பட்ட புலங்களைச் சரிசெய்யவும்.",
    hi: "सहेजने के लिए चिह्नित फ़ील्ड ठीक करें।",
  },

  err_required: {
    en: "Enter your company name.",
    ta: "நிறுவனத்தின் பெயரை உள்ளிடவும்.",
    hi: "कंपनी का नाम दर्ज करें।",
  },
  err_phone: {
    en: "Enter a valid phone number.",
    ta: "சரியான தொலைபேசி எண்ணை உள்ளிடவும்.",
    hi: "सही फ़ोन नंबर दर्ज करें।",
  },
  err_email: {
    en: "Enter a valid email address.",
    ta: "சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.",
    hi: "सही ईमेल पता दर्ज करें।",
  },
  err_gst: {
    en: "GST number should be 15 characters, like 22AAAAA0000A1Z5.",
    ta: "ஜிஎஸ்டி எண் 15 எழுத்துகள் இருக்க வேண்டும், எ.கா. 22AAAAA0000A1Z5.",
    hi: "जीएसटी नंबर 15 अक्षरों का होना चाहिए, जैसे 22AAAAA0000A1Z5।",
  },
  err_ifsc: {
    en: "IFSC should be 11 characters, like SBIN0001234.",
    ta: "IFSC 11 எழுத்துகள் இருக்க வேண்டும், எ.கா. SBIN0001234.",
    hi: "IFSC 11 अक्षरों का होना चाहिए, जैसे SBIN0001234।",
  },
  err_account: {
    en: "Account number should be 9 to 18 digits.",
    ta: "கணக்கு எண் 9 முதல் 18 இலக்கங்கள் இருக்க வேண்டும்.",
    hi: "खाता संख्या 9 से 18 अंकों की होनी चाहिए।",
  },
  err_upi: {
    en: "UPI ID should look like name@bank.",
    ta: "UPI ஐடி name@bank போல இருக்க வேண்டும்.",
    hi: "UPI आईडी name@bank जैसी होनी चाहिए।",
  },
};

const ERROR_TEXT_KEY: Record<FieldError, string> = {
  required: "err_required",
  phone: "err_phone",
  email: "err_email",
  gst: "err_gst",
  ifsc: "err_ifsc",
  account: "err_account",
  upi: "err_upi",
};

/* =========================================================
  SMALL PIECES
========================================================= */

type TextKey = Exclude<keyof CompanySettings, "letterheadTone">;

const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;

const nonEmptyLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function Field({
  name,
  label,
  hint,
  error,
  required,
  full,
  children,
}: {
  name: TextKey;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  const note = error || hint;

  return (
    <div
      className={`form-group settings-field${full ? " full-width" : ""}${
        error ? " has-error" : ""
      }`}
    >
      <label htmlFor={`settings-${name}`}>
        {label}
        {required && (
          <span className="settings-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>

      {children}

      {note && (
        <small
          id={`settings-${name}-note`}
          className={error ? "settings-error" : "settings-hint"}
          role={error ? "alert" : undefined}
        >
          {note}
        </small>
      )}
    </div>
  );
}

/* =========================================================
  PAGE
========================================================= */

type SettingsPageProps = {
  language: Language;
  settings: CompanySettings;
  /** Returns true when the settings were stored. */
  onSave: (next: CompanySettings) => boolean;
};

type SaveStatus = "idle" | "saved" | "failed" | "invalid";

function SettingsPage({ language, settings, onSave }: SettingsPageProps) {
  const t = (key: string) => TEXT[key]?.[language] || TEXT[key]?.en || key;

  const [draft, setDraft] = useState<CompanySettings>(settings);
  const [touched, setTouched] = useState<Partial<Record<TextKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoDrag, setLogoDrag] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const errors = useMemo(() => validateCompanySettings(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  /* ---------- editing ---------- */

  const update = <K extends keyof CompanySettings>(
    key: K,
    value: CompanySettings[K]
  ) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setStatus("idle");
  };

  const handleText = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const name = event.target.name as TextKey;
    const raw = event.target.value;

    // GST numbers and IFSC codes are always capitals.
    const value =
      name === "gstNumber" || name === "bankIfsc" ? raw.toUpperCase() : raw;

    if (name === "name") {
      // The standard invoice terms mention the company by name. While they
      // are still the untouched standard text, keep them in step with it.
      setDraft((previous) => ({
        ...previous,
        name: value,
        invoiceTerms:
          previous.invoiceTerms === buildDefaultInvoiceTerms(previous.name)
            ? buildDefaultInvoiceTerms(value)
            : previous.invoiceTerms,
      }));
      setStatus("idle");
      return;
    }

    update(name, value);
  };

  const handleBlur = (
    event: ReactFocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const name = event.target.name as TextKey;
    setTouched((previous) => ({ ...previous, [name]: true }));
  };

  const errorFor = (name: TextKey) => {
    const code = errors[name];
    return code && (submitted || touched[name]) ? t(ERROR_TEXT_KEY[code]) : undefined;
  };

  const inputProps = (name: TextKey) => ({
    id: `settings-${name}`,
    name,
    value: draft[name],
    onChange: handleText,
    onBlur: handleBlur,
    "aria-invalid": errorFor(name) ? true : undefined,
    "aria-describedby": `settings-${name}-note`,
  });

  /* ---------- logo ---------- */

  const chooseLogo = async (file?: File | null) => {
    if (!file) return;

    setLogoError("");

    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setLogoError(t("logo_type_error"));
      return;
    }

    if (file.size > MAX_LOGO_FILE_BYTES) {
      setLogoError(t("logo_size_error"));
      return;
    }

    setLogoBusy(true);

    try {
      update("logoDataUrl", await prepareLogoDataUrl(file));
    } catch {
      setLogoError(t("logo_read_error"));
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoPick = (event: ChangeEvent<HTMLInputElement>) => {
    void chooseLogo(event.target.files?.[0]);
    // Lets the same file be chosen again after removing it.
    event.target.value = "";
  };

  const handleLogoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setLogoDrag(false);
    void chooseLogo(event.dataTransfer.files?.[0]);
  };

  /* ---------- signature ---------- */

  const chooseSignature = async (file?: File | null) => {
    if (!file) return;

    setSignatureError("");

    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setSignatureError(t("logo_type_error"));
      return;
    }

    if (file.size > MAX_LOGO_FILE_BYTES) {
      setSignatureError(t("logo_size_error"));
      return;
    }

    setSignatureBusy(true);

    try {
      update("signatureDataUrl", await prepareSignatureDataUrl(file));
    } catch {
      setSignatureError(t("logo_read_error"));
    } finally {
      setSignatureBusy(false);
    }
  };

  const handleSignaturePick = (event: ChangeEvent<HTMLInputElement>) => {
    void chooseSignature(event.target.files?.[0]);
    // Lets the same file be chosen again after removing it.
    event.target.value = "";
  };

  /* ---------- save / discard ---------- */

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);

    const firstInvalid = Object.keys(errors)[0];

    if (firstInvalid) {
      setStatus("invalid");
      document.getElementById(`settings-${firstInvalid}`)?.focus();
      return;
    }

    const next = normalizeCompanySettings(draft);

    if (onSave(next)) {
      setDraft(next);
      setTouched({});
      setSubmitted(false);
      setStatus("saved");
    } else {
      setStatus("failed");
    }
  };

  const handleDiscard = () => {
    setDraft(settings);
    setTouched({});
    setSubmitted(false);
    setLogoError("");
    setSignatureError("");
    setStatus("idle");
  };

  const statusMessage =
    status === "invalid"
      ? t("fix_errors")
      : status === "failed"
      ? t("save_failed")
      : dirty
      ? t("unsaved_changes")
      : status === "saved"
      ? t("changes_saved")
      : t("all_saved");

  /* ---------- preview data ---------- */

  const previewLogo = draft.logoDataUrl || logo;
  const previewName = draft.name.trim() || "—";
  const addressLines = nonEmptyLines(draft.address);

  const contactItems = [
    draft.phone.trim() && { label: "Ph", value: draft.phone.trim() },
    draft.email.trim() && { label: "Email", value: draft.email.trim() },
    draft.gstNumber.trim() && { label: "GSTIN", value: draft.gstNumber.trim() },
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const bankRows = [
    ["Account name", draft.bankAccountName],
    ["Bank", draft.bankName],
    ["Account no.", draft.bankAccountNumber],
    ["IFSC", draft.bankIfsc],
    ["Branch", draft.bankBranch],
    ["UPI ID", draft.upiId],
  ].filter(([, value]) => value.trim());

  const termLines = nonEmptyLines(draft.invoiceTerms);
  const footerText = [draft.name.trim(), draft.tagline.trim()]
    .filter(Boolean)
    .join(" • ");

  const toneOptions: { value: LetterheadTone; label: string }[] = [
    { value: "dark", label: t("tone_dark") },
    { value: "light", label: t("tone_light") },
  ];

  return (
    <section className="content settings-page">
      <div className="customers-header">
        <div>
          <h2>{t("settings")}</h2>
          <p>{t("settings_subtitle")}</p>
        </div>
      </div>

      <div className="settings-layout">
        <form className="settings-form" onSubmit={handleSubmit} noValidate>
          {/* ---------- Company profile ---------- */}
          <section className="panel settings-panel" aria-labelledby="settings-company-title">
            <div className="panel-header">
              <div>
                <h2 id="settings-company-title">{t("company_profile")}</h2>
                <p>{t("company_profile_hint")}</p>
              </div>
            </div>

            <div className="form-grid">
              <Field name="name" label={t("company_name")} error={errorFor("name")} required>
                <input
                  {...inputProps("name")}
                  type="text"
                  autoComplete="organization"
                  aria-required="true"
                  placeholder="e.g. WINDAARO"
                />
              </Field>

              <Field name="tagline" label={t("tagline")} hint={t("tagline_hint")}>
                <input
                  {...inputProps("tagline")}
                  type="text"
                  placeholder="e.g. uPVC WINDOWS & DOORS"
                />
              </Field>

              <Field
                name="address"
                label={t("address")}
                hint={t("address_hint")}
                error={errorFor("address")}
                full
              >
                <textarea
                  {...inputProps("address")}
                  rows={3}
                  autoComplete="street-address"
                  placeholder={"Shop / building, street\nCity, State - Pincode"}
                />
              </Field>

              <Field name="phone" label={t("phone")} error={errorFor("phone")}>
                <input
                  {...inputProps("phone")}
                  type="text"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                />
              </Field>

              <Field name="email" label={t("email")} error={errorFor("email")}>
                <input
                  {...inputProps("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="accounts@yourcompany.com"
                />
              </Field>

              <Field
                name="gstNumber"
                label={t("gst_number")}
                hint={t("gst_hint")}
                error={errorFor("gstNumber")}
              >
                <input
                  {...inputProps("gstNumber")}
                  type="text"
                  maxLength={15}
                  spellCheck={false}
                  autoCapitalize="characters"
                  placeholder="22AAAAA0000A1Z5"
                />
              </Field>
            </div>
          </section>

          {/* ---------- Logo ---------- */}
          <section className="panel settings-panel" aria-labelledby="settings-logo-title">
            <div className="panel-header">
              <div>
                <h2 id="settings-logo-title">{t("logo")}</h2>
                <p>{t("logo_hint")}</p>
              </div>
            </div>

            <div className="settings-logo-row">
              <div
                className={`settings-logo-stage tone-${draft.letterheadTone}${
                  logoDrag ? " drag" : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setLogoDrag(true);
                }}
                onDragLeave={() => setLogoDrag(false)}
                onDrop={handleLogoDrop}
              >
                <img src={previewLogo} alt={`${previewName} logo`} />
              </div>

              <div className="settings-logo-controls">
                <div className="settings-logo-actions">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={handleLogoPick}
                  />

                  <button
                    type="button"
                    className="small-btn"
                    disabled={logoBusy}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoBusy
                      ? t("logo_processing")
                      : draft.logoDataUrl
                      ? t("replace_logo")
                      : t("upload_logo")}
                  </button>

                  {draft.logoDataUrl && (
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => {
                        update("logoDataUrl", "");
                        setLogoError("");
                      }}
                    >
                      {t("use_builtin_logo")}
                    </button>
                  )}
                </div>

                {logoError && (
                  <small className="settings-error" role="alert">
                    {logoError}
                  </small>
                )}

                <div className="settings-tone">
                  <span id="settings-tone-label" className="settings-tone-label">
                    {t("header_background")}
                  </span>

                  <div
                    className="customer-mode-toggle settings-tone-toggle"
                    role="radiogroup"
                    aria-labelledby="settings-tone-label"
                  >
                    {toneOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={draft.letterheadTone === option.value}
                        className={`mode-btn${
                          draft.letterheadTone === option.value ? " active" : ""
                        }`}
                        onClick={() => update("letterheadTone", option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <small className="settings-hint">{t("tone_hint")}</small>
                </div>
              </div>
            </div>
          </section>

          {/* ---------- Signature ---------- */}
          <section className="panel settings-panel" aria-labelledby="settings-signature-title">
            <div className="panel-header">
              <div>
                <h2 id="settings-signature-title">{t("signature")}</h2>
                <p>{t("signature_hint")}</p>
              </div>
            </div>

            <div className="settings-logo-row">
              <div className="settings-logo-stage tone-light">
                {draft.signatureDataUrl ? (
                  <img src={draft.signatureDataUrl} alt="Authorised signature" />
                ) : (
                  <span className="sp-empty">{t("signature_empty")}</span>
                )}
              </div>

              <div className="settings-logo-controls">
                <div className="settings-logo-actions">
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={handleSignaturePick}
                  />

                  <button
                    type="button"
                    className="small-btn"
                    disabled={signatureBusy}
                    onClick={() => signatureInputRef.current?.click()}
                  >
                    {signatureBusy
                      ? t("signature_processing")
                      : draft.signatureDataUrl
                      ? t("replace_signature")
                      : t("upload_signature")}
                  </button>

                  {draft.signatureDataUrl && (
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => {
                        update("signatureDataUrl", "");
                        setSignatureError("");
                      }}
                    >
                      {t("remove_signature")}
                    </button>
                  )}
                </div>

                {signatureError && (
                  <small className="settings-error" role="alert">
                    {signatureError}
                  </small>
                )}
              </div>
            </div>
          </section>

          {/* ---------- Bank & UPI ---------- */}
          <section className="panel settings-panel" aria-labelledby="settings-bank-title">
            <div className="panel-header">
              <div>
                <h2 id="settings-bank-title">{t("payment_details")}</h2>
                <p>{t("payment_details_hint")}</p>
              </div>
            </div>

            <div className="form-grid">
              <Field name="bankAccountName" label={t("account_holder")}>
                <input {...inputProps("bankAccountName")} type="text" autoComplete="off" />
              </Field>

              <Field name="bankName" label={t("bank_name")}>
                <input {...inputProps("bankName")} type="text" autoComplete="off" />
              </Field>

              <Field
                name="bankAccountNumber"
                label={t("account_number")}
                error={errorFor("bankAccountNumber")}
              >
                <input
                  {...inputProps("bankAccountNumber")}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>

              <Field name="bankIfsc" label={t("ifsc")} error={errorFor("bankIfsc")}>
                <input
                  {...inputProps("bankIfsc")}
                  type="text"
                  maxLength={11}
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="SBIN0001234"
                />
              </Field>

              <Field name="bankBranch" label={t("branch")}>
                <input {...inputProps("bankBranch")} type="text" autoComplete="off" />
              </Field>

              <Field name="upiId" label={t("upi_id")} error={errorFor("upiId")}>
                <input
                  {...inputProps("upiId")}
                  type="text"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  placeholder="yourname@bank"
                />
              </Field>
            </div>
          </section>

          {/* ---------- Default terms ---------- */}
          <section className="panel settings-panel" aria-labelledby="settings-terms-title">
            <div className="panel-header">
              <div>
                <h2 id="settings-terms-title">{t("default_terms")}</h2>
                <p>{t("default_terms_hint")}</p>
              </div>
            </div>

            <div className="form-grid settings-terms-grid">
              <Field
                name="quotationTerms"
                label={t("quotation_terms")}
                hint={t("terms_scope_hint")}
                full
              >
                <textarea {...inputProps("quotationTerms")} rows={8} />
              </Field>

              <div className="settings-terms-restore full-width">
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => update("quotationTerms", DEFAULT_QUOTATION_TERMS)}
                >
                  {t("restore_terms")}
                </button>
              </div>

              <Field
                name="invoiceTerms"
                label={t("invoice_terms")}
                hint={t("terms_scope_hint")}
                full
              >
                <textarea {...inputProps("invoiceTerms")} rows={6} />
              </Field>

              <div className="settings-terms-restore full-width">
                <button
                  type="button"
                  className="small-btn"
                  onClick={() =>
                    update("invoiceTerms", buildDefaultInvoiceTerms(draft.name))
                  }
                >
                  {t("restore_terms")}
                </button>
              </div>
            </div>
          </section>

          {/* ---------- Save bar ---------- */}
          <div className={`settings-savebar${dirty ? " dirty" : ""}`}>
            <p
              className={`settings-status status-${
                status === "invalid" || status === "failed" ? "error" : dirty ? "dirty" : "ok"
              }`}
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </p>

            <div className="settings-savebar-actions">
              <button
                type="button"
                className="cancel-btn"
                disabled={!dirty}
                onClick={handleDiscard}
              >
                {t("discard_changes")}
              </button>

              <button type="submit" className="gold-btn" disabled={!dirty}>
                {t("save_changes")}
              </button>
            </div>
          </div>
        </form>

        {/* ---------- Live preview ---------- */}
        <aside className="settings-preview" aria-labelledby="settings-preview-title">
          <div className="settings-preview-head">
            <h3 id="settings-preview-title">{t("preview_title")}</h3>
            <p>{t("preview_hint")}</p>
          </div>

          <div className="settings-paper" aria-hidden="true">
            <div className="sp-topbar" />

            <div className={`sp-band tone-${draft.letterheadTone}`}>
              <img src={previewLogo} alt="" />
            </div>

            <div className="sp-strip">
              {addressLines.length > 0 ? (
                <div className="sp-address sp-address-bold">
                  {addressLines.map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              ) : (
                <div className="sp-empty">{t("preview_address_empty")}</div>
              )}

              {contactItems.length > 0 ? (
                <div className="sp-contact">
                  {contactItems.map((item) => (
                    <span key={item.label}>
                      <b>{item.label}:</b>{" "}
                      {item.label === "GSTIN" ? (
                        <span className="sp-gst-bold">{item.value}</span>
                      ) : (
                        item.value
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="sp-empty">{t("preview_contact_empty")}</div>
              )}
            </div>

            <div className="sp-title">INVOICE</div>

            <div className="sp-skeleton">
              <div className="sp-skeleton-meta">
                <span className="sp-bar" style={{ width: "46%" }} />
                <span className="sp-bar" style={{ width: "30%" }} />
                <span className="sp-bar" style={{ width: "38%" }} />
              </div>

              <div className="sp-skeleton-table">
                <span className="sp-bar sp-bar-head" />
                <span className="sp-bar" />
                <span className="sp-bar" />
                <span className="sp-bar" />
              </div>
            </div>

            {bankRows.length > 0 && (
              <div className="sp-bank">
                <div className="sp-section-title">PAYMENT DETAILS</div>
                <div className="sp-bank-rows">
                  {bankRows.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value.trim()}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {termLines.length > 0 && (
              <div className="sp-terms">
                <div className="sp-section-title">TERMS &amp; CONDITIONS</div>
                {termLines.slice(0, 3).map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
                {termLines.length > 3 && <p className="sp-more">…</p>}
              </div>
            )}

            <div className="sp-sign">
              <strong>For {previewName}</strong>
              {draft.signatureDataUrl && (
                <img
                  className="sp-sign-image"
                  src={draft.signatureDataUrl}
                  alt="Authorised signature"
                />
              )}
              <span>Authorised Signatory</span>
            </div>

            {footerText && <div className="sp-footer">{footerText}</div>}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default SettingsPage;