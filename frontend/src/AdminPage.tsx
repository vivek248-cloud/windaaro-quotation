import { useEffect, useState } from "react";
import type { Language } from "./i18n";
import type { CompanySettings } from "./settingsStore";
import { API_BASE_URL } from "./Api";
import "./AdminPage.css";

/* =========================================================
  TEXT
  Kept here (not in i18n.ts) so this page is self-contained,
  same pattern as SettingsPage.tsx.
========================================================= */

const TEXT: Record<string, Record<Language, string>> = {
  admin_title: { en: "Admin", ta: "நிர்வாகி", hi: "एडमिन" },
  admin_subtitle: {
    en: "Your account, data backups and system status.",
    ta: "உங்கள் கணக்கு, தரவு காப்புப்பிரதிகள் மற்றும் கணினி நிலை.",
    hi: "आपका खाता, डेटा बैकअप और सिस्टम स्थिति।",
  },

  tab_profile: { en: "Profile", ta: "சுயவிவரம்", hi: "प्रोफ़ाइल" },
  tab_security: { en: "Security", ta: "பாதுகாப்பு", hi: "सुरक्षा" },
  tab_backup: { en: "Backup", ta: "காப்புப்பிரதி", hi: "बैकअप" },
  tab_system: { en: "System", ta: "கணினி", hi: "सिस्टम" },

  /* Profile */
  verified: { en: "Active", ta: "செயலில்", hi: "सक्रिय" },
  account_information: { en: "Account Information", ta: "கணக்கு தகவல்", hi: "खाता जानकारी" },
  company_name: { en: "Company name", ta: "நிறுவனத்தின் பெயர்", hi: "कंपनी का नाम" },
  email_address: { en: "Email address", ta: "மின்னஞ்சல் முகவரி", hi: "ईमेल पता" },
  phone_number: { en: "Phone number", ta: "தொலைபேசி எண்", hi: "फ़ोन नंबर" },
  gst_number: { en: "GST number", ta: "ஜிஎஸ்டி எண்", hi: "जीएसटी नंबर" },
  not_set: { en: "Not set", ta: "அமைக்கப்படவில்லை", hi: "सेट नहीं है" },
  edit_in_settings: { en: "Edit in Settings", ta: "அமைப்புகளில் திருத்து", hi: "सेटिंग्स में बदलें" },
  customers_stat: { en: "Customers", ta: "வாடிக்கையாளர்கள்", hi: "ग्राहक" },
  projects_stat: { en: "Projects", ta: "திட்டங்கள்", hi: "प्रोजेक्ट्स" },
  products_stat: { en: "Products", ta: "பொருட்கள்", hi: "उत्पाद" },

  /* Security */
  access_title: { en: "Access & Data", ta: "அணுகல் & தரவு", hi: "पहुंच और डेटा" },
  access_subtitle: {
    en: "How this admin panel is protected right now",
    ta: "இந்த நிர்வாக பலகம் தற்போது எவ்வாறு பாதுகாக்கப்படுகிறது",
    hi: "यह एडमिन पैनल अभी कैसे सुरक्षित है",
  },
  no_login_title: { en: "No login required", ta: "உள்நுழைவு தேவையில்லை", hi: "लॉगिन की आवश्यकता नहीं" },
  no_login_sub: {
    en: "This app doesn't have user accounts or passwords yet — anyone who opens it on this device has full access.",
    ta: "இந்த ஆப்பில் இன்னும் பயனர் கணக்குகள் அல்லது கடவுச்சொற்கள் இல்லை — இந்த சாதனத்தில் இதைத் திறக்கும் எவருக்கும் முழு அணுகல் உண்டு.",
    hi: "इस ऐप में अभी तक यूज़र अकाउंट या पासवर्ड नहीं हैं — जो भी इसे इस डिवाइस पर खोलता है उसे पूरी पहुंच मिलती है।",
  },
  data_storage_title: { en: "Where your data lives", ta: "உங்கள் தரவு எங்கே உள்ளது", hi: "आपका डेटा कहां रहता है" },
  data_storage_sub: {
    en: "Customers, projects, quotations and invoices are stored on your backend server. Company details and preferences are stored in this browser.",
    ta: "வாடிக்கையாளர்கள், திட்டங்கள், மேற்கோள்கள் மற்றும் விலைப்பட்டியல்கள் உங்கள் பேக்எண்ட் சேவையகத்தில் சேமிக்கப்படுகின்றன. நிறுவன விவரங்களும் விருப்பங்களும் இந்த உலாவியில் சேமிக்கப்படுகின்றன.",
    hi: "ग्राहक, प्रोजेक्ट्स, कोटेशन और इनवॉइस आपके बैकएंड सर्वर पर सहेजे जाते हैं। कंपनी विवरण और प्राथमिकताएं इस ब्राउज़र में सहेजी जाती हैं।",
  },
  admin_role_title: { en: "Admin privileges", ta: "நிர்வாக அதிகாரங்கள்", hi: "एडमिन अधिकार" },
  admin_role_sub: { en: "Full access to every page and record", ta: "ஒவ்வொரு பக்கம் மற்றும் பதிவிற்கும் முழு அணுகல்", hi: "हर पेज और रिकॉर्ड तक पूरी पहुंच" },
  full_access: { en: "Full access", ta: "முழு அணுகல்", hi: "पूर्ण पहुंच" },

  /* Backup */
  download_backup_title: { en: "Download Backup", ta: "காப்புப்பிரதியைப் பதிவிறக்கு", hi: "बैकअप डाउनलोड करें" },
  download_backup_desc: {
    en: "Save a snapshot of your customers, projects, quotations, invoices and products as one JSON file.",
    ta: "உங்கள் வாடிக்கையாளர்கள், திட்டங்கள், மேற்கோள்கள், விலைப்பட்டியல்கள் மற்றும் பொருட்களின் ஸ்னாப்ஷாட்டை ஒரு JSON கோப்பாக சேமிக்கவும்.",
    hi: "अपने ग्राहकों, प्रोजेक्ट्स, कोटेशन, इनवॉइस और उत्पादों का एक JSON फ़ाइल के रूप में स्नैपशॉट सहेजें।",
  },
  recommended: { en: "RECOMMENDED", ta: "பரிந்துரைக்கப்படுகிறது", hi: "अनुशंसित" },
  check_all_data: { en: "All records included", ta: "அனைத்து பதிவுகளும் சேர்க்கப்பட்டுள்ளன", hi: "सभी रिकॉर्ड शामिल" },
  check_json: { en: "Readable JSON file", ta: "படிக்கக்கூடிய JSON கோப்பு", hi: "पठनीय JSON फ़ाइल" },
  check_instant: { en: "Instant download", ta: "உடனடி பதிவிறக்கம்", hi: "तुरंत डाउनलोड" },
  download_now: { en: "Download Now", ta: "இப்போது பதிவிறக்கு", hi: "अभी डाउनलोड करें" },
  downloading: { en: "Preparing…", ta: "தயாராகிறது…", hi: "तैयार हो रहा है…" },
  download_failed: {
    en: "Couldn't reach the server. Check your connection and try again.",
    ta: "சேவையகத்தை அடைய முடியவில்லை. உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    hi: "सर्वर तक नहीं पहुंच सका। अपना कनेक्शन जांचें और फिर कोशिश करें।",
  },
  restore_backup_title: { en: "Restore Backup", ta: "காப்புப்பிரதியை மீட்டமை", hi: "बैकअप बहाल करें" },
  restore_backup_desc: {
    en: "Restoring from a backup file isn't available yet in this version — it needs careful handling on the server side first.",
    ta: "காப்புப்பிரதிக் கோப்பிலிருந்து மீட்டமைப்பது இந்த பதிப்பில் இன்னும் கிடைக்கவில்லை — இதற்கு முதலில் சேவையக பக்கத்தில் கவனமான கையாளுதல் தேவை.",
    hi: "इस वर्ज़न में बैकअप फ़ाइल से बहाल करना अभी उपलब्ध नहीं है — इसके लिए पहले सर्वर साइड पर सावधानीपूर्वक काम करना होगा।",
  },
  coming_soon: { en: "COMING SOON", ta: "விரைவில்", hi: "जल्द आ रहा है" },

  /* System */
  live_data: { en: "Live", ta: "நேரலை", hi: "लाइव" },
  system_status: { en: "System Status", ta: "கணினி நிலை", hi: "सिस्टम स्थिति" },
  backend_server: { en: "Backend server", ta: "பேக்எண்ட் சேவையகம்", hi: "बैकएंड सर्वर" },
  connected: { en: "Connected", ta: "இணைக்கப்பட்டது", hi: "कनेक्टेड" },
  unreachable: { en: "Unreachable", ta: "அணுக முடியவில்லை", hi: "पहुंच से बाहर" },
  checking: { en: "Checking…", ta: "சரிபார்க்கிறது…", hi: "जांच हो रही है…" },
  browser_storage: { en: "Browser storage", ta: "உலாவி சேமிப்பகம்", hi: "ब्राउज़र स्टोरेज" },
  available: { en: "Available", ta: "கிடைக்கிறது", hi: "उपलब्ध" },
  language_pref: { en: "Language", ta: "மொழி", hi: "भाषा" },

  quick_actions: { en: "Quick Actions", ta: "விரைவு செயல்கள்", hi: "त्वरित कार्य" },
  go_customers: { en: "View Customers", ta: "வாடிக்கையாளர்களைப் பார்", hi: "ग्राहक देखें" },
  go_projects: { en: "View Projects", ta: "திட்டங்களைப் பார்", hi: "प्रोजेक्ट्स देखें" },
  go_reports: { en: "View Reports", ta: "அறிக்கைகளைப் பார்", hi: "रिपोर्ट देखें" },
  go_settings: { en: "Company Settings", ta: "நிறுவன அமைப்புகள்", hi: "कंपनी सेटिंग्स" },
  quotations_stat: { en: "Quotations", ta: "மேற்கோள்கள்", hi: "कोटेशन" },
  invoices_stat: { en: "Invoices", ta: "விலைப்பட்டியல்கள்", hi: "इनवॉइस" },
};

