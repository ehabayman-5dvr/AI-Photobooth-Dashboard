import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import ClientRootLayout from "@/components/ClientRootLayout";

const montserrat = Montserrat({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    variable: "--font-montserrat",
});

export const metadata: Metadata = {
    title: "AI Photobooth — Powered by 5dVR",
    description: "Enterprise management dashboard for 5dVR AI Photobooth projects",
    icons: {
        icon: "/5dvr-logo.png",
        shortcut: "/5dvr-logo.png",
        apple: "/5dvr-logo.png",
    },
};

const supabaseOrigin = (() => {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!raw) return null;
    try {
        return new URL(raw).origin;
    } catch {
        return null;
    }
})();

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {supabaseOrigin && (
                    <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
                )}
                <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
            </head>
            <body className={`${montserrat.className} ${montserrat.variable}`} suppressHydrationWarning>
                <ClientRootLayout>{children}</ClientRootLayout>
            </body>
        </html>
    );
}
