export type TexTutorialScene = "dashboard" | "whatsapp" | "review" | "approval" | "people" | "reports";

export type TexTutorialMediaAsset = {
  alt: string;
  imageSrc?: string;
  posterSrc?: string;
  videoSrc?: string;
};

export const texTutorialMediaAssets: Partial<Record<TexTutorialScene, TexTutorialMediaAsset>> = {
  dashboard: {
    alt: "TEX dashboard showing total spend, pending approvals, and reporting shortcuts"
  },
  whatsapp: {
    alt: "TEX Quick Connect WhatsApp setup showing connection and service status"
  },
  review: {
    alt: "TEX WhatsApp review showing sender matching, receipt attachment, and OCR result"
  },
  approval: {
    alt: "TEX expense queue showing manager approval actions and duplicate signals"
  },
  people: {
    alt: "TEX People module showing employee and team setup"
  },
  reports: {
    alt: "TEX Reports module showing spend trend and category analytics"
  }
};
