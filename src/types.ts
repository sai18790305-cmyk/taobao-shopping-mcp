export type SessionStatus = {
  loggedIn: boolean;
  accountLabel?: string;
  url: string;
  title: string;
  blocked?: boolean;
  message?: string;
};

export type ProductSummary = {
  id: string;
  title: string;
  price?: string;
  imageUrl?: string;
  shop?: string;
  url: string;
};

export type ProductDetail = ProductSummary & {
  images: string[];
  skus: SkuOption[];
  availability?: string;
};

export type SkuOption = { name: string; values: string[] };
export type SelectedSku = { name: string; value: string };

export type AddToCartConfirmation = {
  token: string;
  productUrl: string;
  selections: SelectedSku[];
  expiresAt: string;
};

export type AddToCartResult = {
  executed: boolean;
  added: boolean;
  verified: boolean;
  verification: "success_signal_detected" | "no_success_signal";
  url: string;
};
