import { siteUrl } from "./admin";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
];

export class MetaError extends Error {
  constructor(message: string, public code?: number, public subcode?: number, public status?: number) {
    super(message);
  }
  get authFailure() {
    return this.code === 190;
  }
  get transient() {
    return (
      [1, 2, 4, 17, 32, 341, 613].includes(this.code ?? -1) ||
      (this.status !== undefined && this.status >= 500) ||
      /fetch failed|ECONN|ETIMEDOUT/i.test(this.message)
    );
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export async function graph<T = any>(
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; params?: Params; token?: string } = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined) p.set(k, String(v));
  if (opts.token) p.set("access_token", opts.token);
  const url = path.startsWith("http") ? path : `${GRAPH}/${path.replace(/^\//, "")}`;
  let res: Response;
  try {
    res =
      method === "GET"
        ? await fetch(`${url}${url.includes("?") ? "&" : "?"}${p}`)
        : await fetch(url, { method, headers: { "content-type": "application/x-www-form-urlencoded" }, body: p });
  } catch (e) {
    throw new MetaError(e instanceof Error ? e.message : "fetch failed");
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new MetaError(e.error_user_msg || e.message || `Meta HTTP ${res.status}`, e.code, e.error_subcode, res.status);
  }
  return json as T;
}

export const redirectUri = () => `${siteUrl()}/api/meta/callback`;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function oauthUrl(state: string): string {
  const p = new URLSearchParams({ client_id: need("META_APP_ID"), redirect_uri: redirectUri(), state, response_type: "code" });
  if (process.env.META_CONFIG_ID) {
    p.set("config_id", process.env.META_CONFIG_ID); // Facebook Login for Business
    p.set("override_default_response_type", "true");
  } else {
    p.set("scope", (process.env.META_SCOPES || DEFAULT_SCOPES.join(",")).replace(/\s+/g, ""));
  }
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const r = await graph<{ access_token: string }>("oauth/access_token", {
    params: { client_id: need("META_APP_ID"), client_secret: need("META_APP_SECRET"), redirect_uri: redirectUri(), code },
  });
  return r.access_token;
}

export async function longLivedToken(shortToken: string): Promise<string> {
  const r = await graph<{ access_token: string }>("oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: need("META_APP_ID"),
      client_secret: need("META_APP_SECRET"),
      fb_exchange_token: shortToken,
    },
  });
  return r.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
}

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const out: MetaPage[] = [];
  let next: string | undefined;
  let first = true;
  for (let i = 0; i < 10; i++) {
    const r: { data: MetaPage[]; paging?: { next?: string } } = first
      ? await graph("me/accounts", {
          token: userToken,
          params: { fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: 100 },
        })
      : await graph(next as string);
    out.push(...r.data);
    first = false;
    next = r.paging?.next;
    if (!next) break;
  }
  return out;
}
