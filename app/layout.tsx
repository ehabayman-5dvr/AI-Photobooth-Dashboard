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
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${montserrat.className} ${montserrat.variable}`} suppressHydrationWarning>
                <ClientRootLayout>{children}</ClientRootLayout>
            </body>
        </html>
    );
}
