import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: env.NEXT_PUBLIC_SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];
}
