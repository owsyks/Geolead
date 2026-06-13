"use client";

import React from "react";
import Link from "next/link";
import { Check, HelpCircle, ArrowLeft } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg text-text py-16 px-4 relative overflow-hidden">
      {/* Glow effects */}
      <div className="glow-bg w-[400px] h-[400px] bg-brand/10 top-[-50px] right-[-50px]" />
      <div className="glow-bg w-[400px] h-[400px] bg-brand/10 bottom-[-50px] left-[-50px]" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Back Link */}
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Landing Page
          </Link>
        </div>

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-soft text-brand border border-brand/20 inline-block mb-4">
            Simple Pricing, No Hidden Fees
          </span>
          <h1 className="text-4xl md:text-6xl font-black mb-6 text-text">
            Choose the Perfect Plan for Outbound Growth
          </h1>
          <p className="text-text-muted text-lg">
            Scale your domain sales outreach with custom leads scraped and verified in real-time.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
          {/* Starter Plan */}
          <div className="glass rounded-2xl p-8 border border-border flex flex-col justify-between relative">
            <div>
              <h3 className="text-xl font-bold text-text mb-2">Starter</h3>
              <p className="text-xs text-text-muted mb-6">Perfect for individual domain flippers.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-text">$29</span>
                <span className="text-text-muted text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-text-muted">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> 100 Search Queries / mo
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> Basic Google Maps Scrape
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> Email Syntax Validation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> CSV Export Format
                </li>
              </ul>
            </div>
            <Link href="/dashboard" className="mt-8 w-full py-3 rounded-xl bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2 text-center text-sm font-bold transition-colors block">
              Start Starter Plan
            </Link>
          </div>

          {/* Professional Plan (Featured) */}
          <div className="glass rounded-2xl p-8 border border-brand/30 flex flex-col justify-between relative shadow-[0_0_24px_rgba(20,184,166,0.12)]">
            <span className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-[10px] font-bold bg-brand text-bg uppercase tracking-wider">
              Most Popular
            </span>
            <div>
              <h3 className="text-xl font-bold text-text mb-2">Professional</h3>
              <p className="text-xs text-text-muted mb-6">For professional brokers and agencies.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-brand">$79</span>
                <span className="text-text-muted text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-text-muted">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand shrink-0" /> 500 Search Queries / mo
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand shrink-0" /> Deep Website Crawler (1-level)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand shrink-0" /> Advanced Email Validation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand shrink-0" /> AI Domain Relevance Scoring
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand shrink-0" /> CSV, Excel, and JSON Exports
                </li>
              </ul>
            </div>
            <Link href="/dashboard" className="mt-8 w-full py-3 rounded-xl bg-brand text-bg text-center text-sm font-bold transition-all hover:scale-[1.02] hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] block">
              Start Professional Plan
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div className="glass rounded-2xl p-8 border border-border flex flex-col justify-between relative">
            <div>
              <h3 className="text-xl font-bold text-text mb-2">Enterprise</h3>
              <p className="text-xs text-text-muted mb-6">For scaled outbound outreach pipelines.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-text">$149</span>
                <span className="text-text-muted text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-text-muted">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> Unlimited Search Queries
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> Proxy Rotation & CAPTCHA Bypass
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> API Integration Keys
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> CRM-style Notes & Outreach syncing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success shrink-0" /> Dedicated Scraping Worker Threads
                </li>
              </ul>
            </div>
            <Link href="/dashboard" className="mt-8 w-full py-3 rounded-xl bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2 text-center text-sm font-bold transition-colors block">
              Contact Enterprise Sales
            </Link>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto border-t border-border pt-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-text">Frequently Asked Questions</h2>
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
              <div key={idx} className="bg-surface border border-border p-6 rounded-xl">
                <h4 className="font-bold text-text mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4.5 h-4.5 text-brand shrink-0" /> {faq.q}
                </h4>
                <p className="text-text-muted leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
