export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export type Direction = "ltr" | "rtl";

export type CustomerPortalMessages = {
  appName: string;
  languageLabel: string;
  nav: {
    overview: string;
    crm: string;
    fsm: string;
    tex: string;
    cme: string;
    lqs: string;
    settings: string;
  };
  shell: {
    eyebrow: string;
    title: string;
    subtitle: string;
    activeTenant: string;
    signedInAs: string;
  };
  modules: {
    title: string;
    crm: string;
    fsm: string;
    tex: string;
    cme: string;
    lqs: string;
    unavailable: string;
  };
  metrics: {
    openItems: string;
    approvals: string;
    activity: string;
  };
  activity: {
    title: string;
    empty: string;
  };
};

export const messages = {
  en: {
    appName: "Torrevie",
    languageLabel: "Language",
    nav: {
      overview: "Overview",
      crm: "CRM",
      fsm: "FSM",
      tex: "TEX",
      cme: "CME",
      lqs: "LQS",
      settings: "Settings"
    },
    shell: {
      eyebrow: "Customer Portal",
      title: "Work queue",
      subtitle: "One operating view for subscribed modules, approvals, and current activity.",
      activeTenant: "Active tenant",
      signedInAs: "Signed in as"
    },
    modules: {
      title: "Modules",
      crm: "Customer relationships",
      fsm: "Field service",
      tex: "Travel and expense",
      cme: "Content marketing",
      lqs: "Lead qualification",
      unavailable: "Not subscribed"
    },
    metrics: {
      openItems: "Open items",
      approvals: "Approvals",
      activity: "Recent activity"
    },
    activity: {
      title: "Today",
      empty: "No activity yet. New product work will appear here as modules come online."
    }
  },
  ar: {
    appName: "توريفي",
    languageLabel: "اللغة",
    nav: {
      overview: "نظرة عامة",
      crm: "إدارة العملاء",
      fsm: "الخدمة الميدانية",
      tex: "السفر والمصاريف",
      cme: "تسويق المحتوى",
      lqs: "تأهيل العملاء",
      settings: "الإعدادات"
    },
    shell: {
      eyebrow: "بوابة العملاء",
      title: "قائمة العمل",
      subtitle: "عرض تشغيلي واحد للوحدات المشتركة والموافقات والنشاط الحالي.",
      activeTenant: "المستأجر الحالي",
      signedInAs: "تسجيل الدخول باسم"
    },
    modules: {
      title: "الوحدات",
      crm: "علاقات العملاء",
      fsm: "الخدمة الميدانية",
      tex: "السفر والمصاريف",
      cme: "تسويق المحتوى",
      lqs: "تأهيل العملاء",
      unavailable: "غير مشترك"
    },
    metrics: {
      openItems: "العناصر المفتوحة",
      approvals: "الموافقات",
      activity: "النشاط الأخير"
    },
    activity: {
      title: "اليوم",
      empty: "لا يوجد نشاط بعد. سيظهر عمل المنتجات هنا عند تفعيل الوحدات."
    }
  }
} satisfies Record<Locale, CustomerPortalMessages>;

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function dirForLocale(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getMessages(locale: Locale): CustomerPortalMessages {
  return messages[locale];
}
