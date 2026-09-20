import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface Link { title: string; url: string }

export default async function BioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "x"
  );
  const { data } = await db.from("bio_pages").select("title, bio, avatar_url, links").eq("slug", slug.toLowerCase()).maybeSingle();
  if (!data) return <main className="center">الصفحة غير موجودة.</main>;
  const links = ((data.links as Link[]) ?? []).filter((l) => /^https?:\/\//i.test(l.url));
  return (
    <main className="bio">
      {data.avatar_url && /^https?:\/\//i.test(data.avatar_url) && <img className="av" src={data.avatar_url} alt="" />}
      <h1>{data.title}</h1>
      {data.bio && <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}>{data.bio}</p>}
      {links.map((l, i) => (
        <a key={i} className="lnk" href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.title}</a>
      ))}
      <footer className="bio-foot">
        <a href="https://mawidpost.com" target="_blank" rel="noopener">صُنعت بواسطة <b>موعد بوست</b></a>
        <span>© {new Date().getFullYear()} موعد بوست. جميع الحقوق محفوظة.</span>
      </footer>
    </main>
  );
}
