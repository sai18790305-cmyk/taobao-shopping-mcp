src/types.tsexport type SessionStatus = {
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
  skus: Array<{ name: string; values: string[] }>;
  availability?: string;
};

export type SelectedSku = { name: string; value: string };
