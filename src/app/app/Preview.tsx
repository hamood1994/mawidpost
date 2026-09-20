"use client";

import { PLATFORMS, TYPE_LABEL, isVideo, type Account, type Post } from "@/lib/shared";

/** A phone-style preview of how the post will look. */
export default function Preview({ post, account, agency }: { post: Post; account?: Account; agency?: string }) {
  const media = post.media_urls ?? [];
  const story = post.post_type === "story";
  return (
    <div className="phone">
      <div className="phone-head">
        {account?.avatar_url ? <img src={account.avatar_url} alt="" /> : <span className="ph-av">{(account?.handle ?? "؟").slice(0, 1).toUpperCase()}</span>}
        <div>
          <b className="num">@{account?.handle ?? "—"}</b>
          <small>{account ? PLATFORMS[account.platform].label : ""} · {TYPE_LABEL[post.post_type]}</small>
        </div>
      </div>
      {media.length > 0 ? (
        <div className={`phone-media${story ? " story" : ""}`}>
          {isVideo(media[0]) ? <video src={media[0]} controls muted playsInline /> : <img src={media[0]} alt="" />}
          {media.length > 1 && <span className="phone-count num">1/{media.length}</span>}
        </div>
      ) : (
        <div className="phone-media empty">{story ? "ستوري" : "منشور نصي"}</div>
      )}
      {!story && post.caption && <p className="phone-cap">{post.caption}</p>}
      {media.length > 1 && (
        <div className="phone-strip">{media.slice(1, 6).map((u) => (isVideo(u) ? <video key={u} src={u} muted /> : <img key={u} src={u} alt="" />))}</div>
      )}
      {agency && <small className="phone-foot">إعداد {agency}</small>}
    </div>
  );
}
