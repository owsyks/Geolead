"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ComposerModal } from "./ComposerModal";
import { VerificationModal, type EmailProgress } from "./VerificationModal";
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import { authFetch, fetchOutbound } from "@/lib/outbound";
import {
  Search,
  MapPin,
  Download,
  Settings,
  Database,
  ArrowLeft,
  History,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Mail,
  MessageSquare,
  Phone,
  FileText,
  Save,
  Globe,
  AlertCircle,
  HelpCircle,
  Plus,
  ShieldCheck,
  Send,
  Zap,
  X
} from "lucide-react";

// API URL (Express backend) — env override allowed for non-localhost setups
const BACKEND_URL = process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://localhost:5000";
const MAX_SEARCH_DEPTH = 200;
const DEMO_CREATED_AT = "2026-05-22T00:00:00.000Z";
const DEMO_TASK_ONE_CREATED_AT = "2026-05-21T23:00:00.000Z";
const DEMO_TASK_TWO_CREATED_AT = "2026-05-21T22:00:00.000Z";

interface LeadEmail {
  id: string;
  email: string;
  status: 'VALID' | 'RISKY' | 'INVALID';
  confidenceScore: number;
  sourcePage?: string;
}

interface Lead {
  id: string;
  businessName: string;
  website?: string;
  location?: string;
  googleMapsLink?: string;
  category?: string;
  rating?: number;
  reviewsCount?: number;
  phoneNumbers: string[];
  socialLinks: string[];
  domainMatchScore: number;
  scoreExplanation?: string;
  notes?: string;
  leadStatus?: string;
  pipelineStage?: string;
  tags?: string[];
  reminderAt?: string;
  nextFollowUpAt?: string;
  engagementScore?: number;
  replyCount?: number;
  openCount?: number;
  clickCount?: number;
  unsubscribed?: boolean;
  doNotContact?: boolean;
  companySize?: string;
  summary?: string;
  createdAt: string;
  emails: LeadEmail[];
  // Contact intelligence
  whatsappScore?: number | null;
  whatsappConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  bestContactChannel?: 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'WEBSITE_FORM' | null;
  contactChannelScores?: { email: number; whatsapp: number; phone: number; websiteForm: number } | null;
  // Decision maker & buyer intelligence
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
  decisionMakerScore?: number | null;
  decisionMakerEmail?: string | null;
  buyerIntentScore?: number | null;
  domainUpgradeScore?: number | null;
  businessQualityScore?: number | null;
  priorityScore?: number | null;
  buyerInsights?: Record<string, any> | null;
  contactStrategy?: string | null;
}

interface SearchTask {
  id: string;
  keyword: string;
  domainIdea: string;
  country?: string;
  cityState?: string;
  searchDepth: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED';
  progress: number;
  totalLeads: number;
  validEmails: number;
  createdAt: string;
}

type ExportCellValue = string | number;
type ExportRow = Record<string, ExportCellValue>;

