import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "IPification Showcase",
  description: "Explore mobile identity and phone verification",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
