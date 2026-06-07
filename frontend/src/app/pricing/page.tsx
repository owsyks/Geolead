"use client";

import React from "react";
import Link from "next/link";
import { Check, HelpCircle, ArrowLeft } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-16 px-4 relative overflow-hidden">
      {/* Glow effects */}
      <div className="glow-bg w-[400px] h-[400px] bg-purple-600/10 top-[-50px] right-[-50px]" />
      <div className="glow-bg w-[400px] h-[400px] bg-teal-600/10 bottom-[-50px] left-[-50px]" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Back Link */}
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Landing Page
          </Link>
        </div>

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 inline-block mb-4">
            Simple Pricing, No Hidden Fees
          </span>
          <h1 className="text-4xl md:text-6xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-slate-100 via-teal-200 to-purple-100">
            Choose the Perfect Plan for Outbound Growth
          </h1>
          <p className="text-slate-400 text-lg">
            Scale your domain sales outreach with custom leads scraped and verified in real-time.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
          {/* Starter Plan */}
          <div className="glass-card rounded-2xl p-8 border-slate-900 flex flex-col justify-between relative">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Starter</h3>
              <p className="text-xs text-slate-500 mb-6">Perfect for individual domain flippers.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-slate-100">$29</span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> 100 Search Queries / mo
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Basic Google Maps Scrape
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Email Syntax Validation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> CSV Export Format
                </li>
              </ul>
            </div>
            <Link href="/dashboard" className="mt-8 w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-center text-sm font-semibold transition-colors block">
              Start Starter Plan
            </Link>
          </div>

          {/* Professional Plan (Featured) */}
          <div className="glass-card rounded-2xl p-8 border-purple-500/30 flex flex-col justify-between relative shadow-xl shadow-purple-500/5">
            <span className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-[10px] font-bold bg-gradient-to-r from-teal-500 to-purple-600 text-white uppercase tracking-wider">
              Most Popular
            </span>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Professional</h3>
              <p className="text-xs text-slate-500 mb-6">For professional brokers and agencies.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-teal-400">$79</span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-teal-400 shrink-0" /> 500 Search Queries / mo
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-teal-400 shrink-0" /> Deep Website Crawler (1-level)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-teal-400 shrink-0" /> Advanced Email Validation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-teal-400 shrink-0" /> AI Domain Relevance Scoring
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-teal-400 shrink-0" /> CSV, Excel, and JSON Exports
                </li>
              </ul>
            </div>
            <Link href="/dashboard" className="mt-8 w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-purple-600 text-white text-center text-sm font-semibold transition-all hover:scale-[1.02] shadow-lg shadow-teal-500/10 block">
              Start Professional Plan
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div className="glass-card rounded-2xl p-8 border-slate-900 flex flex-col justify-between relative">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Enterprise</h3>
              <p className="text-xs text-slate-500 mb-6">For scaled outbound outreach pipelines.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-slate-100">$149</span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Unlimited Search Queries
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Proxy Rotation & CAPTCHA Bypass
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> API Integration Keys
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> CRM-style Notes & Outreach syncing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Dedicated Scraping Worker Threads
                </li>
              </ul>
            </div>
            <Link href="/dashboard" className="mt-8 w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-center text-sm font-semibold transition-colors block">
              Contact Enterprise Sales
            </Link>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto border-t border-slate-200 dark:border-slate-900 pt-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            {[
              {
                q: "How does the scraping process work?",
                a: "GeoLead AI takes your domain keyword ideas, expands them, retrieves top business results from search engines, and crawls their public home/contact pages. It extracts emails, phone numbers, and maps links safely."
              },
              {
                q: "Are the extracted emails GDPR compliant?",
                a: "Yes. GeoLead AI only crawls public webpages to find publicly available business contact info. It removes private email patterns and focuses on generic addresses like info@, sales@, and contact@."
              },
              {
                q: "Can I cancel my subscription anytime?",
                a: "Absolutely. You can downgrade, upgrade, or cancel your active subscription directly inside the accounts setting portal with a single click."
              },
              {
                q: "How accurate is the AI Relevance Score?",
                a: "Our algorithm calculates semantic similarities (e.g. matching 'roofing' with 'contractors') and geographic checks to ensure the business is a perfect fit for buying your geo domain name."
              }
            ].map((faq, idx) => (
              <div key={idx} className="bg-slate-100 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-900/60 p-6 rounded-xl">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4.5 h-4.5 text-teal-400 shrink-0" /> {faq.q}
                </h4>
                <p className="text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