/* =========================================================
  PAGE
========================================================= */

type AdminTab = "profile" | "security" | "backup" | "system";

type AdminPageProps = {
  language: Language;
  company: CompanySettings;
  customerCount: number;
  projectCount: number;
  productCount: number;
  quotationCount: number;
  invoiceCount: number;
  onNavigate: (page: "customers" | "projects" | "reports" | "settings") => void;
};

function AdminPage({
  language,
  company,
  customerCount,
  projectCount,
  productCount,
  quotationCount,
  invoiceCount,
  onNavigate,
}: AdminPageProps) {
  const t = (key: string) => TEXT[key]?.[language] || TEXT[key]?.en || key;

  const [tab, setTab] = useState<AdminTab>("profile");
  const [backendStatus, setBackendStatus] = useState<"checking" | "up" | "down">("checking");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  // Ping the backend once when the System tab data is relevant.
  useEffect(() => {
    let cancelled = false;
    setBackendStatus("checking");
    fetch(`${API_BASE_URL}/customers/`)
      .then((res) => {
        if (!cancelled) setBackendStatus(res.ok ? "up" : "down");
      })
      .catch(() => {
        if (!cancelled) setBackendStatus("down");
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const initial = (company.name || "W").charAt(0).toUpperCase();

  const handleDownloadBackup = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const endpoints = [
        "customers",
        "projects",
        "products",
        "quotations",
        "invoices",
        "payments",
        "expenses",
      ] as const;

      const results = await Promise.all(
        endpoints.map((name) =>
          fetch(`${API_BASE_URL}/${name}/`).then((res) => {
            if (!res.ok) throw new Error(`Failed to fetch ${name}`);
            return res.json();
          })
        )
      );

      const backup: Record<string, unknown> = {
        generated_at: new Date().toISOString(),
        company: company.name,
      };
      endpoints.forEach((name, index) => {
        backup[name] = results[index];
      });

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `windaaro-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(t("download_failed"));
    } finally {
      setDownloading(false);
    }
  };

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: "profile", label: t("tab_profile"), icon: "◉" },
    { id: "security", label: t("tab_security"), icon: "◈" },
    { id: "backup", label: t("tab_backup"), icon: "▤" },
    { id: "system", label: t("tab_system"), icon: "⚙" },
  ];

  return (
    <section className="content admin-page">
      <div className="customers-header">
        <div>
          <h2>{t("admin_title")}</h2>
          <p>{t("admin_subtitle")}</p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`admin-tab-btn${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* ---------- Profile ---------- */}
      {tab === "profile" && (
        <div className="admin-profile-grid">
          <div className="panel admin-id-card">
            <div className="admin-avatar-lg">{initial}</div>
            <h3>{company.name || "WINDAARO"}</h3>
            <p className="admin-role-pill-text">{t("verified")}</p>

            <div className="admin-stat-row">
              <div className="admin-stat">
                <strong>{customerCount}</strong>
                <span>{t("customers_stat")}</span>
              </div>
              <div className="admin-stat-divider" />
              <div className="admin-stat">
                <strong>{projectCount}</strong>
                <span>{t("projects_stat")}</span>
              </div>
              <div className="admin-stat-divider" />
              <div className="admin-stat">
                <strong>{productCount}</strong>
                <span>{t("products_stat")}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>{t("account_information")}</h2>
              </div>
              <span className="admin-pill admin-pill-green">{t("verified")}</span>
            </div>

            <div className="admin-info-grid">
              <div className="admin-info-row">
                <div className="admin-icon-box admin-icon-gold">◉</div>
                <div>
                  <div className="admin-info-label">{t("company_name")}</div>
                  <div className="admin-info-value">{company.name || t("not_set")}</div>
                </div>
              </div>
              <div className="admin-info-row">
                <div className="admin-icon-box admin-icon-blue">✉</div>
                <div>
                  <div className="admin-info-label">{t("email_address")}</div>
                  <div className="admin-info-value">{company.email || t("not_set")}</div>
                </div>
              </div>
              <div className="admin-info-row">
                <div className="admin-icon-box admin-icon-green">☎</div>
                <div>
                  <div className="admin-info-label">{t("phone_number")}</div>
                  <div className="admin-info-value">{company.phone || t("not_set")}</div>
                </div>
              </div>
              <div className="admin-info-row">
                <div className="admin-icon-box admin-icon-orange">▤</div>
                <div>
                  <div className="admin-info-label">{t("gst_number")}</div>
                  <div className="admin-info-value">{company.gstNumber || t("not_set")}</div>
                </div>
              </div>
            </div>

            <button type="button" className="gold-btn" onClick={() => onNavigate("settings")}>
              {t("edit_in_settings")}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Security ---------- */}
      {tab === "security" && (
        <div className="panel">
          <div className="admin-sec-head">
            <div className="admin-icon-box-lg">◈</div>
            <div>
              <h2>{t("access_title")}</h2>
              <p>{t("access_subtitle")}</p>
            </div>
          </div>

          <div className="admin-sec-row">
            <div className="admin-sec-row-left">
              <div className="admin-icon-box admin-icon-blue">◈</div>
              <div>
                <p className="admin-sec-row-title">{t("no_login_title")}</p>
                <p className="admin-sec-row-sub">{t("no_login_sub")}</p>
              </div>
            </div>
          </div>

          <div className="admin-sec-row">
            <div className="admin-sec-row-left">
              <div className="admin-icon-box admin-icon-green">▤</div>
              <div>
                <p className="admin-sec-row-title">{t("data_storage_title")}</p>
                <p className="admin-sec-row-sub">{t("data_storage_sub")}</p>
              </div>
            </div>
          </div>

          <div className="admin-sec-row">
            <div className="admin-sec-row-left">
              <div className="admin-icon-box admin-icon-gold">◉</div>
              <div>
                <p className="admin-sec-row-title">{t("admin_role_title")}</p>
                <p className="admin-sec-row-sub">{t("admin_role_sub")}</p>
              </div>
            </div>
            <span className="admin-pill admin-pill-gold">{t("full_access")}</span>
          </div>
        </div>
      )}

      {/* ---------- Backup ---------- */}
      {tab === "backup" && (
        <div className="admin-backup-grid">
          <div className="panel admin-backup-card">
            <div className="admin-backup-top">
              <div className="admin-icon-box-lg admin-icon-gold">▤</div>
              <span className="admin-pill admin-pill-green">{t("recommended")}</span>
            </div>
            <h3>{t("download_backup_title")}</h3>
            <p className="admin-backup-desc">{t("download_backup_desc")}</p>

            <ul className="admin-check-list">
              <li>✓ {t("check_all_data")}</li>
              <li>✓ {t("check_json")}</li>
              <li>✓ {t("check_instant")}</li>
            </ul>

            {downloadError && <p className="admin-error-text">{downloadError}</p>}

            <button
              type="button"
              className="gold-btn admin-full-btn"
              onClick={handleDownloadBackup}
              disabled={downloading}
            >
              {downloading ? t("downloading") : t("download_now")}
            </button>
          </div>

          <div className="panel admin-backup-card admin-backup-muted">
            <div className="admin-backup-top">
              <div className="admin-icon-box-lg admin-icon-faint">↻</div>
              <span className="admin-pill admin-pill-faint">{t("coming_soon")}</span>
            </div>
            <h3>{t("restore_backup_title")}</h3>
            <p className="admin-backup-desc">{t("restore_backup_desc")}</p>
          </div>
        </div>
      )}

      {/* ---------- System ---------- */}
      {tab === "system" && (
        <div className="admin-system-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>{t("system_status")}</h2>
              </div>
              <span className="admin-pill admin-pill-green">
                <span className="admin-live-dot" />
                {t("live_data")}
              </span>
            </div>

            <div className="admin-status-row">
              <div>
                <p className="admin-status-name">{t("backend_server")}</p>
                <p className="admin-status-sub">{API_BASE_URL}</p>
              </div>
              <span
                className={`admin-status-ok${backendStatus === "down" ? " admin-status-bad" : ""}`}
              >
                {backendStatus === "checking"
                  ? t("checking")
                  : backendStatus === "up"
                  ? t("connected")
                  : t("unreachable")}
              </span>
            </div>

            <div className="admin-status-row">
              <div>
                <p className="admin-status-name">{t("browser_storage")}</p>
                <p className="admin-status-sub">{t("data_storage_sub")}</p>
              </div>
              <span className="admin-status-ok">{t("available")}</span>
            </div>

            <div className="admin-status-row">
              <div>
                <p className="admin-status-name">{t("language_pref")}</p>
                <p className="admin-status-sub">{language.toUpperCase()}</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>{t("quick_actions")}</h2>
              </div>
            </div>
            <div className="admin-quick-grid">
              <button className="admin-quick-btn" onClick={() => onNavigate("customers")}>
                <span className="admin-icon-box admin-icon-blue">◉</span>
                {t("go_customers")}
                <span className="admin-arrow">→</span>
              </button>
              <button className="admin-quick-btn" onClick={() => onNavigate("projects")}>
                <span className="admin-icon-box admin-icon-green">◫</span>
                {t("go_projects")}
                <span className="admin-arrow">→</span>
              </button>
              <button className="admin-quick-btn" onClick={() => onNavigate("reports")}>
                <span className="admin-icon-box admin-icon-orange">◈</span>
                {t("go_reports")}
                <span className="admin-arrow">→</span>
              </button>
              <button className="admin-quick-btn" onClick={() => onNavigate("settings")}>
                <span className="admin-icon-box admin-icon-gold">⚙</span>
                {t("go_settings")}
                <span className="admin-arrow">→</span>
              </button>
            </div>

            <div className="admin-status-row admin-count-row">
              <span>{t("customers_stat")}</span>
              <strong>{customerCount}</strong>
            </div>
            <div className="admin-status-row admin-count-row">
              <span>{t("projects_stat")}</span>
              <strong>{projectCount}</strong>
            </div>
            <div className="admin-status-row admin-count-row">
              <span>{t("quotations_stat")}</span>
              <strong>{quotationCount}</strong>
            </div>
            <div className="admin-status-row admin-count-row">
              <span>{t("invoices_stat")}</span>
              <strong>{invoiceCount}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminPage;
