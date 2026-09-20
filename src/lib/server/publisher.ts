import { graph, MetaError } from "./meta";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const isVideoUrl = (u: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);

export interface PublishInput {
  platform: "instagram" | "facebook";
  externalId: string; // IG business account id, or Facebook Page id
  token: string; // Page access token
  postType: "post" | "story" | "reel";
  caption: string;
  firstComment: string | null;
  media: string[];
}
export interface PublishResult {
  externalId: string;
  warning?: string;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ───────────── Instagram ─────────────
async function igWaitReady(containerId: string, token: string) {
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    const r = await graph<{ status_code?: string; status?: string }>(containerId, { token, params: { fields: "status_code,status" } });
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") {
      throw new MetaError(`فشلت معالجة الملف عند إنستغرام (${r.status ?? r.status_code})`);
    }
    await sleep(5000);
  }
  throw new MetaError("انتهت مهلة معالجة الملف عند إنستغرام");
}

async function publishInstagram(i: PublishInput): Promise<PublishResult> {
  const { externalId: ig, token, caption, media, postType } = i;
  if (media.length === 0) throw new MetaError("إنستغرام يتطلب صورة أو فيديو");
  let container: string;

  if (postType === "story") {
    const m = media[0];
    const video = isVideoUrl(m);
    const c = await graph<{ id: string }>(`${ig}/media`, {
      method: "POST",
      token,
      params: { media_type: "STORIES", ...(video ? { video_url: m } : { image_url: m }) },
    });
    container = c.id;
    if (video) await igWaitReady(container, token);
  } else if (postType === "reel" || (media.length === 1 && isVideoUrl(media[0]))) {
    if (!isVideoUrl(media[0])) throw new MetaError("الريلز يتطلب فيديو");
    const c = await graph<{ id: string }>(`${ig}/media`, {
      method: "POST",
      token,
      params: { media_type: "REELS", video_url: media[0], caption, share_to_feed: true },
    });
    container = c.id;
    await igWaitReady(container, token);
  } else if (media.length === 1) {
    const c = await graph<{ id: string }>(`${ig}/media`, { method: "POST", token, params: { image_url: media[0], caption } });
    container = c.id;
  } else {
    if (media.length > 10) throw new MetaError("الحد الأقصى 10 ملفات في المنشور المتعدد");
    const children: string[] = [];
    for (const m of media) {
      const video = isVideoUrl(m);
      const c = await graph<{ id: string }>(`${ig}/media`, {
        method: "POST",
        token,
        params: { is_carousel_item: true, ...(video ? { media_type: "VIDEO", video_url: m } : { image_url: m }) },
      });
      if (video) await igWaitReady(c.id, token);
      children.push(c.id);
    }
    const c = await graph<{ id: string }>(`${ig}/media`, {
      method: "POST",
      token,
      params: { media_type: "CAROUSEL", children: children.join(","), caption },
    });
    container = c.id;
    await igWaitReady(container, token);
  }

  const pub = await graph<{ id: string }>(`${ig}/media_publish`, { method: "POST", token, params: { creation_id: container } });

  let warning: string | undefined;
  if (i.firstComment?.trim() && postType !== "story") {
    try {
      await graph(`${pub.id}/comments`, { method: "POST", token, params: { message: i.firstComment } });
    } catch (e) {
      warning = `نُشر المنشور لكن تعذّر إضافة أول تعليق: ${msg(e)}`;
    }
  }
  return { externalId: pub.id, warning };
}

// ───────────── Facebook Page ─────────────
async function uploadByUrl(uploadUrl: string, fileUrl: string, token: string) {
  const res = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: fileUrl } });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error || json.success === false) {
    throw new MetaError(json?.error?.message ?? "تعذّر رفع الفيديو إلى فيسبوك", json?.error?.code, undefined, res.status);
  }
}

async function publishFacebook(i: PublishInput): Promise<PublishResult> {
  const { externalId: page, token, caption, media, postType } = i;
  let postId: string;

  if (postType === "story") {
    if (!media[0]) throw new MetaError("الستوري يتطلب صورة أو فيديو");
    if (isVideoUrl(media[0])) {
      const s = await graph<{ video_id: string; upload_url: string }>(`${page}/video_stories`, { method: "POST", token, params: { upload_phase: "start" } });
      await uploadByUrl(s.upload_url, media[0], token);
      const f = await graph<{ post_id?: string }>(`${page}/video_stories`, { method: "POST", token, params: { upload_phase: "finish", video_id: s.video_id } });
      postId = f.post_id ?? s.video_id;
    } else {
      const ph = await graph<{ id: string }>(`${page}/photos`, { method: "POST", token, params: { url: media[0], published: false } });
      const st = await graph<{ post_id?: string }>(`${page}/photo_stories`, { method: "POST", token, params: { photo_id: ph.id } });
      postId = st.post_id ?? ph.id;
    }
  } else if (postType === "reel" || (media.length === 1 && isVideoUrl(media[0]))) {
    if (!media[0] || !isVideoUrl(media[0])) throw new MetaError("الريلز يتطلب فيديو");
    const s = await graph<{ video_id: string; upload_url: string }>(`${page}/video_reels`, { method: "POST", token, params: { upload_phase: "start" } });
    await uploadByUrl(s.upload_url, media[0], token);
    await graph(`${page}/video_reels`, {
      method: "POST",
      token,
      params: { upload_phase: "finish", video_id: s.video_id, video_state: "PUBLISHED", description: caption },
    });
    postId = s.video_id;
  } else if (media.length === 0) {
    if (!caption.trim()) throw new MetaError("المنشور فارغ");
    const r = await graph<{ id: string }>(`${page}/feed`, { method: "POST", token, params: { message: caption } });
    postId = r.id;
  } else if (media.length === 1) {
    const r = await graph<{ id: string; post_id?: string }>(`${page}/photos`, {
      method: "POST",
      token,
      params: { url: media[0], caption, published: true },
    });
    postId = r.post_id ?? r.id;
  } else {
    const params: Record<string, string> = { message: caption };
    let idx = 0;
    for (const m of media) {
      if (isVideoUrl(m)) throw new MetaError("المنشور المتعدد على فيسبوك يدعم الصور فقط");
      const ph = await graph<{ id: string }>(`${page}/photos`, { method: "POST", token, params: { url: m, published: false } });
      params[`attached_media[${idx++}]`] = JSON.stringify({ media_fbid: ph.id });
    }
    const r = await graph<{ id: string }>(`${page}/feed`, { method: "POST", token, params });
    postId = r.id;
  }

  let warning: string | undefined;
  if (i.firstComment?.trim() && postType !== "story") {
    try {
      await graph(`${postId}/comments`, { method: "POST", token, params: { message: i.firstComment } });
    } catch (e) {
      warning = `نُشر المنشور لكن تعذّر إضافة أول تعليق: ${msg(e)}`;
    }
  }
  return { externalId: postId, warning };
}

export function publishPost(i: PublishInput): Promise<PublishResult> {
  return i.platform === "instagram" ? publishInstagram(i) : publishFacebook(i);
}
