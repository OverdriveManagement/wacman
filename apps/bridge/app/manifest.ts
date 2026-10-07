import type { MetadataRoute } from "next";

/** Manifeste : WiBridge s'installe comme une application sur mobile et sur ordinateur. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WiBridge : espace d'échange Wifirst",
    short_name: "WiBridge",
    description: "Questions et demandes d'éléments entre Wifirst et ses clients",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#031820",
    theme_color: "#031820",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
