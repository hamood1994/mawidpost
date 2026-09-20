import type { Account, Brand, Org, Plan } from "@/lib/shared";

/** Everything a tab needs to know about the signed-in company. */
export interface Ctx {
  org: Org;
  userId: string;
  email: string;
  brands: Brand[];
  accounts: Account[]; // accounts of the selected brand (or all when brandId is "")
  allAccounts: Account[];
  brandId: string; // "" = all brands
  plans: Plan[];
  plan: Plan | null;
  isAdmin: boolean;
  reload: () => Promise<void>;
}
