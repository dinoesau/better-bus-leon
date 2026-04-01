import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rutas de Bus — A-03 & A-75",
  description: "Mapa en tiempo real de las rutas A-03 y A-75 en León, Guanajuato",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        {children}
      </body>
    </html>
  );
}
