export type TexTutorialScene = "dashboard" | "whatsapp" | "review" | "approval" | "people" | "reports";

export type TexTutorialMediaAsset = {
  alt: string;
  imageSrc?: string;
  posterSrc?: string;
  videoSrc?: string;
};

export const texTutorialMediaAssets: Partial<Record<TexTutorialScene, TexTutorialMediaAsset>> = {
  dashboard: {
    alt: "TEX dashboard showing total spend, pending approvals, and reporting shortcuts",
    imageSrc: "/tex/tutorial/dashboard.jpg"
  },
  whatsapp: {
    alt: "TEX Quick Connect WhatsApp setup showing connection and service status",
    imageSrc: "/tex/tutorial/whatsapp.jpg"
  },
  review: {
    alt: "TEX WhatsApp review showing sender matching, receipt attachment, and OCR result",
    imageSrc: "/tex/tutorial/review.jpg"
  },
  approval: {
    alt: "TEX expense queue showing manager approval actions and duplicate signals",
    imageSrc: "/tex/tutorial/approval.jpg"
  },
  people: {
    alt: "TEX People module showing employee and team setup",
    imageSrc: "/tex/tutorial/people.jpg"
  },
  reports: {
    alt: "TEX Reports module showing spend trend and category analytics",
    imageSrc: "/tex/tutorial/reports.jpg"
  }
};
