import { ImageResponse } from "@vercel/og";
import { getPostBySlug, getAllPosts } from "../../lib/posts";

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title || "Aureus Arena";
  const tags = post?.tags || [];
  const readingTime = post?.readingTime || 5;

  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 70px",
        backgroundColor: "#2441ff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Top: Logo & tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              backgroundColor: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              color: "white",
              fontWeight: "bold",
            }}
          >
            A
          </div>
          <span
            style={{
              fontSize: "18px",
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.15em",
              textTransform: "uppercase" as const,
              fontWeight: "600",
            }}
          >
            Aureus Arena
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
          }}
        >
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.8)",
                backgroundColor: "rgba(255,255,255,0.15)",
                padding: "6px 14px",
                borderRadius: "20px",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                fontWeight: "600",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Center: Title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          flex: "1",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            fontSize:
              title.length > 60 ? "42px" : title.length > 40 ? "50px" : "58px",
            fontWeight: "800",
            color: "white",
            lineHeight: "1.15",
            margin: 0,
            maxWidth: "900px",
          }}
        >
          {title}
        </h1>
      </div>

      {/* Bottom: Meta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid rgba(255,255,255,0.15)",
          paddingTop: "24px",
        }}
      >
        <span
          style={{
            fontSize: "16px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          aureusarena.com/blog
        </span>
        <span
          style={{
            fontSize: "16px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {readingTime} min read
        </span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
