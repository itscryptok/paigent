import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Custom HTML shell for the Paigent web export — carries Yemi's SEO baseline.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>Paigent — Your Moments, as Art</title>
        <meta
          name="description"
          content="Paigent turns your everyday photos into AI-generated artwork you can order as canvas prints. Your moments, as art."
        />
        <link rel="canonical" href="https://paigent.app/" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Paigent" />
        <meta property="og:title" content="Paigent — Your Moments, as Art" />
        <meta
          property="og:description"
          content="Paigent turns your everyday photos into AI-generated artwork you can order as canvas prints. Your moments, as art."
        />
        <meta property="og:url" content="https://paigent.app/" />
        <meta property="og:image" content="https://paigent.app/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paigent — Your Moments, as Art" />
        <meta
          name="twitter:description"
          content="Paigent turns your everyday photos into AI-generated artwork you can order as canvas prints. Your moments, as art."
        />
        <meta name="twitter:image" content="https://paigent.app/og-image.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Paigent",
              url: "https://paigent.app/",
              logo: "https://paigent.app/og-image.png",
              sameAs: ["https://x.com/paigentapp"],
            }),
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
