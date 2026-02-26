import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/twitter-header/"],
      },
    ],
    sitemap: "https://www.aureusarena.com/sitemap.xml",
  };
}
