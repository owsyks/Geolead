"use client";

import React, { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { ComposerModal } from "./ComposerModal";
import { VerificationModal, type EmailProgress } from "./VerificationModal";
import { DomainSelector } from "@/components/DomainSelector";
import { OutboundShell, MetricCard } from "@/components/OutboundShell";
import { GlassCard, ScoreRing } from "@/components/ui";
import { useDomainContext } from "@/lib/domainContext";
import { authFetch, fetchOutbound } from "@/lib/outbound";
import { readCache, writeCache } from "@/lib/cache";
import {
  Search,
  MapPin,
  Download,
  Database,
  History,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Mail,
  MessageSquare,
  Phone,
  Save,
  Globe,
  AlertCircle,
  HelpCircle,
  Plus,
  ShieldCheck,
  Send,
  Zap,
  X,
} from "lucide-react";

// API URL (Express backend) — env override allowed for non-localhost setups
const BACKEND_URL = process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://localhost:5000";
const MAX_SEARCH_DEPTH = 200;
const DEMO_CREATED_AT = "2026-05-22T00:00:00.000Z";
const DEMO_TASK_ONE_CREATED_AT = "2026-05-21T23:00:00.000Z";
const DEMO_TASK_TWO_CREATED_AT = "2026-05-21T22:00:00.000Z";

const HISTORY_CACHE_KEY = "dashboard.history";

const INPUT = "w-full h-10 bg-bg border border-border rounded-lg px-3 text-xs text-text focus:outline-none focus:border-brand transition-colors";
const LABEL = "block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5";

interface LeadEmail {
  id: string;
  email: string;
  status: 'VALID' | 'RISKY' | 'INVALID';
  confidenceScore: number;
  sourcePage?: string;
}

interface SearchTask {
  id: string;
  keyword: string;
  domainIdea: string;
  country?: string;
  cityState?: string;
  searchDepth: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED' | 'STOPPED';
  progress: number;
  totalLeads: number;
  validEmails: number;
  createdAt: string;
}

const TERMINAL_TASK_STATUSES: SearchTask['status'][] = ['COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'STOPPED'];

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

type ExportCellValue = string | number;
type ExportRow = Record<string, ExportCellValue>;

export default function DashboardPage() {
  // Input Form States
  const { activeDomain } = useDomainContext();
  const [keyword, setKeyword] = useState("");
  const [domainIdea, setDomainIdea] = useState("");
  const country = "United States";
  const [cityState, setCityState] = useState("");
  const [searchDepth, setSearchDepth] = useState(50);
  const [railOpen, setRailOpen] = useState(false);

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
  const [tasks, setTasks] = useState<SearchTask[]>(() => readCache<SearchTask[]>(HISTORY_CACHE_KEY) ?? []);
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
  const [notContactedOnly, setNotContactedOnly] = useState(false);
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
  const [showBulkActions, setShowBulkActions] = useState(false);

  const doBulkAction = async (action: { pipelineStage?: string; markContacted?: boolean; addTags?: string[] }) => {
    try {
      await authFetch(`${BACKEND_URL}/api/leads/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selectedLeadIds), ...action }),
      });
      setShowBulkActions(false);
      setSelectedLeadIds(new Set());
      if (selectedTask) fetchTaskLeads(selectedTask.id);
    } catch { /* ignore */ }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectAllTruncated(false);
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const selectAllLeads = () => {
    setSelectAllTruncated(false);
    if (selectedLeadIds.size >= leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map(l => l.id)));
    }
  };

  const [selectingAllMatching, setSelectingAllMatching] = useState(false);
  const [selectAllTruncated, setSelectAllTruncated] = useState(false);
  const selectAllMatchingLeads = async () => {
    if (!selectedTask) return;
    setSelectingAllMatching(true);
    try {
      const queryParams = new URLSearchParams({
        taskId: selectedTask.id,
        search: searchFilter,
        minScore: minScore.toString(),
        hasEmails: hasEmailsOnly ? "true" : "false",
      });
      if (roleFilter !== 'all') queryParams.set('role', roleFilter);
      if (minBuyerIntent > 0) queryParams.set('minBuyerIntent', minBuyerIntent.toString());
      if (minPriority > 0) queryParams.set('minPriority', minPriority.toString());
      if (notContactedOnly) queryParams.set('notContacted', 'true');

      const response = await authFetch(`${BACKEND_URL}/api/leads/ids?${queryParams}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSelectedLeadIds(new Set(data.ids));
      setSelectAllTruncated(!!data.truncated);
    } catch (err) {
      console.error("Failed to select all matching leads:", err);
    } finally {
      setSelectingAllMatching(false);
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
      writeCache(HISTORY_CACHE_KEY, data);
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
    if (notContactedOnly) queryParams.set('notContacted', 'true');

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
  }, [page, searchFilter, minScore, hasEmailsOnly, roleFilter, minBuyerIntent, minPriority, notContactedOnly, sortField, sortOrder, limit]);

  // Polling status updates for live scraping progress.
  // Self-scheduling with backoff (3s → 30s) and PAUSES while the tab is hidden,
  // so a long scrape in a background tab doesn't hammer /api/tasks forever.
  const startPolling = (taskId: string) => {
    stopPolling();
    console.log(`[Dashboard] Starting task polling for ${taskId}...`);
    let delay = 3000;
    const tick = async () => {
      if (!mounted.current) { stopPolling(); return; }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        pollingInterval.current = setTimeout(tick, delay);
        return;
      }
      try {
        const response = await authFetch(`${BACKEND_URL}/api/tasks/${taskId}`);
        if (!response.ok) throw new Error();
        const updatedTask = await response.json();
        if (!mounted.current) { stopPolling(); return; }

        setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
        setSelectedTask(updatedTask);

        if (TERMINAL_TASK_STATUSES.includes(updatedTask.status)) {
          stopPolling();
          fetchHistory();
          return;
        }
      } catch {
        stopPolling();
        return;
      }
      delay = Math.min(30000, Math.round(delay * 1.5));
      pollingInterval.current = setTimeout(tick, delay);
    };
    pollingInterval.current = setTimeout(tick, delay);
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearTimeout(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  useEffect(() => {
    mounted.current = true;
    void fetchHistory();
    return () => {
      mounted.current = false;
      stopPolling();
      if (demoInterval.current) clearInterval(demoInterval.current);
      if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While in demo mode, retry the backend every 15s.
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
          searchDepth,
        })
      });

      if (!response.ok) throw new Error();
      const newTask = await response.json();

      setTasks(prev => [newTask, ...prev]);
      handleSelectTask(newTask);

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
        if (roleFilter !== 'all') queryParams.set('role', roleFilter);
        if (minBuyerIntent > 0) queryParams.set('minBuyerIntent', minBuyerIntent.toString());
        if (minPriority > 0) queryParams.set('minPriority', minPriority.toString());
        if (notContactedOnly) queryParams.set('notContacted', 'true');

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
  }, [selectedTaskId, isDemoMode, page, searchFilter, minScore, hasEmailsOnly, roleFilter, minBuyerIntent, minPriority, notContactedOnly, sortField, sortOrder, limit]);

  // Reactively (re)load leads as the selected task progresses.
  const lastLeadFetchKey = useRef<string>("");
  useEffect(() => {
    if (!selectedTask || isDemoMode) return;
    const { id, status, totalLeads } = selectedTask;
    const terminal = TERMINAL_TASK_STATUSES.includes(status);
    const key = `${id}:${terminal ? status : `processing:${totalLeads}`}`;
    if (key === lastLeadFetchKey.current) return;
    lastLeadFetchKey.current = key;
    if (terminal) {
      void fetchTaskLeads(id, 1);
    } else if (status === "PROCESSING" && totalLeads > 0) {
      void fetchTaskLeads(id);
    }
  }, [selectedTask?.id, selectedTask?.status, selectedTask?.totalLeads, isDemoMode, fetchTaskLeads]);

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
        let filteredLeads = leads;

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
                'Location': lead.location || '',
                'Category': lead.category || '',
                'Decision Maker Name': lead.decisionMakerName || '',
                'Decision Maker Role': lead.decisionMakerRole || '',
                'Priority Score': lead.priorityScore ?? '',
                'Buyer Intent': lead.buyerIntentScore ?? '',
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
                'Decision Maker Name': lead.decisionMakerName || '',
                'Decision Maker Role': lead.decisionMakerRole || '',
                'Decision Maker Score': lead.decisionMakerScore ?? '',
                'Decision Maker Email': lead.decisionMakerEmail || '',
                'Buyer Intent Score': lead.buyerIntentScore ?? '',
                'Domain Upgrade Score': lead.domainUpgradeScore ?? '',
                'Business Quality Score': lead.businessQualityScore ?? '',
                'Priority Score': lead.priorityScore ?? '',
                'Contact Strategy': lead.contactStrategy || '',
                'Engagement Score': lead.engagementScore ?? 0,
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
                const raw = '' + (val !== null && val !== undefined ? val : '');
                const safe = /^[\t\r=+\-@]/.test(raw) ? `'${raw}` : raw;
                const escaped = safe.replace(/"/g, '""');
                return `"${escaped}"`;
              }).join(',')
            )
          ];
          const csvString = csvRows.join('\n');
          const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
          const ext = 'csv';
          triggerDownload(blob, `geolead_export_${selectedTask.domainIdea.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`);
          if (format === 'xlsx') {
            alert("Notice: Excel format fallback. Downloaded as CSV file (fully compatible with Excel) because the backend API is offline.");
          }
        }
      } else {
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
        const token: string = data.progressToken;
        const total = data.total;
        setVerifyProgress((prev) => ({ ...prev, total }));
        if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
        verifyPollInterval.current = setInterval(async () => {
          try {
            if (typeof document !== "undefined" && document.hidden) return; // pause in background tabs
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
        }, 800);
        return;
      }

      if (data.mode === 'inline' || data.mode === 'inline-fallback') {
        setVerifyProgress({
          results: data.results?.map((r: any) => ({ email: r.email, status: r.status, confidenceScore: r.confidenceScore })) || [],
          total: data.total,
          done: data.total,
          complete: true,
        });
        setVerifying(false);
        if (selectedTask) fetchTaskLeads(selectedTask.id);
      } else {
        const jobId: string = data.jobId;
        if (verifyPollInterval.current) clearInterval(verifyPollInterval.current);
        verifyPollInterval.current = setInterval(async () => {
          try {
            if (typeof document !== "undefined" && document.hidden) return; // pause in background tabs
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

  // Memoized so the list filter + summary metrics only recompute when the leads or
  // the active filter change — not on every unrelated re-render (polling, typing, etc.).
  const visibleLeads = useMemo(() => leads.filter(lead => {
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
  }), [leads, channelFilter]);

  const selectedTerminal = !!selectedTask && TERMINAL_TASK_STATUSES.includes(selectedTask.status);
  const { highPriorityCount, avgMatch } = useMemo(() => ({
    highPriorityCount: leads.filter(l => (l.priorityScore ?? l.domainMatchScore) >= 75).length,
    avgMatch: leads.length > 0 ? Math.round(leads.reduce((sum, l) => sum + l.domainMatchScore, 0) / leads.length) : 0,
  }), [leads]);

  return (
    <OutboundShell
      eyebrow={selectedTask ? `Target: ${selectedTask.domainIdea}` : "Lead Discovery"}
      title="Lead Explorer"
      subtitle={selectedTask ? `Keyword: ${selectedTask.keyword} · ${selectedTask.searchDepth} sites` : "Discover high-intent local buyers"}
      fullBleed
      actions={selectedTerminal ? (
        <>
          <button onClick={handleVerifyEmails} disabled={verifying || leads.length === 0} className="h-9 px-3 rounded-lg bg-success text-bg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-colors">
            <ShieldCheck className={`w-4 h-4 ${verifying ? 'animate-pulse' : ''}`} />
            {verifying ? 'Verifying…' : 'Verify Emails'}
          </button>
          <button onClick={() => setShowWaPanel(true)} disabled={leads.filter(l => l.phoneNumbers.length > 0).length === 0} className="h-9 px-3 rounded-lg bg-[#25D366] text-bg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 transition-colors">
            <MessageSquare className="w-4 h-4" /> Validate WA
          </button>
          <button onClick={() => setExportOptionsOpen(true)} disabled={exporting !== null} className="h-9 px-3 rounded-lg bg-brand text-bg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors">
            <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? `Exporting…` : 'Export Data'}
          </button>
          <button onClick={() => { setCampaignName(''); setShowCampaignModal(true); }} disabled={selectedLeadIds.size === 0} className="h-9 px-3 rounded-lg bg-danger text-bg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors">
            <Zap className="w-4 h-4" /> Create Campaign ({selectedLeadIds.size})
          </button>
        </>
      ) : null}
    >
      <div className="flex h-full">
        {/* Mobile rail overlay */}
        {railOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-bg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-bold text-sm text-text">Lead Discovery</h3>
              <button onClick={() => setRailOpen(false)} className="p-1.5 hover:bg-surface-2 rounded-lg text-text-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Domain Idea</label>
                <input type="text" required value={domainIdea} onChange={(e) => setDomainIdea(e.target.value)} placeholder="e.g. TexasCarVendor.com"
                  className="w-full h-10 bg-surface-2 border border-border rounded-lg px-3 text-xs text-text focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">Keyword Niche</label>
                <input type="text" required value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. Car Dealership"
                  className="w-full h-10 bg-surface-2 border border-border rounded-lg px-3 text-xs text-text focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 block">City / State</label>
                <input type="text" value={cityState} onChange={(e) => setCityState(e.target.value)} placeholder="e.g. Dallas, TX"
                  className="w-full h-10 bg-surface-2 border border-border rounded-lg px-3 text-xs text-text focus:outline-none focus:border-brand" />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Depth</label>
                <span className="text-[11px] text-text-muted font-mono">{searchDepth}</span>
              </div>
              <input type="range" min={1} max={200} value={searchDepth} onChange={(e) => setSearchDepth(Number(e.target.value))} className="w-full accent-brand" />
              <button type="button" onClick={() => { handleTriggerSearch(new Event('submit') as any); setRailOpen(false); }}
                className="w-full h-10 bg-brand text-bg rounded-lg text-xs font-bold hover:bg-brand-hover transition-colors shadow-[0_0_12px_rgba(20,184,166,0.3)]">Start Lead Discovery</button>
              {tasks.length > 0 && <div className="pt-3 border-t border-border"><h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Recent Searches</h4>
                {tasks.slice(0, 5).map((task) => (
                  <button key={task.id} onClick={() => { handleSelectTask(task); setRailOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-text-muted hover:bg-surface-2 transition-colors flex items-center justify-between">
                    <span className="truncate">{task.domainIdea}</span>
                    <span className={`text-[9px] font-bold uppercase ${task.status === 'COMPLETED' ? 'text-success' : task.status === 'FAILED' ? 'text-danger' : 'text-copper'}`}>{task.status}</span>
                  </button>
                ))}</div>}
            </div>
          </div>
        )}

        {/* Left rail: search + history */}
        <aside className="w-64 lg:w-80 shrink-0 border-r border-border bg-surface-2/30 hidden lg:flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-border">
            <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-4">New Lead Generation</h3>
            <div className="mb-4">
              <DomainSelector label="Source domain" emptyAction={{ label: "Add to portfolio", href: "/portfolio" }} />
              {activeDomain ? (
                <p className="mt-2 text-[10px] text-success">Lead search seeded from {activeDomain.name}. Edit below to fine-tune.</p>
              ) : null}
            </div>
            <form onSubmit={handleTriggerSearch} className="space-y-4">
              <div>
                <label className={LABEL}>Domain Idea</label>
                <input type="text" required value={domainIdea} onChange={(e) => setDomainIdea(e.target.value)} placeholder="e.g. TexasCarVendor.com" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Keyword Niche</label>
                <input type="text" required value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. Car Dealership" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>City / State</label>
                <input type="text" value={cityState} onChange={(e) => setCityState(e.target.value)} placeholder="e.g. Dallas, TX" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Search Depth</label>
                <select value={searchDepth} onChange={(e) => setSearchDepth(Number(e.target.value))} className={INPUT}>
                  <option value={5}>5 Leads</option>
                  <option value={10}>10 Leads</option>
                  <option value={20}>20 Leads</option>
                  <option value={50}>50 Leads</option>
                  <option value={100}>100 Leads</option>
                  <option value={MAX_SEARCH_DEPTH}>{MAX_SEARCH_DEPTH} Leads</option>
                </select>
              </div>
              <button type="submit" disabled={loading} className="w-full h-10 bg-brand hover:bg-brand-hover text-bg rounded-lg text-xs font-bold transition-all shadow-[0_0_12px_rgba(20,184,166,0.3)] flex items-center justify-center gap-1.5 disabled:opacity-60">
                <Plus className="w-4 h-4" /> Start Lead Discovery
              </button>
            </form>
          </div>

          {/* Task History */}
          <div className="flex-1 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Search History
              </h3>
              <button onClick={handleReloadHistory} className="text-[10px] text-brand hover:underline">Refresh</button>
            </div>
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-6">No previous queries found.</p>
              ) : (
                tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1.5 relative overflow-hidden ${
                      selectedTask?.id === task.id
                        ? "bg-brand/5 border-brand/40"
                        : "bg-surface border-border hover:border-brand/50"
                    }`}
                  >
                    {task.status === "PROCESSING" && (
                      <div className="absolute top-0 left-0 h-[2px] bg-brand animate-pulse" style={{ width: `${task.progress}%` }} />
                    )}
                    <div className="flex justify-between items-start w-full">
                      <span className="text-xs font-bold text-text truncate max-w-[150px]">{task.domainIdea}</span>
                      <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                        task.status === "COMPLETED" ? "bg-success/10 text-success"
                          : task.status === "FAILED" ? "bg-danger/10 text-danger"
                          : task.status === "PAUSED" ? "bg-copper/10 text-copper"
                          : task.status === "CANCELLED" ? "bg-surface-2 text-text-muted"
                          : "bg-copper/10 text-copper animate-pulse"
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted">Query: {task.keyword}</div>
                    {(task.status === "PENDING" || task.status === "PROCESSING") && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span onClick={(e) => handlePauseTask(task.id, e as any)} className="flex-1 py-1 bg-copper/10 hover:bg-copper/20 text-copper rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer text-center">Pause</span>
                        <span onClick={(e) => handleStopTask(task.id, e as any)} className="flex-1 py-1 bg-danger/10 hover:bg-danger/20 text-danger rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer text-center">Stop</span>
                      </div>
                    )}
                    {task.status === "PAUSED" && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span onClick={(e) => handleResumeTask(task.id, e as any)} className="flex-1 py-1 bg-success/10 hover:bg-success/20 text-success rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer text-center">Resume</span>
                        <span onClick={(e) => handleStopTask(task.id, e as any)} className="flex-1 py-1 bg-danger/10 hover:bg-danger/20 text-danger rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer text-center">Stop</span>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Main pane */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg overflow-hidden">
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

          {isDemoMode && (
            <div className="bg-copper/10 border-b border-copper/20 text-copper px-6 py-2.5 text-xs font-medium flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Backend offline. Showing sandbox demo data. Start the Express API for live scraping.</span>
              </div>
              <button onClick={fetchHistory} className="px-2.5 py-1 bg-copper/20 hover:bg-copper/30 text-copper rounded text-[10px] font-bold uppercase transition-colors">Retry</button>
            </div>
          )}

          {selectedTask ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Active scraping progress */}
              {(selectedTask.status === "PENDING" || selectedTask.status === "PROCESSING") && (
                <GlassCard className="p-6 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-brand animate-pulse" />
                      <div>
                        <h4 className="text-sm font-bold text-text">Active Crawl & Extraction Pipeline</h4>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {selectedTask.progress < 10 ? "Initializing search…" :
                           selectedTask.progress < 30 ? "Searching for businesses via stealth browser…" :
                           selectedTask.progress < 80 ? "Crawling websites & extracting contacts…" :
                           "Running AI intelligence pipeline…"}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-brand">{selectedTask.progress}%</span>
                  </div>
                  <div className="w-full bg-bg rounded-full h-2.5 overflow-hidden border border-border">
                    <div className="bg-gradient-to-r from-brand to-success h-2.5 rounded-full transition-all duration-300" style={{ width: `${selectedTask.progress}%` }} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-center text-xs">
                    <div className="p-3 bg-surface-2 rounded-xl border border-border">
                      <span className="text-text-muted block mb-1">Status</span>
                      <span className="font-bold text-brand capitalize">{selectedTask.status.toLowerCase()}</span>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl border border-border">
                      <span className="text-text-muted block mb-1">Leads Identified</span>
                      <span className="font-bold text-text">{selectedTask.totalLeads}</span>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl border border-border">
                      <span className="text-text-muted block mb-1">Validated Emails</span>
                      <span className="font-bold text-success">{selectedTask.validEmails}</span>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* Completed task stats */}
              {selectedTerminal && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard label="Total Prospects" value={selectedTask.totalLeads} />
                  <MetricCard label="Validated Emails" value={selectedTask.validEmails} />
                  <MetricCard label="Avg Match Score" value={`${avgMatch}%`} />
                  <MetricCard label="High Priority" value={highPriorityCount} />
                </div>
              )}

              {/* Leads table */}
              <GlassCard className="p-0 overflow-hidden flex flex-col">
                {/* Filter bar */}
                <div className="p-4 bg-surface-2/30 border-b border-border flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
                  <form onSubmit={triggerSearchFilterSubmit} className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input type="text" value={searchFilterInput} onChange={handleSearchFilterChange} placeholder="Filter by business name, keyword, city…" className="w-full h-9 bg-bg border border-border rounded-full pl-9 pr-4 text-xs text-text placeholder:text-text-faint focus:outline-none focus:border-brand" />
                    </div>
                    <button type="submit" className="h-9 px-4 bg-surface border border-border hover:bg-surface-2 rounded-full text-xs font-semibold text-text-muted hover:text-text">Apply</button>
                  </form>

                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => { setNotContactedOnly(!notContactedOnly); setPage(1); }} className={`h-9 rounded-full px-3 text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${notContactedOnly ? 'bg-brand-soft border-brand/40 text-brand' : 'bg-surface border-border text-text-muted hover:text-text'}`}>Not Contacted</button>

                    {selectedLeadIds.size > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setShowBulkActions(!showBulkActions)} className="h-9 px-3 rounded-full bg-brand text-bg text-[11px] font-bold flex items-center gap-1.5 transition-colors"><Zap className="w-3.5 h-3.5" /> Bulk ({selectedLeadIds.size})</button>
                        {showBulkActions && (
                          <>
                            <select onChange={async (e) => { const stage = e.target.value; if (!stage) return; await doBulkAction({ pipelineStage: stage }); e.target.value = ''; }} className="h-9 bg-bg border border-border rounded-full px-2 text-[11px] text-text">
                              <option value="">Set Stage…</option>
                              <option value="New">New</option>
                              <option value="Contacted">Contacted</option>
                              <option value="Replied">Replied</option>
                              <option value="Interested">Interested</option>
                              <option value="Not Interested">Not Interested</option>
                            </select>
                            <button onClick={() => doBulkAction({ markContacted: true })} className="h-9 px-2.5 rounded-full bg-success text-bg text-[11px] font-bold transition-colors">Mark Contacted</button>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 bg-surface border border-border h-9 rounded-full px-3 text-xs">
                      <TrendingUp className="w-3.5 h-3.5 text-text-muted" />
                      <select value={minScore} onChange={(e) => { setMinScore(Number(e.target.value)); setPage(1); }} className="bg-transparent border-none text-text-muted focus:outline-none text-[11px]">
                        <option value={0}>All Scores</option>
                        <option value={50}>&gt; 50% Match</option>
                        <option value={75}>&gt; 75% Match</option>
                        <option value={90}>&gt; 90% Match</option>
                      </select>
                    </div>

                    <button onClick={() => { setHasEmailsOnly(!hasEmailsOnly); setPage(1); }} className={`h-9 px-3 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${hasEmailsOnly ? "bg-brand-soft border-brand/40 text-brand" : "bg-surface border-border text-text-muted hover:text-text"}`}><Mail className="w-3.5 h-3.5" /> Has Email</button>

                    <div className="flex items-center gap-1.5 bg-surface border border-border h-9 rounded-full px-3 text-xs">
                      <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                      <select value={channelFilter} onChange={e => setChannelFilter(e.target.value as typeof channelFilter)} className="bg-transparent border-none text-text-muted focus:outline-none text-[11px]">
                        <option value="all">All Channels</option>
                        <option value="whatsapp_high">WhatsApp High (≥70)</option>
                        <option value="email_available">Email Available</option>
                        <option value="phone_available">Phone Available</option>
                        <option value="multi_channel">Multi-Channel</option>
                      </select>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 bg-surface border border-border h-9 rounded-full px-3 text-xs">
                      <span className="text-text-muted font-semibold text-[10px] uppercase">Role</span>
                      <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="bg-transparent border-none text-text-muted focus:outline-none text-[11px]">
                        <option value="all">All</option>
                        <option value="ceo">CEOs & Founders</option>
                        <option value="founder">Founders Only</option>
                        <option value="director">Directors</option>
                      </select>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 bg-surface border border-border h-9 rounded-full px-3 text-xs">
                      <span className="text-text-muted font-semibold text-[10px] uppercase">Intent</span>
                      <select value={minBuyerIntent} onChange={e => { setMinBuyerIntent(Number(e.target.value)); setPage(1); }} className="bg-transparent border-none text-text-muted focus:outline-none text-[11px]">
                        <option value={0}>Any</option>
                        <option value={65}>High (≥65)</option>
                        <option value={45}>Moderate (≥45)</option>
                      </select>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 bg-surface border border-border h-9 rounded-full px-3 text-xs">
                      <span className="text-text-muted font-semibold text-[10px] uppercase">Priority</span>
                      <select value={minPriority} onChange={e => { setMinPriority(Number(e.target.value)); setPage(1); }} className="bg-transparent border-none text-text-muted focus:outline-none text-[11px]">
                        <option value={0}>All</option>
                        <option value={75}>High (≥75)</option>
                        <option value={50}>Medium (≥50)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Table */}
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Database className="w-8 h-8 text-brand animate-spin" />
                    <span className="text-xs text-text-muted">Querying database records…</span>
                  </div>
                ) : leads.length === 0 ? (
                  <div className="text-center py-20">
                    <Database className="w-10 h-10 text-text-faint mx-auto mb-4" />
                    <h4 className="text-sm font-bold text-text-muted">No matching leads found</h4>
                    <p className="text-xs text-text-faint mt-1">Try expanding your keyword variations or removing filters.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                      <thead>
                        <tr className="border-b border-border bg-surface-2/30 text-text-muted">
                          <th className="py-4 px-2 w-10">
                            <input type="checkbox" checked={selectedLeadIds.size >= leads.length && leads.length > 0} onChange={selectAllLeads} className="w-3.5 h-3.5 rounded accent-brand cursor-pointer" />
                          </th>
                          <th className="py-4 px-6 font-bold uppercase tracking-wider text-[11px]">Business Details</th>
                          <th className="py-4 px-4 font-bold uppercase tracking-wider text-[11px]">Contact Info</th>
                          <th className="py-4 px-4 text-center font-bold uppercase tracking-wider text-[11px]">AI Scores</th>
                          <th className="py-4 px-6 font-bold uppercase tracking-wider text-[11px]">CRM Notes</th>
                        </tr>
                      </thead>
                      {leads.length > 0 && totalLeadsCount > leads.length && (
                        <tbody>
                          <tr className="bg-brand-soft/40 border-b border-border">
                            <td colSpan={5} className="py-2.5 px-6 text-[11px] text-text-muted text-center">
                              {selectedLeadIds.size >= totalLeadsCount || selectAllTruncated ? (
                                <>
                                  {selectAllTruncated ? (
                                    <>Selected the first <strong className="text-text">{selectedLeadIds.size}</strong> matching leads (capped — refine filters to select the rest). </>
                                  ) : (
                                    <>All <strong className="text-text">{totalLeadsCount}</strong> matching leads are selected. </>
                                  )}
                                  <button onClick={() => { setSelectedLeadIds(new Set()); setSelectAllTruncated(false); }} className="text-brand font-semibold hover:underline">Clear selection</button>
                                </>
                              ) : (
                                <>Only the {leads.length} leads on this page are selected ({selectedLeadIds.size} checked). <button onClick={selectAllMatchingLeads} disabled={selectingAllMatching} className="text-brand font-semibold hover:underline disabled:opacity-50">{selectingAllMatching ? 'Selecting…' : `Select all ${totalLeadsCount} leads matching filters`}</button></>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      )}
                      <tbody className="divide-y divide-border">
                        {visibleLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-surface-2/30 transition-colors align-top">
                            <td className="py-5 px-2">
                              <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={() => toggleLeadSelection(lead.id)} className="w-3.5 h-3.5 rounded accent-brand cursor-pointer" />
                            </td>

                            {/* Business Details */}
                            <td className="py-5 px-6 max-w-sm">
                              <div className="flex flex-col gap-1.5">
                                <div className="font-bold text-sm text-text flex items-center gap-1.5 flex-wrap">
                                  {lead.businessName}
                                  {lead.decisionMakerRole && (
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                      lead.decisionMakerScore && lead.decisionMakerScore >= 85 ? 'bg-copper/15 text-copper border-copper/30'
                                        : lead.decisionMakerScore && lead.decisionMakerScore >= 70 ? 'bg-brand/15 text-brand border-brand/30'
                                        : 'bg-surface-2 text-text-muted border-border'
                                    }`}>{lead.decisionMakerRole}</span>
                                  )}
                                  {lead.buyerInsights?.linkedinVerified && (
                                    <a href={lead.buyerInsights?.linkedinUrl || '#'} target="_blank" rel="noopener noreferrer" title={`LinkedIn verified: ${lead.buyerInsights?.linkedinConfidence || 'medium'} confidence`} className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-info/10 text-info border-info/20">in</a>
                                  )}
                                  {lead.companySize && lead.companySize !== "Unknown" && (
                                    <span className="px-1.5 py-0.5 bg-surface-2 border border-border text-text-muted rounded text-[9px]">{lead.companySize}</span>
                                  )}
                                </div>

                                {lead.website ? (
                                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand hover:text-brand-hover hover:underline flex items-center gap-1 w-fit">
                                    <Globe className="w-3.5 h-3.5" /><span className="truncate max-w-[200px]">{lead.website}</span><ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-text-faint flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> No Website</span>
                                )}

                                {lead.location && (
                                  <span className="text-[10px] text-text-muted flex items-start gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-text-faint shrink-0" /><span>{lead.location}</span>
                                  </span>
                                )}

                                {lead.googleMapsLink && (
                                  <a href={lead.googleMapsLink} target="_blank" rel="noreferrer" className="text-[10px] text-text-muted hover:text-text underline w-fit">View on Google Maps</a>
                                )}

                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {lead.pipelineStage && (<span className="px-2 py-0.5 rounded-full border border-brand/20 bg-brand/5 text-[9px] font-bold text-brand">{lead.pipelineStage}</span>)}
                                  {lead.leadStatus && (<span className="px-2 py-0.5 rounded-full border border-border bg-surface-2 text-[9px] font-bold text-text-muted">{lead.leadStatus}</span>)}
                                  {typeof lead.engagementScore === "number" && (<span className="px-2 py-0.5 rounded-full border border-success/20 bg-success/5 text-[9px] font-bold text-success">{lead.engagementScore}/100</span>)}
                                  {lead.doNotContact && (<span className="px-2 py-0.5 rounded-full border border-danger/20 bg-danger/5 text-[9px] font-bold text-danger">DNC</span>)}
                                </div>

                                {lead.tags && lead.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {lead.tags.slice(0, 3).map((tag) => (<span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-text-muted border border-border bg-surface">{tag}</span>))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Contact Info */}
                            <td className="py-5 px-4 max-w-xs">
                              <div className="flex flex-col gap-3">
                                {lead.bestContactChannel && (
                                  <div className="flex flex-col gap-1.5">
                                    <div className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-black w-fit border ${
                                      lead.bestContactChannel === 'WHATSAPP' ? 'bg-success/10 border-success/30 text-success'
                                        : lead.bestContactChannel === 'EMAIL' ? 'bg-brand/10 border-brand/30 text-brand'
                                        : lead.bestContactChannel === 'PHONE' ? 'bg-copper/10 border-copper/30 text-copper'
                                        : 'bg-surface-2 border-border text-text-muted'
                                    }`}>
                                      <Zap className="w-2.5 h-2.5" />
                                      {lead.bestContactChannel === 'WHATSAPP' ? 'WhatsApp First' : lead.bestContactChannel === 'EMAIL' ? 'Email First' : lead.bestContactChannel === 'PHONE' ? 'Call First' : 'Web Form'}
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[10px]">
                                      {lead.emails.length > 0 && (<span className="flex items-center gap-0.5 text-brand"><Mail className="w-2.5 h-2.5" /> Email {lead.contactChannelScores?.email ?? '—'}</span>)}
                                      {lead.whatsappScore != null && lead.whatsappScore > 0 && (
                                        <span className={`flex items-center gap-0.5 ${lead.whatsappConfidence === 'HIGH' ? 'text-success' : lead.whatsappConfidence === 'MEDIUM' ? 'text-copper' : 'text-text-muted'}`}>
                                          <MessageSquare className="w-2.5 h-2.5" /> WA {lead.whatsappScore}<span className="text-[9px] opacity-70">({lead.whatsappConfidence})</span>
                                        </span>
                                      )}
                                      {lead.phoneNumbers.length > 0 && (<span className="flex items-center gap-0.5 text-copper"><Phone className="w-2.5 h-2.5" /> Phone {lead.contactChannelScores?.phone ?? '—'}</span>)}
                                    </div>
                                  </div>
                                )}

                                {lead.emails.length === 0 ? (
                                  <span className="text-[11px] text-text-faint italic">No validated email found</span>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    {lead.emails.map((e) => (
                                      <div key={e.id} className="flex items-center gap-1.5 min-w-0">
                                        <a href={`mailto:${e.email}`} title={`Send email to ${e.email}`} className="flex items-center gap-1 text-text hover:text-brand min-w-0 font-mono text-[11px]">
                                          <Mail className="w-3 h-3 text-brand shrink-0" /><span className="truncate">{e.email}</span>
                                        </a>
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide ${e.status === "VALID" ? "bg-success/10 text-success" : "bg-copper/10 text-copper"}`}>{e.status}</span>
                                        {lead.decisionMakerRole && (
                                          <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider border ${lead.decisionMakerScore && lead.decisionMakerScore >= 85 ? 'bg-copper/20 text-copper border-copper/30' : 'bg-brand/10 text-brand border-brand/20'}`}>{lead.decisionMakerRole}</span>
                                        )}
                                        <button onClick={() => openComposer(e.email, lead)} title="Compose & send" className="ml-auto p-1 rounded text-success hover:text-success hover:bg-success/10 transition-colors"><Send className="w-3 h-3" /></button>
        {/* Mobile FAB — search leads */}
        {!railOpen && (
          <button onClick={() => setRailOpen(true)}
            className="lg:hidden fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-brand text-bg flex items-center justify-center shadow-[0_4px_16px_rgba(20,184,166,0.4)] hover:bg-brand-hover transition-colors">
            <Search className="w-5 h-5" />
          </button>
        )}

      </div>
                                    ))}
                                  </div>
                                )}

                                {lead.phoneNumbers.length > 0 && (
                                  <div className="flex flex-col gap-0.5 text-text-muted text-[10px]">
                                    {lead.phoneNumbers.map((phone, i) => (
                                      <a key={i} href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 hover:text-text w-fit" title={`Call ${phone}`}><Phone className="w-3 h-3 text-text-faint" /> {phone}</a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* AI Scores */}
                            <td className="py-5 px-4">
                              <div className="flex items-start justify-center gap-4">
                                <div className="flex flex-col items-center gap-1">
                                  <ScoreRing score={lead.priorityScore ?? lead.domainMatchScore} size="lg" />
                                  <span className="text-[9px] uppercase font-bold tracking-wider text-text-muted">Priority</span>
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-[88px]">
                                  <div className="flex items-center justify-between text-[11px] gap-3">
                                    <span className="text-text-muted font-bold uppercase">Match</span>
                                    <span className="font-mono font-bold text-brand">{lead.domainMatchScore}</span>
                                  </div>
                                  {lead.buyerIntentScore != null && (
                                    <div className="flex items-center justify-between text-[11px] gap-3">
                                      <span className="text-text-muted font-bold uppercase">Intent</span>
                                      <span className="font-mono font-bold text-copper">{lead.buyerIntentScore}</span>
                                    </div>
                                  )}
                                  {lead.decisionMakerScore != null && (
                                    <div className="flex items-center justify-between text-[11px] gap-3">
                                      <span className="text-text-muted font-bold uppercase">DM</span>
                                      <span className="font-mono font-bold text-success">{lead.decisionMakerScore}</span>
                                    </div>
                                  )}
                                  {lead.domainUpgradeScore != null && (
                                    <div className="flex items-center justify-between text-[11px] gap-3">
                                      <span className="text-text-muted font-bold uppercase">Fit</span>
                                      <span className="font-mono font-bold text-info">{lead.domainUpgradeScore}</span>
                                    </div>
                                  )}
                                  {(lead.decisionMakerName || lead.contactStrategy) && (
                                    <div className="border-t border-border pt-1.5 mt-0.5">
                                      {lead.decisionMakerName && (<div className="text-[11px] font-bold text-text leading-tight truncate max-w-[120px]">{lead.decisionMakerName}</div>)}
                                      {lead.contactStrategy && (
                                        <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">
                                          {lead.contactStrategy === 'email_decision_maker' ? '📧 DM' : lead.contactStrategy === 'email_general' ? '📧 Gen' : lead.contactStrategy === 'call_business' ? '📞 Call' : '🌐 Form'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {lead.scoreExplanation && (
                                    <div className="relative group cursor-help w-fit">
                                      <HelpCircle className="w-3.5 h-3.5 text-text-faint hover:text-text-muted" />
                                      <div className="absolute bottom-full right-0 mb-1.5 w-48 glass text-text-muted text-[10px] p-2.5 rounded-lg border border-border hidden group-hover:block shadow-xl leading-relaxed z-10">{lead.scoreExplanation}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* CRM Notes */}
                            <td className="py-5 px-6 max-w-xs">
                              {editingNotesLeadId === lead.id ? (
                                <div className="flex flex-col gap-2">
                                  <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} className="w-full bg-bg border border-border rounded p-1.5 text-[11px] text-text focus:outline-none focus:border-brand h-16 resize-none" />
                                  <div className="flex gap-1.5">
                                    <button onClick={() => handleSaveNotes(lead.id)} className="p-1 bg-brand text-bg rounded hover:bg-brand-hover" title="Save"><Save className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingNotesLeadId(null)} className="p-1 px-2 bg-surface-2 text-text-muted rounded hover:bg-surface text-[11px]">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="group/note">
                                  <p className="text-[11px] text-text-muted leading-relaxed italic whitespace-pre-wrap">{lead.notes || "No notes added yet."}</p>
                                  <button onClick={() => handleEditNotes(lead)} className="text-[10px] text-brand hover:underline mt-1 opacity-0 group-hover/note:opacity-100 transition-opacity">Edit Notes</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {!loading && totalPages > 1 && (
                  <div className="p-4 bg-surface-2/30 border-t border-border flex justify-between items-center text-xs text-text-muted">
                    <span className="truncate mr-2">Page {page} of {totalPages} ({totalLeadsCount} total leads)</span>
                    <div className="flex items-center gap-1.5">
                      <button disabled={page === 1} onClick={() => setPage(prev => Math.max(1, prev - 1))} className="p-1.5 bg-surface border border-border hover:bg-surface-2 disabled:opacity-30 rounded-lg text-text-muted"><ChevronLeft className="w-4 h-4" /></button>
                      <button disabled={page === totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} className="p-1.5 bg-surface border border-border hover:bg-surface-2 disabled:opacity-30 rounded-lg text-text-muted"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <TrendingUp className="w-12 h-12 text-text-faint mb-4" />
              <h3 className="text-base font-bold text-text-muted">Welcome to GeoLead AI</h3>
              <p className="text-xs text-text-faint max-w-sm mt-1 leading-relaxed">Generate keyword variations and discover high-intent local buyers for your domain assets. Submit a query in the rail.</p>
            </div>
          )}
        </main>
      </div>

      {/* WhatsApp Validation Panel */}
      {showWaPanel && (<WaValidationPanel leads={leads} taskId={selectedTask?.id} onClose={() => setShowWaPanel(false)} />)}

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
          <div className="glass border border-border rounded-2xl w-full max-w-md mx-2 shadow-[0_24px_64px_rgba(0,0,0,.5)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-text flex items-center gap-2"><Zap className="w-4 h-4 text-danger" /> Create Campaign</h3>
                <p className="text-[11px] text-text-muted mt-0.5">{selectedLeadIds.size} leads selected</p>
              </div>
              <button onClick={() => setShowCampaignModal(false)} className="p-1.5 text-text-muted hover:text-text rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className={LABEL}>Campaign Name</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder={`Auto: ${selectedTask?.domainIdea || 'Campaign'}`} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Daily Limit</label>
                <select value={campaignThrottle} onChange={e => setCampaignThrottle(Number(e.target.value))} className={INPUT}>
                  <option value={5}>5 / day (conservative)</option>
                  <option value={10}>10 / day (moderate)</option>
                  <option value={20}>20 / day (aggressive)</option>
                  <option value={50}>50 / day (max)</option>
                </select>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowCampaignModal(false)} className="px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text rounded-lg">Cancel</button>
              <button onClick={handleCreateCampaign} disabled={campaignCreating} className="px-4 py-1.5 bg-danger hover:opacity-90 disabled:opacity-50 rounded-lg text-xs font-bold text-bg flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />{campaignCreating ? 'Creating…' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Options Modal */}
      {exportOptionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setExportOptionsOpen(false)}>
          <div className="glass border border-border rounded-2xl w-full max-w-md shadow-[0_24px_64px_rgba(0,0,0,.5)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-text flex items-center gap-2"><Download className="w-4 h-4 text-brand" /> Export Options</h3>
                <p className="text-[11px] text-text-muted mt-0.5">Format, filters, and column groups</p>
              </div>
              <button onClick={() => setExportOptionsOpen(false)} className="p-1.5 text-text-muted hover:text-text rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={LABEL}>Format</label>
                <div className="flex gap-2">
                  {(['csv', 'xlsx', 'json'] as const).map(fmt => (
                    <button key={fmt} onClick={() => setExportFormat(fmt)} className={`flex-1 h-9 rounded-lg text-xs font-semibold transition-colors ${exportFormat === fmt ? 'bg-brand text-bg' : 'bg-bg text-text-muted hover:text-text border border-border'}`}>{fmt.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Export Mode</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={exportEmailsOnly} onChange={(e) => setExportEmailsOnly(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
                  <span className="text-xs text-text">One row per email (flat list)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={exportIncludeRisky} onChange={(e) => setExportIncludeRisky(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
                  <span className="text-xs text-text">Include risky (catch-all) emails</span>
                </label>
              </div>
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Columns Included</p>
                <p className="text-[9px] text-text-faint mb-2">Business info, contacts, emails, phone, location, category, rating, and notes are always included.</p>
                <p className="text-[9px] text-brand font-semibold">+ Decision maker (name, role, score, email)</p>
                <p className="text-[9px] text-brand font-semibold">+ LinkedIn (URL, verified status)</p>
                <p className="text-[9px] text-brand font-semibold">+ Buyer scores (intent, fit, quality, priority)</p>
                <p className="text-[9px] text-brand font-semibold">+ Contact strategy + engagement</p>
                <p className="text-[9px] text-brand font-semibold">+ Email verification details (provider, MX, confidence)</p>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setExportOptionsOpen(false)} className="px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text rounded-lg">Cancel</button>
              <button onClick={() => { setExportOptionsOpen(false); handleExport(exportFormat); }} className="px-4 py-1.5 bg-brand hover:bg-brand-hover rounded-lg text-xs font-bold text-bg flex items-center gap-1.5 shadow-[0_0_12px_rgba(20,184,166,0.3)]"><Download className="w-3.5 h-3.5" /> Export</button>
            </div>
          </div>
        </div>
      )}
    </OutboundShell>
  );
}

// ─── WhatsApp Validation Panel ────────────────────────────────────────────────

function waLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function WaValidationPanel({ leads, taskId, onClose }: { leads: Lead[]; taskId?: string; onClose: () => void }) {
  const [allLeads, setAllLeads] = useState<Lead[]>(leads);

  useEffect(() => {
    if (!taskId) return;
    (async () => {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/leads?taskId=${taskId}&hasEmails=false&limit=500&page=1`);
        if (res.ok) {
          const data = await res.json();
          setAllLeads(data.leads || []);
        }
      } catch { /* keep current leads */ }
    })();
  }, [taskId]);

  const withPhone = allLeads
    .filter(l => l.phoneNumbers.length > 0)
    .sort((a, b) => (b.whatsappScore ?? 0) - (a.whatsappScore ?? 0));

  const high = withPhone.filter(l => (l.whatsappScore ?? 0) >= 70).length;
  const medium = withPhone.filter(l => { const s = l.whatsappScore ?? 0; return s >= 45 && s < 70; }).length;
  const low = withPhone.filter(l => (l.whatsappScore ?? 0) < 45).length;

  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const visible = withPhone.filter(l => {
    const s = l.whatsappScore ?? 0;
    if (filter === 'high') return s >= 70;
    if (filter === 'medium') return s >= 45 && s < 70;
    if (filter === 'low') return s < 45;
    return true;
  });

  const confColor = (conf: string | null | undefined) =>
    conf === 'HIGH' ? 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30' :
    conf === 'MEDIUM' ? 'bg-copper/10 text-copper border-copper/30' :
      'bg-surface-2 text-text-muted border-border';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-10 mb-10 glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-[#25D366]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-text">WhatsApp Validation</h3>
              <p className="text-[11px] text-text-muted">{withPhone.length} leads with phone numbers</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-text-muted hover:text-text flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {[
            { label: 'HIGH likelihood', count: high, color: 'text-[#25D366]', filter: 'high' as const },
            { label: 'MEDIUM likelihood', count: medium, color: 'text-copper', filter: 'medium' as const },
            { label: 'LOW likelihood', count: low, color: 'text-text-muted', filter: 'low' as const },
          ].map(item => (
            <button key={item.filter} onClick={() => setFilter(filter === item.filter ? 'all' : item.filter)} className={`py-3 text-center transition-colors ${filter === item.filter ? 'bg-surface-2/60' : 'hover:bg-surface-2/40'}`}>
              <div className={`text-xl font-black ${item.color}`}>{item.count}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">{item.label}</div>
            </button>
          ))}
        </div>

        <div className="px-6 py-3 bg-surface-2/30 border-b border-border text-[11px] text-text-muted">
          Click <strong className="text-[#25D366]">Open in WhatsApp</strong> to test each number directly. Scores are AI probability estimates based on phone format, industry, and location signals.
        </div>

        <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
          {visible.length === 0 && (<div className="py-12 text-center text-sm text-text-muted">No leads in this category.</div>)}
          {visible.map(lead => (
            <div key={lead.id} className="px-6 py-4 flex items-start gap-4">
              <div className={`shrink-0 h-10 w-10 rounded-xl border flex flex-col items-center justify-center ${confColor(lead.whatsappConfidence)}`}>
                <span className="text-[13px] font-black leading-none">{lead.whatsappScore ?? '?'}</span>
                <span className="text-[8px] font-bold leading-none mt-0.5 opacity-70">{lead.whatsappConfidence ?? 'N/A'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text truncate">{lead.businessName}</div>
                {lead.location && (<div className="text-[11px] text-text-muted mt-0.5">{lead.location}</div>)}
                <div className="mt-2 flex flex-wrap gap-2">
                  {lead.phoneNumbers.map((phone, i) => (
                    <a key={i} href={waLink(phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[11px] font-semibold text-[#25D366] hover:bg-[#25D366]/20 transition-colors">
                      <MessageSquare className="w-3 h-3" />{phone}
                    </a>
                  ))}
                </div>
              </div>
              {lead.bestContactChannel && (
                <div className="shrink-0 text-[10px] text-text-muted text-right">
                  <div className={`font-bold ${lead.bestContactChannel === 'WHATSAPP' ? 'text-[#25D366]' : 'text-text-muted'}`}>{lead.bestContactChannel === 'WHATSAPP' ? '🔥 WA First' : lead.bestContactChannel}</div>
                  {lead.contactChannelScores && (
                    <div className="mt-0.5 space-y-0.5"><div>Email {lead.contactChannelScores.email}</div><div>Phone {lead.contactChannelScores.phone}</div></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Showing {visible.length} of {withPhone.length} leads with phones</span>
          <button onClick={onClose} className="h-8 px-4 rounded-lg border border-border text-xs text-text-muted hover:text-text">Close</button>
        </div>
      </div>
    </div>
  );
}