export default function DashboardPage() {
  // Input Form States
  const { activeDomain } = useDomainContext();
  const [keyword, setKeyword] = useState("");
  const [domainIdea, setDomainIdea] = useState("");
  const [country] = useState("United States");
  const [cityState, setCityState] = useState("");
  const [searchDepth, setSearchDepth] = useState(10);

  // Auto-populate lead-search inputs from the active portfolio domain so the
  // user never re-types keyword/domain/geo — they just pick from the portfolio.
  useEffect(() => {
    if (!activeDomain) return;
    setDomainIdea(activeDomain.name);
    const derivedKeyword = [activeDomain.city || activeDomain.state, activeDomain.niche || activeDomain.industry]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (derivedKeyword) setKeyword(derivedKeyword);
    const derivedCity = [activeDomain.city, activeDomain.state].filter(Boolean).join(", ");
    if (derivedCity) setCityState(derivedCity);
  }, [activeDomain]);

  // Data States
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<SearchTask | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv');
  const [exportEmailsOnly, setExportEmailsOnly] = useState(false);
  const [exportIncludeRisky, setExportIncludeRisky] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Pagination & Filtering & Sorting States
  const [searchFilterInput, setSearchFilterInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [hasEmailsOnly, setHasEmailsOnly] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp_high' | 'email_available' | 'phone_available' | 'multi_channel'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [minBuyerIntent, setMinBuyerIntent] = useState<number>(0);
  const [minPriority, setMinPriority] = useState<number>(0);
  const [sortField] = useState("domainMatchScore");
  const [sortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeadsCount, setTotalLeadsCount] = useState(0);

  // In-line Notes Editing States
  const [editingNotesLeadId, setEditingNotesLeadId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");

  // Email verification state (modal-driven)
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: number; risky: number; invalid: number; total: number } | null>(null);
  const [verifyProgress, setVerifyProgress] = useState<{ results: EmailProgress[]; total: number; done: number; complete: boolean }>({ results: [], total: 0, done: 0, complete: false });

  // WA validation panel state
  const [showWaPanel, setShowWaPanel] = useState(false);

  // Solo-send composer state
  const [composer, setComposer] = useState<{ to: string; lead: Lead } | null>(null);
  const [senders, setSenders] = useState<Array<{ id: string; provider: string; fromEmail: string; fromName: string; status: string }>>([]);
  const [composerSenderId, setComposerSenderId] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerSending, setComposerSending] = useState(false);
  const [composerResult, setComposerResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Pause/Stop/Resume handlers
  const handlePauseTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await authFetch(`${BACKEND_URL}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED' }),
      });
      fetchHistory();
    } catch { /* ignore */ }
  };

  const handleResumeTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await authFetch(`${BACKEND_URL}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING' }),
      });
      fetchHistory();
    } catch { /* ignore */ }
  };

  const handleStopTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await authFetch(`${BACKEND_URL}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      fetchHistory();
    } catch { /* ignore */ }
  };

  // Campaign creation modal state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignThrottle, setCampaignThrottle] = useState(5);
  const [campaignCreating, setCampaignCreating] = useState(false);

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const selectAllLeads = () => {
    if (selectedLeadIds.size >= leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map(l => l.id)));
    }
  };

  const handleCreateCampaign = async () => {
    if (!selectedTask || selectedLeadIds.size === 0) return;
    setCampaignCreating(true);
    try {
      const leadIds = Array.from(selectedLeadIds);
      await fetchOutbound(`/api/outbound/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName || `Auto: ${selectedTask.domainIdea}`,
          geoDomain: selectedTask.domainIdea,
          niche: selectedTask.keyword,
          cityState: selectedTask.cityState || '',
          objective: 'Convert verified geo-domain leads into interested buyers',
          tone: 'professional',
          language: 'en',
          dailyLimit: campaignThrottle,
          smartDelayMin: 1,
          smartDelayMax: 10,
          leadIds,
          status: 'DRAFT',
        }),
      });
      setShowCampaignModal(false);
      setSelectedLeadIds(new Set());
      setCampaignName('');
    } catch (err) {
      console.error('Create campaign error:', err);
    }
    setCampaignCreating(false);
  };
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const demoInterval = useRef<NodeJS.Timeout | null>(null);
  const verifyPollInterval = useRef<NodeJS.Timeout | null>(null);
  const mounted = useRef(true);

  // Fetch search task history
  const fetchHistory = async () => {
    try {
      const response = await authFetch(`${BACKEND_URL}/api/history`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setTasks(data);
      setIsDemoMode(false);
      
      // Auto-select latest task if available
      if (data.length > 0 && !selectedTask) {
        handleSelectTask(data[0]);
      }
    } catch {
      console.log("Could not connect to backend server. Loading offline demo mode.");
      setIsDemoMode(true);
      loadDemoData();
    }
  };

  // Load static demo/mock data if backend is offline
  const loadDemoData = () => {
    const mockTasks: SearchTask[] = [
      {
        id: "demo-task-1",
        keyword: "Miami Dental Clinic",
        domainIdea: "MiamiDentistCare.com",
        country: "United States",
        cityState: "Miami, FL",
        searchDepth: 10,
        status: "COMPLETED",
        progress: 100,
        totalLeads: 4,
        validEmails: 3,
        createdAt: DEMO_TASK_ONE_CREATED_AT,
      },
      {
        id: "demo-task-2",
        keyword: "London Roofing",
        domainIdea: "LondonRoofContractors.co.uk",
        country: "United Kingdom",
        cityState: "London",
        searchDepth: 10,
        status: "COMPLETED",
        progress: 100,
        totalLeads: 3,
        validEmails: 2,
        createdAt: DEMO_TASK_TWO_CREATED_AT,
      }
    ];

    setTasks(mockTasks);
    // Select first task by default
    setDemoTaskLeads(mockTasks[0].id);
  };

  // Load mock leads based on demo task ID
  const setDemoTaskLeads = (taskId: string) => {
    let mockLeads: Lead[] = [];

    if (taskId === "demo-task-1") {
      mockLeads = [
        {
          id: "lead-1-1",
          businessName: "Miami Dental Spa",
          website: "https://www.miamidentalspa.com",
          location: "123 Brickell Ave, Miami, FL",
          googleMapsLink: "https://www.google.com/maps?cid=123",
          category: "Dental Spa / Cosmetics",
          rating: 4.9,
          reviewsCount: 312,
          phoneNumbers: ["(305) 555-0144"],
          socialLinks: ["https://facebook.com/miamidentalspa", "https://instagram.com/miamidentalspa"],
          domainMatchScore: 95,
          scoreExplanation: "Matches both geographic indicator ('Miami') and niche synonyms ('Dental' <-> 'Dentist'). Outstanding fit.",
          companySize: "Medium",
          summary: "Miami Dental Spa is a highly-rated cosmetic dentistry clinic. Perfect match to capture high-intent local patients.",
          notes: "Spoke with front desk. Emailed proposal to manager.",
          createdAt: DEMO_CREATED_AT,
          emails: [
            { id: "e1", email: "info@miamidentalspa.com", status: "VALID", confidenceScore: 0.9 },
            { id: "e2", email: "appointments@miamidentalspa.com", status: "VALID", confidenceScore: 0.8 }
          ]
        },
        {
          id: "lead-1-2",
          businessName: "Brickell Family Dental Care",
          website: "https://www.brickelldental.com",
          location: "456 Miami Ave, Miami, FL",
          googleMapsLink: "https://www.google.com/maps?cid=456",
          category: "Dentist Office",
          rating: 4.7,
          reviewsCount: 88,
          phoneNumbers: ["(305) 555-0210"],
          socialLinks: ["https://linkedin.com/company/brickelldental"],
          domainMatchScore: 88,
          scoreExplanation: "High category correlation ('Dental Care' vs 'DentistCare') and verified Miami location.",
          companySize: "Small",
          notes: "Left voicemail. Website lists contact form.",
          createdAt: DEMO_CREATED_AT,
          emails: [
            { id: "e3", email: "office@brickelldental.com", status: "VALID", confidenceScore: 0.8 },
            { id: "e4", email: "contact@brickelldental.com", status: "RISKY", confidenceScore: 0.6 }
          ]
        },
        {
          id: "lead-1-3",
          businessName: "South Florida Dentistry",
          website: "https://www.southfldentistry.org",
          location: "789 Coral Way, Coral Gables, FL",
          googleMapsLink: "https://www.google.com/maps?cid=789",
          category: "Dentist",
          rating: 4.4,
          reviewsCount: 22,
          phoneNumbers: ["(305) 555-0988"],
          socialLinks: [],
          domainMatchScore: 72,
          scoreExplanation: "Good sector match. Geographically covers South Florida region, including Miami Gables.",
          companySize: "Small",
          notes: "",
          createdAt: DEMO_CREATED_AT,
          emails: [
            { id: "e5", email: "drsmith@southfldentistry.org", status: "RISKY", confidenceScore: 0.5 }
          ]
        },
        {
          id: "lead-1-4",
          businessName: "Vance Dental Labs",
          website: "https://www.vancedentallabs.com",
          location: "990 Flagler St, Miami, FL",
          googleMapsLink: "https://www.google.com/maps?cid=999",
          category: "Dental Laboratory",
          rating: 4.0,
          reviewsCount: 5,
          phoneNumbers: ["(305) 555-4422"],
          socialLinks: [],
          domainMatchScore: 61,
          scoreExplanation: "Located in Miami. However, business is a commercial dental lab, not a consumer dental clinic.",
          companySize: "Medium",
          notes: "",
          createdAt: DEMO_CREATED_AT,
          emails: []
        }
      ];
    } else {
      mockLeads = [
        {
          id: "lead-2-1",
          businessName: "London Roof Cleaners & Contractors",
          website: "https://www.londonroofers.co.uk",
          location: "20 Baker St, London, UK",
          googleMapsLink: "https://www.google.com/maps?cid=901",
          category: "Roofing Contractor",
          rating: 4.8,
          reviewsCount: 145,
          phoneNumbers: ["+44 20 7946 0192"],
          socialLinks: ["https://twitter.com/londonroofers"],
          domainMatchScore: 96,
          scoreExplanation: "Perfect domain keyword overlap ('LondonRoofContractors' <-> 'London Roof... Contractors'). Highly recommended lead.",
          companySize: "Medium",
          notes: "Sent domain sale proposal email.",
          createdAt: DEMO_CREATED_AT,
          emails: [
            { id: "e6", email: "info@londonroofers.co.uk", status: "VALID", confidenceScore: 0.9 },
            { id: "e7", email: "sales@londonroofers.co.uk", status: "VALID", confidenceScore: 0.9 }
          ]
        },
        {
          id: "lead-2-2",
          businessName: "Apex Shingle & Siding Services",
          website: "https://www.apexroofinglondon.com",
          location: "55 Kensington Rd, London, UK",
          googleMapsLink: "https://www.google.com/maps?cid=902",
          category: "Roofing Services",
          rating: 4.6,
          reviewsCount: 64,
          phoneNumbers: ["+44 20 7946 0442"],
          socialLinks: [],
          domainMatchScore: 82,
          scoreExplanation: "Good location overlap. Niche alignment is high (shingles & roofing).",
          companySize: "Small",
          notes: "",
          createdAt: DEMO_CREATED_AT,
          emails: [
            { id: "e8", email: "hello@apexroofinglondon.com", status: "VALID", confidenceScore: 0.8 }
          ]
        },
        {
          id: "lead-2-3",
          businessName: "Kensington Home Improvement",
          website: "https://www.kensingtonhomes.co.uk",
          location: "72 High St, London, UK",
          rating: 4.1,
          reviewsCount: 12,
          phoneNumbers: ["+44 20 7946 0555"],
          socialLinks: [],
          domainMatchScore: 55,
          scoreExplanation: "General home contractor located in London. Not specifically focused on roofing, but related.",
          companySize: "Small",
          notes: "",
          createdAt: DEMO_CREATED_AT,
          emails: []
        }
      ];
    }

    setLeads(mockLeads);
    setTotalLeadsCount(mockLeads.length);
    setTotalPages(1);
  };

  // Select a task and load its leads
  const handleSelectTask = (task: SearchTask) => {
    setSelectedTask(task);
    setPage(1);

    if (isDemoMode) {
      setDemoTaskLeads(task.id);
      return;
    }

    // If task is active (PENDING or PROCESSING), start polling
    if (task.status === "PENDING" || task.status === "PROCESSING") {
      startPolling(task.id);
    } else {
      stopPolling();
    }
  };

  // Fetch leads for a task
  const fetchTaskLeads = useCallback(async (taskId: string, forcePage?: number) => {
    setLoading(true);
    try {
      const activePage = forcePage !== undefined ? forcePage : page;
    const queryParams = new URLSearchParams({
      taskId,
      search: searchFilter,
      minScore: minScore.toString(),
      hasEmails: hasEmailsOnly ? "true" : "false",
      sortField,
      sortOrder,
      page: activePage.toString(),
      limit: limit.toString()
    });
    if (roleFilter !== 'all') queryParams.set('role', roleFilter);
    if (minBuyerIntent > 0) queryParams.set('minBuyerIntent', minBuyerIntent.toString());
    if (minPriority > 0) queryParams.set('minPriority', minPriority.toString());

      const response = await authFetch(`${BACKEND_URL}/api/leads?${queryParams}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLeads(data.leads);
      setTotalLeadsCount(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error("Failed to load leads from backend:", err);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchFilter, minScore, hasEmailsOnly, sortField, sortOrder, limit]);

  // Polling status updates for live scraping progress
  const startPolling = (taskId: string) => {
    stopPolling();
    console.log(`[Dashboard] Starting task polling for ${taskId}...`);
    pollingInterval.current = setInterval(async () => {
      try {
        const response = await authFetch(`${BACKEND_URL}/api/tasks/${taskId}`);
        if (!response.ok) throw new Error();
        const updatedTask = await response.json();
        if (!mounted.current) { stopPolling(); return; }

        setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
        setSelectedTask(updatedTask);

        if (updatedTask.status === "COMPLETED" || updatedTask.status === "FAILED") {
          stopPolling();
          fetchTaskLeads(taskId, 1);
          fetchHistory();
        } else {
          fetchTaskLeads(taskId);
        }
      } catch {
        stopPolling();
      }
    }, 1500);
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopPolling();
      if (demoInterval.current) clearInterval(demoInterval.current);
      if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
    };
  }, []);

  // While in demo mode, retry the backend every 15s — recovers automatically
  // once the user starts the backend, instead of staying stuck forever.
  useEffect(() => {
    if (!isDemoMode) return;
    const id = setInterval(async () => {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/health`);
        if (res.ok && mounted.current) {
          clearInterval(id);
          fetchHistory();
        }
      } catch { /* still offline */ }
    }, 15000);
    return () => clearInterval(id);
  }, [isDemoMode]);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    if (exportDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [exportDropdownOpen]);

  // Handle Search Form Submission
  const handleTriggerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword || !domainIdea) return;

    if (isDemoMode) {
      // Mock triggering a search in demo mode
      const newDemoId = `demo-task-${Date.now()}`;
      const newDemoTask: SearchTask = {
        id: newDemoId,
        keyword,
        domainIdea,
        country,
        cityState,
        searchDepth,
        status: "PROCESSING",
        progress: 10,
        totalLeads: 0,
        validEmails: 0,
        createdAt: new Date().toISOString()
      };

      setTasks(prev => [newDemoTask, ...prev]);
      setSelectedTask(newDemoTask);
      setLeads([]);
      setTotalLeadsCount(0);

      // Simulate a multi-step crawl
      let prog = 10;
      if (demoInterval.current) clearInterval(demoInterval.current);
      demoInterval.current = setInterval(() => {
        if (!mounted.current) {
          if (demoInterval.current) { clearInterval(demoInterval.current); demoInterval.current = null; }
          return;
        }
        prog += 30;
        if (prog >= 100) {
          if (demoInterval.current) { clearInterval(demoInterval.current); demoInterval.current = null; }
          newDemoTask.status = "COMPLETED";
          newDemoTask.progress = 100;
          newDemoTask.totalLeads = 3;
          newDemoTask.validEmails = 2;
          
          setTasks(prev => prev.map(t => t.id === newDemoId ? { ...newDemoTask } : t));
          setSelectedTask({ ...newDemoTask });

          // Generate simulated leads
          const generatedLeads: Lead[] = [
            {
              id: `lead-new-1`,
              businessName: `${cityState || "Local"} Auto Sales & Shop`,
              website: `https://www.example-${keyword.toLowerCase().replace(/\s+/g, '-')}.com`,
              location: `${cityState || "United States"}`,
              phoneNumbers: ["(555) 0192-3844"],
              socialLinks: [],
              domainMatchScore: 92,
              scoreExplanation: `Geographic match with target region. High category correlation matching keyword '${keyword}'.`,
              companySize: "Small",
              notes: "Initial crawl generated successfully.",
              createdAt: new Date().toISOString(),
              emails: [
                { id: "ne1", email: `sales@example-${keyword.toLowerCase().replace(/\s+/g, '-')}.com`, status: "VALID", confidenceScore: 0.85 }
              ]
            },
            {
              id: `lead-new-2`,
              businessName: `Elite ${keyword} Company`,
              website: `https://www.elite${keyword.toLowerCase().replace(/\s+/g, '')}.com`,
              location: `${cityState || "United States"}`,
              phoneNumbers: [],
              socialLinks: [],
              domainMatchScore: 78,
              scoreExplanation: "Relevancy established via strong keyword association.",
              companySize: "Medium",
              notes: "",
              createdAt: new Date().toISOString(),
              emails: [
                { id: "ne2", email: `info@elite${keyword.toLowerCase().replace(/\s+/g, '')}.com`, status: "VALID", confidenceScore: 0.8 }
              ]
            }
          ];
          setLeads(generatedLeads);
          setTotalLeadsCount(generatedLeads.length);
        } else {
          newDemoTask.progress = prog;
          newDemoTask.totalLeads = Math.floor(prog / 30);
          setTasks(prev => prev.map(t => t.id === newDemoId ? { ...newDemoTask } : t));
          setSelectedTask({ ...newDemoTask });
        }
      }, 1000);
      return;
    }

    // Live search submission
    try {
      setLoading(true);
      const response = await authFetch(`${BACKEND_URL}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          domainIdea,
          country,
          cityState,
          searchDepth
        })
      });

      if (!response.ok) throw new Error();
      const newTask = await response.json();
      
      // Update history list and select task
      setTasks(prev => [newTask, ...prev]);
      handleSelectTask(newTask);

      // Reset form fields
      setKeyword("");
      setDomainIdea("");
      setCityState("");
    } catch {
      alert("Error starting search query. Ensure the backend server is running.");
    } finally {
      setLoading(false);
    }
  };

  // Reload search task history list
  const handleReloadHistory = () => {
    fetchHistory();
  };

  // In-line Notes management
  const handleEditNotes = (lead: Lead) => {
    setEditingNotesLeadId(lead.id);
    setNotesText(lead.notes || "");
  };

  const handleSaveNotes = async (leadId: string) => {
    if (isDemoMode) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, notes: notesText } : l));
      setEditingNotesLeadId(null);
      return;
    }

    try {
      const response = await authFetch(`${BACKEND_URL}/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesText })
      });
      if (!response.ok) throw new Error();
      
      // Update local state
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, notes: notesText } : l));
      setEditingNotesLeadId(null);
    } catch {
      alert("Failed to update notes on server.");
    }
  };

  const selectedTaskId = selectedTask?.id;

  // Trigger search execution update when paging or filters change
  useEffect(() => {
    if (!selectedTaskId || isDemoMode) {
      return;
    }

    let active = true;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          taskId: selectedTaskId,
          search: searchFilter,
          minScore: minScore.toString(),
          hasEmails: hasEmailsOnly ? "true" : "false",
          sortField,
          sortOrder,
          page: page.toString(),
          limit: limit.toString(),
        });

        const response = await authFetch(`${BACKEND_URL}/api/leads?${queryParams}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!active) return;
        setLeads(data.leads);
        setTotalLeadsCount(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      } catch {
        if (active) {
          console.error("Failed to load leads from backend.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [selectedTaskId, isDemoMode, page, searchFilter, minScore, hasEmailsOnly, sortField, sortOrder, limit]);

  const handleSearchFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchFilterInput(e.target.value);
  };

  const triggerSearchFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || isDemoMode) {
      return;
    }

    const nextFilter = searchFilterInput;
    const refreshNow = nextFilter === searchFilter && page === 1;

    setSearchFilter(nextFilter);
    setPage(1);

    if (refreshNow) {
      fetchTaskLeads(selectedTask.id, 1);
    }
  };

  // Trigger Client-Side or Backend Data Export
  const handleExport = async (format: 'csv' | 'xlsx' | 'json') => {
    if (!selectedTask) return;
    setExporting(format);

    try {
      if (isDemoMode) {
        // --- Sandbox Demo Mode: Export from local react leads state ---
        let filteredLeads = leads;

        // Filter by email status if needed
        if (!exportIncludeRisky) {
          filteredLeads = filteredLeads.map(lead => ({
            ...lead,
            emails: lead.emails.filter(e => e.status === 'VALID')
          })).filter(lead => lead.emails.length > 0);
        }

        const exportData: ExportRow[] = exportEmailsOnly
          ? filteredLeads.flatMap(lead =>
              lead.emails.map(e => ({
                'Business Name': lead.businessName,
                'Email': e.email,
                'Status': e.status,
                'Website': lead.website || '',
                'Phone': lead.phoneNumbers[0] || '',
                'Location': lead.location || ''
              }))
            )
          : filteredLeads.map(lead => {
              const validEmails = lead.emails.filter(e => e.status !== 'INVALID').map(e => e.email);
              const allEmails = validEmails.join(', ');
              const primaryEmail = validEmails[0] || '';
              return {
                'Business Name': lead.businessName,
                'Website': lead.website || '',
                'Primary Email': primaryEmail,
                'Validated Emails': allEmails,
                'Phone Numbers': lead.phoneNumbers.join(', '),
                'Location': lead.location || '',
                'Google Maps URL': lead.googleMapsLink || '',
                'Category': lead.category || '',
                'Rating': lead.rating !== undefined && lead.rating !== null ? lead.rating : '',
                'Reviews Count': lead.reviewsCount !== undefined && lead.reviewsCount !== null ? lead.reviewsCount : 0,
                'Company Size': lead.companySize || 'Unknown',
                'Domain Relevance Score': lead.domainMatchScore,
                'Relevance Explanation': lead.scoreExplanation || '',
                'CRM Notes': lead.notes || '',
                'Discovered On': lead.createdAt
              };
            });

        if (format === 'json') {
          const jsonString = JSON.stringify(exportData, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
          triggerDownload(blob, `geolead_export_${selectedTask.domainIdea.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
        } else {
          // CSV / XLSX fallback
          const headers = Object.keys(exportData[0] || {});
          if (headers.length === 0) {
            alert("No data available to export.");
            return;
          }
          const csvRows = [
            headers.join(','),
            ...exportData.map(row =>
              headers.map(fieldName => {
                const val = row[fieldName];
                const escaped = ('' + (val !== null && val !== undefined ? val : '')).replace(/"/g, '""');
                return `"${escaped}"`;
              }).join(',')
            )
          ];
          const csvString = csvRows.join('\n');
          const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
          // If they click Excel, we download CSV but notify them
          const ext = 'csv';
          triggerDownload(blob, `geolead_export_${selectedTask.domainIdea.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`);
          if (format === 'xlsx') {
            alert("Notice: Excel format fallback. Downloaded as CSV file (fully compatible with Excel) because the backend API is offline.");
          }
        }
      } else {
        // --- Live Mode: Fetch from backend API ---
        const params = new URLSearchParams({
          taskId: selectedTask.id,
          format,
          emailsOnly: String(exportEmailsOnly),
          includeRisky: String(exportIncludeRisky)
        });
        const response = await authFetch(`${BACKEND_URL}/api/export?${params}`);
        if (!response.ok) {
          throw new Error(`Failed to generate export file from backend API (Status ${response.status}).`);
        }
        const blob = await response.blob();

        let mimeType = '';
        if (format === 'csv') mimeType = 'text/csv';
        else if (format === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (format === 'json') mimeType = 'application/json';

        const typedBlob = new Blob([blob], { type: mimeType });
        triggerDownload(typedBlob, `geolead_export_${selectedTask.domainIdea.replace(/[^a-zA-Z0-9]/g, '_')}.${format}`);
      }
    } catch (err: unknown) {
      console.error("Export error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      alert(`Export failed: ${errorMessage}`);
    } finally {
      setExporting(null);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const openComposer = async (toEmail: string, lead: Lead) => {
    setComposer({ to: toEmail, lead });
    setComposerSubject(`Quick question about ${lead.businessName}`);
    setComposerBody(`Hi,\n\nI came across ${lead.businessName} and wanted to reach out.\n\nBest,\n`);
    setComposerResult(null);
    if (senders.length === 0) {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/outbound/senders`);
        if (res.ok) {
          const list = await res.json();
          const active = list.filter((s: any) => s.status === 'active');
          setSenders(active);
          const preferred = active.find((s: any) => s.provider === 'RESEND') || active[0];
          if (preferred) setComposerSenderId(preferred.id);
        }
      } catch { /* ignore */ }
    } else if (!composerSenderId) {
      const preferred = senders.find(s => s.provider === 'RESEND') || senders[0];
      if (preferred) setComposerSenderId(preferred.id);
    }
  };

  const closeComposer = () => {
    setComposer(null);
    setComposerResult(null);
  };

  const handleSendComposer = async () => {
    if (!composer || !composerSenderId || !composerSubject || !composerBody) return;
    setComposerSending(true);
    setComposerResult(null);
    try {
      const res = await authFetch(`${BACKEND_URL}/api/outbound/send-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAccountId: composerSenderId,
          to: composer.to,
          subject: composerSubject,
          body: composerBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setComposerResult({ ok: false, message: data.error || `Send failed (${res.status})` });
      } else if (data.dryRun) {
        setComposerResult({ ok: false, message: data.note || 'Sender is in dry-run mode.' });
      } else {
        setComposerResult({ ok: true, message: `Sent via ${data.sender?.provider}` });
      }
    } catch (err: any) {
      setComposerResult({ ok: false, message: err?.message || 'Network error' });
    } finally {
      setComposerSending(false);
    }
  };

  const handleVerifyEmails = async () => {
    if (!selectedTask) return;

    setVerifying(true);
    setVerifyResult(null);
    setVerifyProgress({ results: [], total: 0, done: 0, complete: false });

    try {
      // Fetch ALL emails for the task (not just the current page)
      const emailRes = await authFetch(`${BACKEND_URL}/api/leads/emails?taskId=${selectedTask.id}`);
      if (!emailRes.ok) throw new Error(`HTTP ${emailRes.status}`);
      const { emails: allEmails } = await emailRes.json() as { emails: string[] };
      if (allEmails.length === 0) { setVerifying(false); return; }

      const res = await authFetch(`${BACKEND_URL}/api/email/verify-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: allEmails }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.mode === 'stream') {
        // Streaming per-email progress
        const token: string = data.progressToken;
        const total = data.total;
        setVerifyProgress((prev) => ({ ...prev, total }));
        if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
        verifyPollInterval.current = setInterval(async () => {
          try {
            const progressRes = await authFetch(`${BACKEND_URL}/api/email/verify-bulk/progress/${token}?offset=0`);
            if (!progressRes.ok) return;
            const progress = await progressRes.json();
            if (!mounted.current) {
              if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
              return;
            }
            setVerifyProgress((prev) => ({
              results: progress.results as EmailProgress[],
              total: progress.total,
              done: progress.done,
              complete: progress.complete,
            }));
            if (progress.complete) {
              if (verifyPollInterval.current) { clearInterval(verifyPollInterval.current); verifyPollInterval.current = null; }
              setVerifying(false);
              if (selectedTask) fetchTaskLeads(selectedTask.id);
            }
          } catch {
            if (verifyPollInterval.current) { clearInterval(verifyPollInterval.current); verifyPollInterval.current = null; }
            setVerifying(false);
          }
        }, 300);
        return;
      }

      if (data.mode === 'inline' || data.mode === 'inline-fallback') {
        const summary = data.summary as { valid: number; risky: number; invalid: number };
        setVerifyProgress({
          results: data.results?.map((r: any) => ({ email: r.email, status: r.status, confidenceScore: r.confidenceScore })) || [],
          total: data.total,
          done: data.total,
          complete: true,
        });
        setVerifying(false);
        if (selectedTask) fetchTaskLeads(selectedTask.id);
      } else {
        // Queued — poll until done
        const jobId: string = data.jobId;
        if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
        verifyPollInterval.current = setInterval(async () => {
          try {
            const statusRes = await authFetch(`${BACKEND_URL}/api/email/verify-bulk/${jobId}`);
            if (!statusRes.ok) return;
            const job = await statusRes.json();
            if (!mounted.current) {
              if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
              return;
            }
            setVerifyProgress((prev) => ({ ...prev, total: job.totalEmails, done: job.processedEmails || 0 }));
            if (job.status === 'COMPLETED') {
              if (verifyPollInterval.current) { clearInterval(verifyPollInterval.current); verifyPollInterval.current = null; }
              setVerifyProgress((prev) => ({ ...prev, done: job.processedEmails, complete: true }));
              setVerifying(false);
              if (selectedTask) fetchTaskLeads(selectedTask.id);
            } else if (job.status === 'FAILED') {
              if (verifyPollInterval.current) { clearInterval(verifyPollInterval.current); verifyPollInterval.current = null; }
              setVerifying(false);
            }
          } catch {
            if (verifyPollInterval.current) { clearInterval(verifyPollInterval.current); verifyPollInterval.current = null; }
            setVerifying(false);
          }
        }, 2000);
        return;
      }
    } catch (err) {
      console.error('Verify emails error:', err);
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row relative">
      
      {/* Sidebar - Saved Tasks History */}
      <aside className="w-full md:w-80 border-r border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 flex flex-col shrink-0">
        
        {/* Branding header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-900 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-600 rounded text-slate-900 dark:text-white font-bold text-xs">GL</span>
            <span className="font-extrabold text-sm tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-indigo-300">GeoLead AI</span>
          </Link>
          <Link href="/settings" className="p-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-800 dark:text-slate-200 transition-colors" title="Settings">
            <Settings className="w-4 h-4" />
          </Link>
        </div>

        {/* Create Search Form Accordion */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-900">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">New Lead Generation</h3>
          <div className="mb-4">
            <DomainSelector
              label="Source domain"
              emptyAction={{ label: "Add to portfolio", href: "/portfolio" }}
            />
            {activeDomain ? (
              <p className="mt-2 text-[10px] text-emerald-300">
                Lead search seeded from {activeDomain.name}. Edit fields below to fine-tune.
              </p>
            ) : null}
          </div>
          <form onSubmit={handleTriggerSearch} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Domain Idea</label>
              <input
                type="text"
                required
                value={domainIdea}
                onChange={(e) => setDomainIdea(e.target.value)}
                placeholder="e.g. TexasCarVendor.com"
                className="w-full h-10 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Keyword Niche</label>
              <input
                type="text"
                required
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Texas Car Dealership"
                className="w-full h-10 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">City / State</label>
                <input
                  type="text"
                  value={cityState}
                  onChange={(e) => setCityState(e.target.value)}
                  placeholder="Texas"
                  className="w-full h-10 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Search Depth</label>
                <select
                  value={searchDepth}
                  onChange={(e) => setSearchDepth(Number(e.target.value))}
                  className="w-full h-10 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                   <option value={5}>5 Leads</option>
                   <option value={10}>10 Leads</option>
                   <option value={20}>20 Leads</option>
                   <option value={50}>50 Leads</option>
                   <option value={100}>100 Leads</option>
                   <option value={MAX_SEARCH_DEPTH}>{MAX_SEARCH_DEPTH} Leads</option>
                 </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Start Lead Discovery
            </button>
          </form>
        </div>

        {/* Task History Panel */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Search History
            </h3>
            <button onClick={handleReloadHistory} className="text-[10px] text-indigo-400 hover:underline">
              Refresh
            </button>
          </div>

          <div className="space-y-3">
            {tasks.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-6">No previous queries found.</p>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleSelectTask(task)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 ${
                    selectedTask?.id === task.id
                      ? "bg-indigo-950/20 border-indigo-500/40 shadow-inner"
                      : "bg-slate-50 dark:bg-slate-900/10 border-slate-200 dark:border-slate-900/60 hover:bg-slate-100 dark:bg-slate-900/30"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">{task.domainIdea}</span>
                    <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                      task.status === "COMPLETED" 
                        ? "bg-emerald-500/10 text-emerald-400"
                        : task.status === "FAILED"
                        ? "bg-rose-500/10 text-rose-400"
                        : task.status === "PAUSED"
                        ? "bg-amber-500/10 text-amber-400"
                        : task.status === "CANCELLED"
                        ? "bg-slate-500/10 text-slate-400"
                        : "bg-amber-500/10 text-amber-400 animate-pulse"
                    }`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">Query: {task.keyword}</div>
                  {task.status === "PROCESSING" && (
                    <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1 mt-1 overflow-hidden">
                      <div className="bg-indigo-500 h-1 transition-all duration-300" style={{ width: `${task.progress}%` }} />
                    </div>
                  )}
                  {(task.status === "PENDING" || task.status === "PROCESSING") && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={(e) => handlePauseTask(task.id, e)}
                        className="flex-1 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Pause
                      </button>
                      <button
                        onClick={(e) => handleStopTask(task.id, e)}
                        className="flex-1 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Stop
                      </button>
                    </div>
                  )}
                  {task.status === "PAUSED" && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={(e) => handleResumeTask(task.id, e)}
                        className="flex-1 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Resume
                      </button>
                      <button
                        onClick={(e) => handleStopTask(task.id, e)}
                        className="flex-1 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Stop
                      </button>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 bg-white dark:bg-slate-950 flex flex-col relative overflow-hidden">
        
        {/* Email Verification Modal */}
        <VerificationModal
          open={verifying || verifyProgress.results.length > 0}
          results={verifyProgress.results}
          total={verifyProgress.total}
          done={verifyProgress.done}
          complete={verifyProgress.complete}
          onClose={() => {
            setVerifyProgress({ results: [], total: 0, done: 0, complete: false });
            setVerifyResult(null);
          }}
        />

        {/* Offline Demo Banner */}
        {isDemoMode && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-400 px-6 py-2.5 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>Backend server offline. Displaying sandbox demo environment with mock data. Start the Express API to activate live scraping.</span>
            </div>
            <button onClick={fetchHistory} className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[10px] font-bold uppercase transition-colors">
              Retry Connection
            </button>
          </div>
        )}

        {/* Main Dashboard Top Header */}
        <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 bg-slate-100 dark:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-800 dark:text-slate-200">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="p-1.5 bg-indigo-600 rounded text-slate-900 dark:text-white font-bold text-xs">GL</span>
            <div>
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {selectedTask ? `Campaign: ${selectedTask.domainIdea}` : "Select a Search Campaign"}
              </h2>
              {selectedTask && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Target Keyword: &quot;{selectedTask.keyword}&quot; • Search depth: {selectedTask.searchDepth} sites
                </p>
              )}
            </div>
          </div>

          {/* Export Controls — show for COMPLETED, PAUSED, CANCELLED */}
          {selectedTask && ["COMPLETED", "PAUSED", "CANCELLED"].includes(selectedTask.status) && (
            <div className="flex items-center gap-2">
              {/* Verify Emails Button */}
              <button
                onClick={handleVerifyEmails}
                disabled={verifying || leads.length === 0}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-900 disabled:opacity-50 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <ShieldCheck className={`w-4 h-4 ${verifying ? 'animate-pulse' : ''}`} />
                {verifying ? 'Verifying...' : 'Verify Emails'}
              </button>

              {/* Validate WhatsApp Button */}
              <button
                onClick={() => setShowWaPanel(true)}
                disabled={leads.filter(l => l.phoneNumbers.length > 0).length === 0}
                className="px-4 py-2 bg-[#25D366]/80 hover:bg-[#25D366] disabled:opacity-40 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Validate WA
              </button>

              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setExportOptionsOpen(true)}
                  disabled={exporting !== null}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/10 transition-colors cursor-pointer"
                >
                  <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
                  {exporting ? `Exporting ${exporting.toUpperCase()}...` : "Export Data"}
                </button>
              </div>
              {/* Create Campaign from Selected */}
              <button
                onClick={() => { setCampaignName(''); setShowCampaignModal(true); }}
                disabled={selectedLeadIds.size === 0}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 disabled:opacity-50 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                Create Campaign ({selectedLeadIds.size})
              </button>
            </div>
          )}
        </header>

        {/* Main Content Body */}
        {selectedTask ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Active Scraping Progress Tracker */}
            {(selectedTask.status === "PENDING" || selectedTask.status === "PROCESSING") && (
              <div className="glass-card rounded-2xl p-6 border-indigo-500/20 relative overflow-hidden shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400 animate-pulse" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Active Crawl & Extraction Pipeline</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Searching maps, reading contacts, and evaluating matches.</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-indigo-400">{selectedTask.progress}%</span>
                </div>
                <div className="w-full bg-white dark:bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-200 dark:border-slate-900">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${selectedTask.progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-6 text-center text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-900">
                    <span className="text-slate-500 block mb-1">Status</span>
                    <span className="font-bold text-indigo-400 capitalize">{selectedTask.status.toLowerCase()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-900">
                    <span className="text-slate-500 block mb-1">Leads Identified</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTask.totalLeads}</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-900">
                    <span className="text-slate-500 block mb-1">Validated Emails</span>
                    <span className="font-bold text-emerald-400">{selectedTask.validEmails}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Campaign Analytics Stats Overview */}
            {["COMPLETED", "PAUSED", "CANCELLED"].includes(selectedTask.status) && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-900">
                  <span className="text-xs text-slate-500 block">Total Prospects</span>
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 mt-1 block">{selectedTask.totalLeads}</span>
                </div>
                <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-900">
                  <span className="text-xs text-slate-500 block">Validated Emails</span>
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 block">{selectedTask.validEmails}</span>
                </div>
                <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-900">
                  <span className="text-xs text-slate-500 block">Unique Phones</span>
                  <span className="text-2xl sm:text-3xl font-black text-indigo-400 mt-1 block">
                    {leads.filter(l => l.phoneNumbers.length > 0).length}
                  </span>
                </div>
                <div className="glass-card p-5 rounded-2xl border-slate-200 dark:border-slate-900">
                  <span className="text-xs text-slate-500 block">Avg Match Score</span>
                  <span className="text-2xl sm:text-3xl font-black text-cyan-400 mt-1 block">
                    {leads.length > 0
                      ? Math.round(leads.reduce((sum, l) => sum + l.domainMatchScore, 0) / leads.length)
                      : 0}%
                  </span>
                </div>
              </div>
            )}

            {/* Leads Table Card with Filters */}
            <div className="glass-card rounded-2xl border-slate-200 dark:border-slate-900 overflow-hidden flex flex-col">
              
              {/* Filter controls bar */}
              <div className="p-4 bg-slate-100 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-900 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
                
                {/* Search input filter */}
                <form onSubmit={triggerSearchFilterSubmit} className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchFilterInput}
                      onChange={handleSearchFilterChange}
                      placeholder="Filter by business name, keyword, city..."
                      className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg pl-9 pr-4 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button type="submit" className="h-9 px-4 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:bg-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Apply
                  </button>
                </form>

                {/* Dropdowns filters */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Min Relevance Score */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 h-9 rounded-lg px-2 text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={minScore}
                      onChange={(e) => setMinScore(Number(e.target.value))}
                      className="bg-transparent border-none text-slate-700 dark:text-slate-300 focus:outline-none text-[11px]"
                    >
                      <option value={0}>All Scores</option>
                      <option value={50}>&gt; 50% Match</option>
                      <option value={75}>&gt; 75% Match</option>
                      <option value={90}>&gt; 90% Match</option>
                    </select>
                  </div>

                  {/* Has Emails Filter Toggle */}
                  <button
                    onClick={() => setHasEmailsOnly(!hasEmailsOnly)}
                    className={`h-9 px-3 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${
                      hasEmailsOnly
                        ? "bg-indigo-950/30 border-indigo-500/40 text-indigo-300"
                        : "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-400 hover:text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" /> Has Email
                  </button>

                  {/* Channel filter */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 h-9 rounded-lg px-2 text-xs">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={channelFilter}
                      onChange={e => setChannelFilter(e.target.value as typeof channelFilter)}
                      className="bg-transparent border-none text-slate-700 dark:text-slate-300 focus:outline-none text-[11px]"
                    >
                      <option value="all">All Channels</option>
                      <option value="whatsapp_high">WhatsApp High (≥70)</option>
                      <option value="email_available">Email Available</option>
                      <option value="phone_available">Phone Available</option>
                      <option value="multi_channel">Multi-Channel</option>
                    </select>
                  </div>

                  {/* Role filter */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 h-9 rounded-lg px-2 text-xs">
                    <span className="text-slate-500 font-semibold text-[10px] uppercase">Role</span>
                    <select
                      value={roleFilter}
                      onChange={e => setRoleFilter(e.target.value)}
                      className="bg-transparent border-none text-slate-700 dark:text-slate-300 focus:outline-none text-[11px]"
                    >
                      <option value="all">All</option>
                      <option value="ceo">CEOs & Founders</option>
                      <option value="founder">Founders Only</option>
                      <option value="director">Directors</option>
                    </select>
                  </div>

                  {/* Min Buyer Intent */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 h-9 rounded-lg px-2 text-xs">
                    <span className="text-slate-500 font-semibold text-[10px] uppercase">Intent</span>
                    <select
                      value={minBuyerIntent}
                      onChange={e => setMinBuyerIntent(Number(e.target.value))}
                      className="bg-transparent border-none text-slate-700 dark:text-slate-300 focus:outline-none text-[11px]"
                    >
                      <option value={0}>Any</option>
                      <option value={65}>High (≥65)</option>
                      <option value={45}>Moderate (≥45)</option>
                    </select>
                  </div>

                  {/* Min Priority */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 h-9 rounded-lg px-2 text-xs">
                    <span className="text-slate-500 font-semibold text-[10px] uppercase">Priority</span>
                    <select
                      value={minPriority}
                      onChange={e => setMinPriority(Number(e.target.value))}
                      className="bg-transparent border-none text-slate-700 dark:text-slate-300 focus:outline-none text-[11px]"
                    >
                      <option value={0}>All</option>
                      <option value={75}>High (≥75)</option>
                      <option value={50}>Medium (≥50)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Table Data View */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Database className="w-8 h-8 text-indigo-500 animate-spin" />
                  <span className="text-xs text-slate-500">Querying database records...</span>
                </div>
              ) : leads.length === 0 ? (
                <div className="text-center py-20">
                  <Database className="w-10 h-10 text-slate-800 mx-auto mb-4" />
                  <h4 className="text-sm font-bold text-slate-400">No matching leads found</h4>
                  <p className="text-xs text-slate-600 mt-1">Try expanding your keyword variations or removing filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-900/10 text-slate-400 font-medium">
                        <th className="py-4 px-2 w-10">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.size >= leads.length && leads.length > 0}
                            onChange={selectAllLeads}
                            className="w-3.5 h-3.5 rounded border-slate-600 cursor-pointer"
                          />
                        </th>
                        <th className="py-4 px-6">Business Details</th>
                        <th className="py-4 px-4">Contact Info</th>
                        <th className="py-4 px-4 text-center">Score</th>
                        <th className="py-4 px-6">CRM Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-900/80">
                      {leads.filter(lead => {
                        if (channelFilter === 'whatsapp_high') return (lead.whatsappScore ?? 0) >= 70;
                        if (channelFilter === 'email_available') return lead.emails.length > 0;
                        if (channelFilter === 'phone_available') return lead.phoneNumbers.length > 0;
                        if (channelFilter === 'multi_channel') {
                          let c = 0;
                          if (lead.emails.length > 0) c++;
                          if (lead.phoneNumbers.length > 0) c++;
                          if ((lead.whatsappScore ?? 0) >= 50) c++;
                          return c >= 2;
                        }
                        return true;
                      }).map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-50 dark:bg-slate-900/10 transition-colors align-top">
                          
                          {/* Multi-select checkbox */}
                          <td className="py-5 px-2">
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.has(lead.id)}
                              onChange={() => toggleLeadSelection(lead.id)}
                              className="w-3.5 h-3.5 rounded border-slate-600 cursor-pointer"
                            />
                          </td>

                          {/* Business Info Column */}
                          <td className="py-5 px-6 max-w-sm">
                            <div className="flex flex-col gap-1.5">
                              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                                {lead.businessName}
                                {lead.decisionMakerRole && (
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    lead.decisionMakerScore && lead.decisionMakerScore >= 85
                                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                      : lead.decisionMakerScore && lead.decisionMakerScore >= 70
                                      ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                                      : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-300 dark:border-slate-800'
                                  }`}>
                                    {lead.decisionMakerRole}
                                  </span>
                                )}
                                {lead.companySize && lead.companySize !== "Unknown" && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-400 rounded text-[9px]">
                                    {lead.companySize}
                                  </span>
                                )}
                              </div>
                              
                              {/* Website link */}
                              {lead.website ? (
                                <a
                                  href={lead.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 w-fit"
                                >
                                  <Globe className="w-3.5 h-3.5" />
                                  <span className="truncate max-w-[200px]">{lead.website}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-[11px] text-slate-600 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> No Website</span>
                              )}

                              {/* Physical Address */}
                              {lead.location && (
                                <span className="text-[10px] text-slate-500 flex items-start gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                  <span>{lead.location}</span>
                                </span>
                              )}

                              {/* Google Maps link */}
                              {lead.googleMapsLink && (
                                <a 
                                  href={lead.googleMapsLink} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-300 underline w-fit"
                                >
                                  View on Google Maps
                                </a>
                              )}

                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {lead.pipelineStage && (
                                  <span className="px-2 py-0.5 rounded-full border border-indigo-500/20 bg-indigo-950/20 text-[9px] font-bold text-indigo-300">
                                    {lead.pipelineStage}
                                  </span>
                                )}
                                {lead.leadStatus && (
                                  <span className="px-2 py-0.5 rounded-full border border-slate-400 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-[9px] font-bold text-slate-400">
                                    {lead.leadStatus}
                                  </span>
                                )}
                                {typeof lead.engagementScore === "number" && (
                                  <span className="px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-950/20 text-[9px] font-bold text-emerald-300">
                                    {lead.engagementScore}/100
                                  </span>
                                )}
                                {lead.doNotContact && (
                                  <span className="px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-950/20 text-[9px] font-bold text-rose-300">
                                    DNC
                                  </span>
                                )}
                              </div>

                              {lead.tags && lead.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {lead.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500 border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Contact Info Column */}
                          <td className="py-5 px-4 max-w-xs">
                            <div className="flex flex-col gap-3">

                              {/* ── Contact Intelligence ── */}
                              {lead.bestContactChannel && (
                                <div className="flex flex-col gap-1.5">
                                  {/* Best channel badge */}
                                  <div className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-black w-fit ${
                                    lead.bestContactChannel === 'WHATSAPP' ? 'bg-emerald-500/10 border border-emerald-400/30 text-emerald-400' :
                                    lead.bestContactChannel === 'EMAIL' ? 'bg-indigo-500/10 border border-indigo-400/30 text-indigo-300' :
                                    lead.bestContactChannel === 'PHONE' ? 'bg-violet-500/10 border border-violet-400/30 text-violet-300' :
                                    'bg-slate-500/10 border border-slate-600 text-slate-400'
                                  }`}>
                                    <Zap className="w-2.5 h-2.5" />
                                    {lead.bestContactChannel === 'WHATSAPP' ? 'WhatsApp First' :
                                     lead.bestContactChannel === 'EMAIL' ? 'Email First' :
                                     lead.bestContactChannel === 'PHONE' ? 'Call First' : 'Web Form'}
                                  </div>

                                  {/* Channel score row */}
                                  <div className="flex flex-wrap gap-2 text-[10px]">
                                    {lead.emails.length > 0 && (
                                      <span className="flex items-center gap-0.5 text-indigo-400">
                                        <Mail className="w-2.5 h-2.5" />
                                        Email {lead.contactChannelScores?.email ?? '—'}
                                      </span>
                                    )}
                                    {lead.whatsappScore != null && lead.whatsappScore > 0 && (
                                      <span className={`flex items-center gap-0.5 ${
                                        lead.whatsappConfidence === 'HIGH' ? 'text-emerald-400' :
                                        lead.whatsappConfidence === 'MEDIUM' ? 'text-amber-400' : 'text-slate-500'
                                      }`}>
                                        <MessageSquare className="w-2.5 h-2.5" />
                                        WA {lead.whatsappScore}
                                        <span className="text-[9px] opacity-70">({lead.whatsappConfidence})</span>
                                      </span>
                                    )}
                                    {lead.phoneNumbers.length > 0 && (
                                      <span className="flex items-center gap-0.5 text-violet-400">
                                        <Phone className="w-2.5 h-2.5" />
                                        Phone {lead.contactChannelScores?.phone ?? '—'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Emails List */}
                              {lead.emails.length === 0 ? (
                                <span className="text-[11px] text-slate-600 italic">No validated email found</span>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {lead.emails.map((e) => (
                                    <div key={e.id} className="flex items-center gap-1.5 min-w-0">
                                      <a
                                        href={`mailto:${e.email}`}
                                        title={`Send email to ${e.email}`}
                                        className="flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-indigo-300 min-w-0 font-mono text-[11px]"
                                      >
                                        <Mail className="w-3 h-3 text-indigo-400 shrink-0" />
                                        <span className="truncate">{e.email}</span>
                                      </a>
                                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wide ${
                                        e.status === "VALID"
                                          ? "bg-emerald-500/10 text-emerald-400"
                                          : "bg-amber-500/10 text-amber-400"
                                      }`}>
                                        {e.status}
                                      </span>
                                      {lead.decisionMakerRole && (
                                        <span className={`px-1.5 py-0.2 rounded text-[7px] font-bold uppercase tracking-wider ${
                                          lead.decisionMakerScore && lead.decisionMakerScore >= 85
                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                        }`}>
                                          {lead.decisionMakerRole}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => openComposer(e.email, lead)}
                                        title="Compose & send via Resend"
                                        className="ml-auto p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                                      >
                                        <Send className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Phone Numbers List */}
                              {lead.phoneNumbers.length > 0 && (
                                <div className="flex flex-col gap-0.5 text-slate-400 text-[10px]">
                                  {lead.phoneNumbers.map((phone, i) => (
                                    <a
                                      key={i}
                                      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                                      className="flex items-center gap-1 hover:text-slate-800 dark:text-slate-200 w-fit"
                                      title={`Call ${phone}`}
                                    >
                                      <Phone className="w-3 h-3 text-slate-500" /> {phone}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Score Column — Domain Match, Priority, Decision Maker */}
                          <td className="py-5 px-4 text-center">
                            <div className="inline-flex flex-col items-center gap-1.5 min-w-[80px]">
                              {/* Priority Score (primary) */}
                              {lead.priorityScore != null && (
                                <span className={`text-lg font-extrabold px-3 py-1 rounded-lg ${
                                  lead.priorityScore >= 85
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : lead.priorityScore >= 65
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-300 dark:border-slate-800"
                                }`}>
                                  {lead.priorityScore}
                                </span>
                              )}

                              {/* Domain Match Score */}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                lead.domainMatchScore >= 85
                                  ? "bg-emerald-950/20 text-emerald-400"
                                  : lead.domainMatchScore >= 65
                                  ? "bg-indigo-950/20 text-indigo-400"
                                  : "bg-slate-100 dark:bg-slate-900 text-slate-500"
                              }`}>
                                Match {lead.domainMatchScore}%
                              </span>

                              {/* Decision Maker */}
                              {(lead.decisionMakerName || lead.decisionMakerRole) ? (
                                <div className="flex flex-col items-center border-t border-slate-800/50 pt-1.5 mt-0.5 w-full">
                                  {lead.decisionMakerName && (
                                    <span className="text-[11px] font-bold text-slate-200 leading-tight truncate max-w-[90px]">
                                      {lead.decisionMakerName}
                                    </span>
                                  )}
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">{lead.decisionMakerRole || 'Unknown Role'}</span>
                                  {lead.decisionMakerScore != null && (
                                    <span className={`text-[10px] font-bold ${
                                      lead.decisionMakerScore >= 85 ? 'text-amber-400' :
                                      lead.decisionMakerScore >= 70 ? 'text-indigo-400' : 'text-slate-500'
                                    }`}>
                                      DM {lead.decisionMakerScore}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="border-t border-slate-800/50 pt-1.5 mt-0.5 w-full">
                                  <span className="text-[9px] text-slate-600 italic">No DM identified</span>
                                </div>
                              )}

                              {/* Buyer Intent + Domain Fit badges */}
                              <div className="flex items-center gap-1">
                                {lead.buyerIntentScore != null && (
                                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                    lead.buyerIntentScore >= 65 ? 'bg-rose-500/10 text-rose-400' :
                                    lead.buyerIntentScore >= 45 ? 'bg-amber-500/10 text-amber-400' :
                                    'bg-slate-100 dark:bg-slate-900 text-slate-500'
                                  }`}>
                                    BI {lead.buyerIntentScore}
                                  </span>
                                )}
                                {lead.domainUpgradeScore != null && (
                                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                    lead.domainUpgradeScore >= 60 ? 'bg-cyan-500/10 text-cyan-400' :
                                    lead.domainUpgradeScore >= 40 ? 'bg-indigo-500/10 text-indigo-400' :
                                    'bg-slate-100 dark:bg-slate-900 text-slate-500'
                                  }`}>
                                    DF {lead.domainUpgradeScore}
                                  </span>
                                )}
                              </div>

                              {/* Contact strategy badge */}
                              {lead.contactStrategy && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-400 uppercase tracking-wider">
                                  {lead.contactStrategy === 'email_decision_maker' ? '📧 DM' :
                                   lead.contactStrategy === 'email_general' ? '📧 Gen' :
                                   lead.contactStrategy === 'call_business' ? '📞 Call' : '🌐 Form'}
                                </span>
                              )}

                              {/* WhatsApp reachability score */}
                              {lead.whatsappScore != null && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                  lead.whatsappConfidence === 'HIGH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  lead.whatsappConfidence === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                  'bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-300 dark:border-slate-700'
                                }`}>
                                  <MessageSquare className="w-2.5 h-2.5" /> {lead.whatsappScore}
                                </span>
                              )}

                              {/* Match explanation tooltip helper */}
                              {lead.scoreExplanation && (
                                <div className="relative group cursor-help">
                                  <HelpCircle className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400" />
                                  <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-1.5 w-48 bg-slate-100 dark:bg-slate-900 text-slate-400 text-[10px] p-2.5 rounded-lg border border-slate-300 dark:border-slate-800 hidden group-hover:block shadow-xl leading-relaxed z-10">
                                    {lead.scoreExplanation}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Notes/CRM Column */}
                          <td className="py-5 px-6 max-w-xs">
                            {editingNotesLeadId === lead.id ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={notesText}
                                  onChange={(e) => setNotesText(e.target.value)}
                                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1.5 text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 h-16 resize-none"
                                />
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => handleSaveNotes(lead.id)}
                                    className="p-1 bg-indigo-600 text-slate-900 dark:text-white rounded hover:bg-indigo-500"
                                    title="Save"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingNotesLeadId(null)}
                                    className="p-1 bg-slate-200 dark:bg-slate-800 text-slate-400 rounded hover:bg-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="group/note">
                                <p className="text-[11px] text-slate-400 leading-relaxed italic whitespace-pre-wrap">
                                  {lead.notes || "No notes added yet."}
                                </p>
                                <button
                                  onClick={() => handleEditNotes(lead)}
                                  className="text-[10px] text-indigo-400 hover:underline mt-1 opacity-0 group-hover/note:opacity-100 transition-opacity"
                                >
                                  Edit Notes
                                </button>
                              </div>
                            )}
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table pagination controls */}
              {!loading && totalPages > 1 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/10 border-t border-slate-200 dark:border-slate-900 flex justify-between items-center text-xs text-slate-500">
                  <span>Page {page} of {totalPages} ({totalLeadsCount} total leads)</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(prev => Math.max(1, prev - 1))}
                      className="p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-850 disabled:opacity-30 rounded-lg text-slate-700 dark:text-slate-300"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                      className="p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-850 disabled:opacity-30 rounded-lg text-slate-700 dark:text-slate-300"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <TrendingUp className="w-12 h-12 text-slate-800 mb-4" />
            <h3 className="text-base font-bold text-slate-400">Welcome to GeoLead AI</h3>
            <p className="text-xs text-slate-600 max-w-sm mt-1 leading-relaxed">
              Generate keyword variations and discover high-intent local buyers for your domain assets. Submit a query in the sidebar.
            </p>
          </div>
        )}
      </main>

      {/* WhatsApp Validation Panel */}
      {showWaPanel && (
        <WaValidationPanel
          leads={leads}
          onClose={() => setShowWaPanel(false)}
        />
      )}

      {/* Solo Send Composer Modal */}
      <ComposerModal
        open={!!composer}
        recipientEmail={composer?.to || ''}
        senders={senders}
        senderId={composerSenderId}
        subject={composerSubject}
        body={composerBody}
        sending={composerSending}
        result={composerResult}
        onSenderChange={setComposerSenderId}
        onSubjectChange={setComposerSubject}
        onBodyChange={setComposerBody}
        onSend={handleSendComposer}
        onClose={closeComposer}
      />

      {/* Campaign Creation Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCampaignModal(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-300 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-rose-400" /> Create Campaign
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{selectedLeadIds.size} leads selected</p>
              </div>
              <button onClick={() => setShowCampaignModal(false)} className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Campaign Name</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder={`Auto: ${selectedTask?.domainIdea || 'Campaign'}`}
                  className="w-full h-10 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Daily Limit</label>
                <select value={campaignThrottle} onChange={e => setCampaignThrottle(Number(e.target.value))}
                  className="w-full h-10 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value={5}>5 / day (conservative)</option>
                  <option value={10}>10 / day (moderate)</option>
                  <option value={20}>20 / day (aggressive)</option>
                  <option value={50}>50 / day (max)</option>
                </select>
              </div>
            </div>
            <div className="p-5 border-t border-slate-300 dark:border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowCampaignModal(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-400 rounded-lg">Cancel</button>
              <button
                onClick={handleCreateCampaign}
                disabled={campaignCreating}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 rounded-lg text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                {campaignCreating ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Options Modal */}
      {exportOptionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setExportOptionsOpen(false)}>
          <div
            className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-300 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Download className="w-4 h-4 text-indigo-400" /> Export Options
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Choose format and filters</p>
              </div>
              <button onClick={() => setExportOptionsOpen(false)} className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-200 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Format</label>
                <div className="flex gap-2">
                  {(['csv', 'xlsx', 'json'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={`flex-1 h-9 rounded-lg text-xs font-semibold transition-colors ${
                        exportFormat === fmt
                          ? 'bg-indigo-600 text-slate-900 dark:text-white'
                          : 'bg-white dark:bg-slate-950 text-slate-400 hover:text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-800'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportEmailsOnly}
                    onChange={(e) => setExportEmailsOnly(e.target.checked)}
                    className="w-4 h-4 rounded bg-white dark:bg-slate-950 border-slate-400 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">Export emails only (one row per email)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportIncludeRisky}
                    onChange={(e) => setExportIncludeRisky(e.target.checked)}
                    className="w-4 h-4 rounded bg-white dark:bg-slate-950 border-slate-400 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">Include risky (catch-all / unverified) emails</span>
                </label>
              </div>
            </div>
            <div className="p-5 border-t border-slate-300 dark:border-slate-800 flex justify-end gap-2">
              <button onClick={() => setExportOptionsOpen(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded-lg">Cancel</button>
              <button
                onClick={() => { setExportOptionsOpen(false); handleExport(exportFormat); }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── WhatsApp Validation Panel ────────────────────────────────────────────────

function waLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  // Prepend country code 1 for plain 10-digit US numbers
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function WaValidationPanel({ leads, onClose }: { leads: Lead[]; onClose: () => void }) {
  const withPhone = leads
    .filter(l => l.phoneNumbers.length > 0)
    .sort((a, b) => (b.whatsappScore ?? 0) - (a.whatsappScore ?? 0));

  const high   = withPhone.filter(l => (l.whatsappScore ?? 0) >= 70).length;
  const medium = withPhone.filter(l => { const s = l.whatsappScore ?? 0; return s >= 45 && s < 70; }).length;
  const low    = withPhone.filter(l => (l.whatsappScore ?? 0) < 45).length;

  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const visible = withPhone.filter(l => {
    const s = l.whatsappScore ?? 0;
    if (filter === 'high')   return s >= 70;
    if (filter === 'medium') return s >= 45 && s < 70;
    if (filter === 'low')    return s < 45;
    return true;
  });

  const confColor = (conf: string | null | undefined) =>
    conf === 'HIGH'   ? 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30' :
    conf === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border-amber-400/30' :
                        'bg-slate-500/10 text-slate-400 border-slate-600';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-10 mb-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-[#25D366]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">WhatsApp Validation</h3>
              <p className="text-[11px] text-slate-500">{withPhone.length} leads with phone numbers</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
          {[
            { label: 'HIGH likelihood', count: high, color: 'text-[#25D366]', filter: 'high' as const },
            { label: 'MEDIUM likelihood', count: medium, color: 'text-amber-400', filter: 'medium' as const },
            { label: 'LOW likelihood', count: low, color: 'text-slate-500', filter: 'low' as const },
          ].map(item => (
            <button
              key={item.filter}
              onClick={() => setFilter(filter === item.filter ? 'all' : item.filter)}
              className={`py-3 text-center transition-colors ${filter === item.filter ? 'bg-slate-50 dark:bg-slate-900/60' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'}`}
            >
              <div className={`text-xl font-black ${item.color}`}>{item.count}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{item.label}</div>
            </button>
          ))}
        </div>

        {/* Note */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
          Click <strong className="text-[#25D366]">Open in WhatsApp</strong> to test each number directly — if WhatsApp recognises the number, a chat will open. Scores are AI probability estimates based on phone format, industry, and location signals.
        </div>

        {/* Lead list */}
        <div className="divide-y divide-slate-100 dark:divide-slate-900 max-h-[480px] overflow-y-auto">
          {visible.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">No leads in this category.</div>
          )}
          {visible.map(lead => (
            <div key={lead.id} className="px-6 py-4 flex items-start gap-4">
              {/* Score badge */}
              <div className={`shrink-0 h-10 w-10 rounded-xl border flex flex-col items-center justify-center ${confColor(lead.whatsappConfidence)}`}>
                <span className="text-[13px] font-black leading-none">{lead.whatsappScore ?? '?'}</span>
                <span className="text-[8px] font-bold leading-none mt-0.5 opacity-70">
                  {lead.whatsappConfidence ?? 'N/A'}
                </span>
              </div>

              {/* Business + phones */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{lead.businessName}</div>
                {lead.location && (
                  <div className="text-[11px] text-slate-500 mt-0.5">{lead.location}</div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {lead.phoneNumbers.map((phone, i) => (
                    <a
                      key={i}
                      href={waLink(phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[11px] font-semibold text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      {phone}
                    </a>
                  ))}
                </div>
              </div>

              {/* Best channel hint */}
              {lead.bestContactChannel && (
                <div className="shrink-0 text-[10px] text-slate-500 text-right">
                  <div className={`font-bold ${lead.bestContactChannel === 'WHATSAPP' ? 'text-[#25D366]' : 'text-slate-400'}`}>
                    {lead.bestContactChannel === 'WHATSAPP' ? '🔥 WA First' : lead.bestContactChannel}
                  </div>
                  {lead.contactChannelScores && (
                    <div className="mt-0.5 space-y-0.5">
                      <div>Email {lead.contactChannelScores.email}</div>
                      <div>Phone {lead.contactChannelScores.phone}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Showing {visible.length} of {withPhone.length} leads with phones
          </span>
          <button onClick={onClose} className="h-8 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
