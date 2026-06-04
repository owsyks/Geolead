import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DomainContextProvider } from "@/lib/domainContext";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
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
  title: "GeoLead AI - Find. Connect. Close.",
  description: "AI-powered geo-domain outreach, campaign automation, inbox triage, analytics, sender management, and lead discovery.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

// Bitdefender's browser extension (and similar trackers/blockers) injects
// attributes onto random elements before React hydrates. We strip the known
// attribute names from every node as soon as they appear, so React sees a
// clean DOM. The script ITSELF still gets attrs injected onto it — for that
// element we rely on `suppressHydrationWarning` to silence React's check.
const STRIP_EXTENSION_ATTRS = `
(function(){
  var attrPrefixes = ['bis_','data-bis-','__processed_','data-dynamic-id'];
  function shouldStrip(name){
    if(!name) return false;
    for(var i=0;i<attrPrefixes.length;i++){
      if(name === attrPrefixes[i] || name.indexOf(attrPrefixes[i]) === 0) return true;
    }
    return false;
  }
  function strip(node){
    if(!node || node.nodeType !== 1 || !node.attributes) return;
    for(var j=node.attributes.length-1;j>=0;j--){
      var a = node.attributes[j];
      if(a && shouldStrip(a.name)) node.removeAttribute(a.name);
    }
  }
  function sweep(root){
    if(!root) return;
    strip(root);
    if(root.querySelectorAll){
      var all = root.querySelectorAll('*');
      for(var i=0;i<all.length;i++) strip(all[i]);
    }
  }
  try { sweep(document.documentElement); } catch(e){}
  try {
    var mo = new MutationObserver(function(records){
      for(var i=0;i<records.length;i++){
        var r = records[i];
        if(r.type === 'attributes') strip(r.target);
        if(r.addedNodes){
          for(var k=0;k<r.addedNodes.length;k++) sweep(r.addedNodes[k]);
        }
      }
    });
    mo.observe(document.documentElement, { attributes: true, subtree: true, childList: true });
  } catch(e){ /* ignore */ }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: STRIP_EXTENSION_ATTRS }}
        />
      </head>
      <body
        className="min-h-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased flex flex-col font-sans"
        suppressHydrationWarning
      >
        <AuthProvider>
          <ThemeProvider>
            <DomainContextProvider>{children}</DomainContextProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
