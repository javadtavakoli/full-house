import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: env.NEXT_PUBLIC_SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${env.NEXT_PUBLIC_SITE_URL}/trackpilot`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${env.NEXT_PUBLIC_SITE_URL}/ylate`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  ];
}
