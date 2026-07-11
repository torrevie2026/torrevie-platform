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
    admin: string;
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
  adminUsers: {
    eyebrow: string;
    title: string;
    subtitle: string;
    requiredRole: string;
    tenantScope: string;
    rlsContext: string;
    inviteUser: string;
    email: string;
    displayName: string;
    displayNamePlaceholder: string;
    role: string;
    invite: string;
    tenantUsers: string;
    user: string;
    status: string;
    action: string;
    update: string;
  };
  crmSlice: {
    eyebrow: string;
    title: string;
    subtitle: string;
    entitlement: string;
    owner: string;
    flow: string;
    flowValue: string;
    metricsLabel: string;
    accounts: string;
    contacts: string;
    opportunities: string;
    workspaceLabel: string;
    createOpportunity: string;
    accountName: string;
    contactName: string;
    opportunityName: string;
    amount: string;
    stage: string;
    create: string;
    pipeline: string;
    emptyStage: string;
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
      admin: "Users",
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
    },
    adminUsers: {
      eyebrow: "Tenant administration",
      title: "Users and roles",
      subtitle: "Invite users, update tenant membership status, and assign customer-scoped roles.",
      requiredRole: "Required role",
      tenantScope: "Tenant scope",
      rlsContext: "RLS context",
      inviteUser: "Invite user",
      email: "Email",
      displayName: "Display name",
      displayNamePlaceholder: "Full name",
      role: "Role",
      invite: "Invite",
      tenantUsers: "Tenant users",
      user: "User",
      status: "Status",
      action: "Action",
      update: "Update"
    },
    crmSlice: {
      eyebrow: "CRM",
      title: "Pipeline",
      subtitle: "Create an account, add a contact, and move an opportunity through one tenant-scoped pipeline.",
      entitlement: "Entitlement",
      owner: "Owner",
      flow: "Flow",
      flowValue: "Account to opportunity",
      metricsLabel: "CRM metrics",
      accounts: "Accounts",
      contacts: "Contacts",
      opportunities: "Opportunities",
      workspaceLabel: "CRM workspace",
      createOpportunity: "Create opportunity",
      accountName: "Account name",
      contactName: "Contact name",
      opportunityName: "Opportunity name",
      amount: "Amount",
      stage: "Stage",
      create: "Create",
      pipeline: "Pipeline",
      emptyStage: "No opportunities"
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
      admin: "المستخدمون",
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
    },
    adminUsers: {
      eyebrow: "إدارة المستأجر",
      title: "المستخدمون والأدوار",
      subtitle: "دعوة المستخدمين وتحديث حالة العضوية وتعيين أدوار العملاء.",
      requiredRole: "الدور المطلوب",
      tenantScope: "نطاق المستأجر",
      rlsContext: "سياق أمان الصفوف",
      inviteUser: "دعوة مستخدم",
      email: "البريد الإلكتروني",
      displayName: "اسم العرض",
      displayNamePlaceholder: "الاسم الكامل",
      role: "الدور",
      invite: "دعوة",
      tenantUsers: "مستخدمو المستأجر",
      user: "المستخدم",
      status: "الحالة",
      action: "الإجراء",
      update: "تحديث"
    },
    crmSlice: {
      eyebrow: "إدارة العملاء",
      title: "خط المبيعات",
      subtitle: "إنشاء حساب وإضافة جهة اتصال وتحريك فرصة ضمن خط مبيعات خاص بالمستأجر.",
      entitlement: "الاشتراك",
      owner: "المالك",
      flow: "التدفق",
      flowValue: "من الحساب إلى الفرصة",
      metricsLabel: "مؤشرات إدارة العملاء",
      accounts: "الحسابات",
      contacts: "جهات الاتصال",
      opportunities: "الفرص",
      workspaceLabel: "مساحة إدارة العملاء",
      createOpportunity: "إنشاء فرصة",
      accountName: "اسم الحساب",
      contactName: "اسم جهة الاتصال",
      opportunityName: "اسم الفرصة",
      amount: "المبلغ",
      stage: "المرحلة",
      create: "إنشاء",
      pipeline: "خط المبيعات",
      emptyStage: "لا توجد فرص"
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
