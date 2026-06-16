import { useState, useEffect, useCallback } from "react"; 

import { 
  Newspaper, Home, Building2, Briefcase, MessageCircle, BookOpen,
  Menu, X, ChevronRight, MapPin, Clock, AlertTriangle, Heart,
  Phone, Instagram, ArrowRight, CheckCircle, Info, GraduationCap,
  Bus, Shield, Lock, LogOut, CheckSquare, XSquare,
  Inbox, LayoutDashboard, BadgeCheck, Ban, RefreshCw, AlertCircle,
  Send, PlusCircle, Search, Filter, Star, Zap, Users, TrendingUp,
  FileText, HelpCircle, ChevronDown,
} from "lucide-react";
import logo from "./logo.svg";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Page = "home" | "news" | "accommodation" | "jobs" | "confessions" | "submit" | "resources" | "contact";
type ReviewStatus = "pending" | "approved" | "rejected";
type PostCategory = "job" | "accommodation" | "news" | "confession" | "resource" | "contact";

interface ReviewPost {
  id: string;
  type: PostCategory;
  title: string;
  submittedAt: string;
  status: ReviewStatus;
  flagged: boolean;
  details: Record<string, string>;
}

const INITIAL_QUEUE: ReviewPost[] = [];
const SUBMISSION_COOLDOWN_MS = 15000;
const MIN_FORM_TIME_MS = 1800;
const ADMIN_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

type SupabasePost = {
  id: string;
  type: PostCategory;
  title: string;
  submitted_at: string;
  status: ReviewStatus;
  flagged: boolean;
  details: Record<string, string>;
};

function fromSupabasePost(post: SupabasePost): ReviewPost {
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    submittedAt: post.submitted_at,
    status: post.status,
    flagged: post.flagged,
    details: post.details || {},
  };
}

function toSupabasePost(post: ReviewPost) {
  return {
    type: post.type,
    title: post.title,
    submitted_at: post.submittedAt,
    status: post.status,
    flagged: post.flagged,
    details: post.details,
  };
}

async function supabaseRequest(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers);
  headers.set("apikey", SUPABASE_ANON_KEY);
  headers.set("Authorization", `Bearer ${token || SUPABASE_ANON_KEY}`);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(await response.text());
  return response;
}

async function signInAdmin(email: string, password: string) {
  const response = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!data.access_token) throw new Error("Missing access token");
  return data.access_token as string;
}

async function fetchPosts({ adminToken }: { adminToken?: string } = {}) {
  const query = adminToken
    ? "/rest/v1/posts?select=*&order=submitted_at.desc"
    : "/rest/v1/posts?select=*&status=eq.approved&order=submitted_at.desc";
  const response = await supabaseRequest(query, {}, adminToken);
  const data = await response.json();
  return (Array.isArray(data) ? data : []).map(fromSupabasePost);
}

async function createPost(post: ReviewPost) {
  await supabaseRequest("/rest/v1/posts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(toSupabasePost(post)),
  });
}

async function updatePostStatus(id: string, status: ReviewStatus, adminToken: string) {
  await supabaseRequest(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status }),
  }, adminToken);
}

function shouldBlockSpam(trapValue: string, formStartedAt: number, cooldownKey: string) {
  if (trapValue.trim()) return "Submission blocked.";
  if (Date.now() - formStartedAt < MIN_FORM_TIME_MS) return "Please take a moment before submitting.";
  try {
    const lastSubmit = Number(localStorage.getItem(cooldownKey) || 0);
    if (Date.now() - lastSubmit < SUBMISSION_COOLDOWN_MS) return "Please wait a few seconds before submitting again.";
  } catch {}
  return "";
}

function markSubmitted(cooldownKey: string) {
  try { localStorage.setItem(cooldownKey, String(Date.now())); } catch {}
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function firstMissing(fields: Array<[string, string]>) {
  const missing = fields.find(([, value]) => !clean(value));
  return missing ? `${missing[0]} is required.` : "";
}

function tooShort(label: string, value: string, minLength: number) {
  return clean(value).length < minLength ? `${label} needs at least ${minLength} characters.` : "";
}

function tooLong(label: string, value: string, maxLength: number) {
  return clean(value).length > maxLength ? `${label} must be ${maxLength} characters or less.` : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function hasAny(value: string, words: string[]) {
  const text = value.toLowerCase();
  return words.some(word => text.includes(word));
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "approved") return <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">Approved</span>;
  if (status === "rejected") return <span className="text-[11px] font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Rejected</span>;
  return <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Pending</span>;
}

function Tag({ color, children }: { color: "blue" | "green" | "orange" | "red" | "gray"; children: React.ReactNode }) {
  const cls = { blue: "bg-blue-50 text-blue-700 border-blue-200", green: "bg-emerald-50 text-emerald-700 border-emerald-200", orange: "bg-amber-50 text-amber-700 border-amber-200", red: "bg-red-50 text-red-700 border-red-200", gray: "bg-gray-100 text-gray-600 border-gray-200" }[color];
  return <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded border font-mono uppercase tracking-wider ${cls}`}>{children}</span>;
}

function BtnDark({ children, onClick, className = "", disabled = false }: { children: React.ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={`bg-[#1a1a1a] text-white px-5 py-2.5 rounded text-sm font-bold hover:bg-[#333] transition-colors cursor-pointer disabled:opacity-50 ${className}`}>{children}</button>;
}
function BtnGhost({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <button onClick={onClick} className={`bg-white text-[#1a1a1a] border border-gray-300 px-5 py-2.5 rounded text-sm font-bold hover:bg-gray-50 transition-colors cursor-pointer ${className}`}>{children}</button>;
}
function BtnWhiteHero({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="bg-white text-[#1a1a1a] px-6 py-3 rounded text-sm font-bold hover:bg-gray-100 transition-colors cursor-pointer">{children}</button>;
}
function BtnOutlineHero({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="border-2 border-white text-white px-6 py-3 rounded text-sm font-bold hover:bg-white/10 transition-colors cursor-pointer backdrop-blur-sm">{children}</button>;
}

function PageHeader({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-10 md:py-14">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-gray-400 mb-3">{eyebrow}</p>
            <h1 className="text-3xl md:text-4xl font-black text-[#1a1a1a] leading-tight" style={{ fontFamily: "Merriweather, serif" }}>{title}</h1>
            {sub && <p className="mt-3 text-gray-500 text-sm md:text-base max-w-xl leading-relaxed">{sub}</p>}
          </div>
          {children && <div className="shrink-0">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-gray-400 mb-2">{eyebrow}</p>}
      <h2 className="text-2xl md:text-[28px] font-black text-[#1a1a1a] leading-tight" style={{ fontFamily: "Merriweather, serif" }}>{title}</h2>
      {sub && <p className="mt-2 text-gray-500 text-sm max-w-lg leading-relaxed">{sub}</p>}
      <div className="w-8 h-0.5 bg-gray-300 mt-4" />
    </div>
  );
}

function FF({ label, placeholder, type = "text", opts = [], rows = 4, value, onChange }: {
  label: string; placeholder?: string; type?: "text" | "textarea" | "select"; opts?: string[]; rows?: number; value?: string; onChange?: (v: string) => void;
}) {
  const cls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] bg-[#f6f6f7] focus:outline-none focus:border-gray-400 focus:bg-white transition-colors";
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold text-gray-500 font-mono uppercase tracking-wider">{label}</label>
      {type === "textarea" ? <textarea rows={rows} placeholder={placeholder} className={`${cls} resize-none`} value={value} onChange={e => onChange?.(e.target.value)} />
        : type === "select" ? <select className={cls} value={value} onChange={e => onChange?.(e.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select>
        : <input type="text" placeholder={placeholder} className={cls} value={value} onChange={e => onChange?.(e.target.value)} />}
    </div>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────

const NAV_LINKS: { label: string; page: Page }[] = [
  { label: "Home", page: "home" }, { label: "News", page: "news" },
  { label: "Accommodation", page: "accommodation" }, { label: "Jobs", page: "jobs" },
  { label: "Confessions", page: "confessions" }, { label: "Resources", page: "resources" },
  { label: "Submit", page: "submit" }, { label: "Contact", page: "contact" },
];
const HERO_IMAGE = "https://images.unsplash.com/photo-1760140410902-e9e6d77fe7e5?w=1600&h=900&fit=crop&auto=format";

function Navbar({ current, navigate, transparent }: { current: Page; navigate: (p: Page) => void; transparent: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${transparent ? "bg-transparent border-transparent" : "bg-white border-b border-gray-200 shadow-sm"}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button onClick={() => navigate("home")} className="flex items-center gap-3 cursor-pointer">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden ${transparent ? "bg-white/15 backdrop-blur-sm ring-1 ring-white/25" : "bg-[#111] ring-1 ring-gray-200 shadow-sm"}`}>
              <img src={logo} alt="Ottawa Confession logo" className="h-full w-full" />
            </div>
            <div className="hidden sm:block text-left">
              <div className={`text-base font-black leading-tight tracking-tight ${transparent ? "text-white" : "text-[#111]"}`} style={{ fontFamily: "Merriweather, serif" }}>Ottawa Confession</div>
              <div className={`text-[10px] font-bold font-mono leading-tight uppercase tracking-wider ${transparent ? "text-white/65" : "text-gray-500"}`}>Community Hub</div>
            </div>
            <div className={`sm:hidden text-sm font-black ${transparent ? "text-white" : "text-[#111]"}`} style={{ fontFamily: "Merriweather, serif" }}>Ottawa Confession</div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map(({ label, page }) => (
              <button key={page} onClick={() => navigate(page)}
                className={`px-3 py-1.5 text-sm rounded transition-colors cursor-pointer font-bold tracking-tight ${transparent
                  ? current === page ? "bg-white/20 text-white" : "text-white/85 hover:text-white hover:bg-white/10"
                  : current === page ? "bg-gray-100 text-[#1a1a1a]" : "text-gray-500 hover:text-[#1a1a1a] hover:bg-gray-50"}`}>
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {transparent
              ? <BtnOutlineHero onClick={() => navigate("submit")}>Submit a Post</BtnOutlineHero>
              : <BtnDark onClick={() => navigate("submit")} className="hidden sm:block text-xs px-4 py-2">Submit a Post</BtnDark>}
            <button onClick={() => setOpen(!open)} className={`lg:hidden p-2 cursor-pointer ${transparent ? "text-white" : "text-gray-500"}`}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {open && (
          <div className={`lg:hidden border-t py-3 pb-4 ${transparent ? "border-white/20 bg-black/70 backdrop-blur-md" : "border-gray-100 bg-white"}`}>
            {NAV_LINKS.map(({ label, page }) => (
              <button key={page} onClick={() => { navigate(page); setOpen(false); }}
                className={`block w-full text-left px-3 py-2.5 text-sm rounded cursor-pointer font-bold ${transparent
                  ? current === page ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10"
                  : current === page ? "bg-gray-100 text-[#1a1a1a]" : "text-gray-600 hover:bg-gray-50"}`}>
                {label}
              </button>
            ))}
            <div className="pt-2 mt-2 border-t border-gray-200">
              <BtnDark onClick={() => { navigate("submit"); setOpen(false); }} className="w-full text-center">Submit a Post</BtnDark>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── HOME PAGE (unchanged) ────────────────────────────────────────────────────

function JobCard({ job }: { job: ReviewPost }) {
  const typeColor: Record<string, "blue" | "green" | "orange" | "gray"> = { "Part-time": "orange", "Full-time": "green", "Student": "blue", "Co-op": "blue", "Flexible": "gray" };
  const jobType = job.details["Job Type"] || "Job";
  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Tag color={typeColor[jobType] || "gray"}>{jobType}</Tag>
        <span className="text-xs font-bold font-mono text-gray-500 shrink-0">{job.details["Pay"] || ""}</span>
      </div>
      <h3 className="text-sm font-black text-[#1a1a1a] mb-1 leading-snug" style={{ fontFamily: "Merriweather, serif" }}>{job.details["Job Title"] || job.title}</h3>
      {job.details["Company"] && <p className="text-xs text-gray-500 font-medium mb-1">{job.details["Company"]}</p>}
      {job.details["Location"] && <div className="flex items-center gap-1 text-xs text-gray-400 mb-1"><MapPin size={11} />{job.details["Location"]}</div>}
      {job.details["Schedule"] && <div className="flex items-center gap-1 text-xs text-gray-400"><Clock size={11} />{job.details["Schedule"]}</div>}
      {job.details["How to Apply"] && <div className="mt-4 pt-3 border-t border-gray-100"><p className="text-[11px] text-gray-400 font-mono">Apply: {job.details["How to Apply"]}</p></div>}
      <div className="flex items-center gap-1 text-[11px] text-gray-300 mt-3 font-mono"><CheckCircle size={10} className="text-emerald-400" /> Verified · {job.submittedAt}</div>
    </div>
  );
}

function HomePage({ navigate, approvedJobs, approvedAccommodation, approvedConfessions }: { navigate: (p: Page) => void; approvedJobs: ReviewPost[]; approvedAccommodation: ReviewPost[]; approvedConfessions: ReviewPost[] }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[92vh] flex flex-col justify-end bg-gray-700">
        <img src={HERO_IMAGE} alt="Ottawa Parliament Hill skyline" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/80" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 pb-16 pt-24 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded px-3 py-1 mb-6">
                <MapPin size={12} className="text-white/70" />
                <span className="text-xs font-bold text-white/80 font-mono uppercase tracking-widest">Ottawa, Ontario</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight mb-5" style={{ fontFamily: "Merriweather, serif" }}>Ottawa's Local<br />Community Hub</h1>
              <p className="text-white/75 text-base md:text-lg mb-8 max-w-md leading-relaxed">Find local news, rooms, part-time jobs, community updates, and helpful resources for life in Ottawa.</p>
              <div className="flex flex-wrap gap-3">
                <BtnWhiteHero onClick={() => navigate("news")}>Browse News</BtnWhiteHero>
                <BtnOutlineHero onClick={() => navigate("submit")}>Submit a Post</BtnOutlineHero>
              </div>
              <div className="flex gap-6 mt-10 pt-8 border-t border-white/15">
                {[{ n: `${approvedJobs.length}`, label: "Active job listings" }, { n: `${approvedAccommodation.length}`, label: "Room listings" }, { n: `${approvedConfessions.length}`, label: "Community posts" }].map(({ n, label }) => (
                  <div key={label}><p className="text-xl font-black text-white">{n}</p><p className="text-xs text-white/50 font-mono">{label}</p></div>
                ))}
              </div>
            </div>
            <div className="hidden lg:grid grid-cols-2 gap-3">
              {[
                { icon: Newspaper, label: "Ottawa News", sub: "12 new posts today", color: "text-blue-300", bg: "bg-blue-500/10", page: "news" as Page },
                { icon: Building2, label: "Accommodation", sub: `${approvedAccommodation.length} active listings`, color: "text-emerald-300", bg: "bg-emerald-500/10", page: "accommodation" as Page },
                { icon: Briefcase, label: "Jobs", sub: `${approvedJobs.length} approved jobs`, color: "text-amber-300", bg: "bg-amber-500/10", page: "jobs" as Page },
                { icon: BookOpen, label: "Resources", sub: "Guides & contacts", color: "text-gray-300", bg: "bg-white/10", page: "resources" as Page },
              ].map(({ icon: Icon, label, sub, color, bg, page }) => (
                <button key={label} onClick={() => navigate(page)} className={`${bg} group text-left backdrop-blur-sm border border-white/15 rounded-xl p-5 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70 transition-colors cursor-pointer`}>
                  <Icon size={20} className={`${color} mb-3`} />
                  <p className="text-sm font-bold text-white mb-1">{label}</p>
                  <p className="text-xs text-white/50">{sub}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-white/40 group-hover:text-white/70 transition-colors">Open <ChevronRight size={12} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* Quick Access */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-[11px] font-bold font-mono uppercase tracking-widest text-gray-400 mb-6 text-center">Explore the Hub</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Newspaper, label: "Ottawa News", sub: "Local updates, transit, events", color: "blue" as const, page: "news" as Page },
              { icon: Building2, label: "Accommodation", sub: "Rooms, rentals, roommates", color: "green" as const, page: "accommodation" as Page },
              { icon: Briefcase, label: "Jobs", sub: "Part-time, student, local hiring", color: "orange" as const, page: "jobs" as Page },
              { icon: MessageCircle, label: "Confessions", sub: "Anonymous community voices", color: "gray" as const, page: "confessions" as Page },
            ].map(({ icon: Icon, label, sub, color, page }) => (
              <button key={label} onClick={() => navigate(page)} className="group bg-white border border-gray-200 rounded-xl p-5 text-left hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                <div className="mb-3"><Tag color={color}>{label}</Tag></div>
                <Icon size={22} className="text-gray-300 mb-2" />
                <p className="text-xs text-gray-400 leading-relaxed">{sub}</p>
                <div className="mt-4 flex items-center gap-1 text-xs text-gray-300 group-hover:text-gray-500 transition-colors font-bold">Browse <ChevronRight size={12} /></div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Latest News */}
      <section className="hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between">
            <SectionTitle eyebrow="Community" title="Latest News" sub="Local updates from across Ottawa." />
            <button onClick={() => navigate("news")} className="hidden sm:flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-[#1a1a1a] cursor-pointer mb-8 transition-colors">All news <ArrowRight size={14} /></button>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 mb-3"><Tag color="blue">Transit</Tag><span className="text-[11px] font-bold text-gray-300 font-mono">Featured · 2 hours ago</span></div>
            <h3 className="text-lg font-black text-[#1a1a1a] mb-2 leading-snug" style={{ fontFamily: "Merriweather, serif" }}>OC Transpo announces Route 40 weekend schedule changes effective June 22</h3>
            <p className="text-sm text-gray-500 leading-relaxed">Buses will run every 20 minutes on Saturdays and 30 minutes on Sundays. The changes are part of OC Transpo's seasonal adjustment program affecting routes across the city.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { tag: "orange" as const, cat: "Students", title: "uOttawa & Carleton fall 2025 registration now open", time: "4 hours ago" },
              { tag: "green" as const, cat: "Events", title: "Tulip Festival 2025: Full schedule and free admission days", time: "6 hours ago" },
              { tag: "gray" as const, cat: "Alerts", title: "City of Ottawa water maintenance — Centretown June 18", time: "Yesterday" },
              { tag: "orange" as const, cat: "Community", title: "New community centre breaks ground in Barrhaven", time: "Yesterday" },
              { tag: "blue" as const, cat: "City", title: "Ottawa council approves $200M affordable housing plan", time: "2 days ago" },
              { tag: "green" as const, cat: "Events", title: "Dragon Boat Festival returns to the Rideau River June 28–29", time: "2 days ago" },
            ].map(({ tag, cat, title, time }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer">
                <Tag color={tag}>{cat}</Tag>
                <h4 className="text-sm font-black text-[#1a1a1a] mt-3 mb-3 leading-snug" style={{ fontFamily: "Merriweather, serif" }}>{title}</h4>
                <div className="flex items-center gap-1 text-xs text-gray-400 font-medium"><Clock size={11} />{time}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jobs preview */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between">
            <SectionTitle eyebrow="Employment" title="Jobs in Ottawa" sub="Community-submitted, admin-verified job listings." />
            <button onClick={() => navigate("jobs")} className="hidden sm:flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-[#1a1a1a] cursor-pointer mb-8 transition-colors">All jobs <ArrowRight size={14} /></button>
          </div>
          {approvedJobs.length === 0 ? (
            <div className="bg-[#f8f8f8] border border-gray-200 rounded-xl py-14 text-center">
              <Briefcase size={28} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-black text-gray-400" style={{ fontFamily: "Merriweather, serif" }}>No approved jobs yet</p>
              <p className="text-xs text-gray-400 mt-1 mb-5">Be the first to post a job — it'll go live after admin review.</p>
              <BtnDark onClick={() => navigate("submit")}>Post a Job</BtnDark>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{approvedJobs.slice(0, 6).map(job => <JobCard key={job.id} job={job} />)}</div>
          )}
        </div>
      </section>

      {/* Confessions small */}
      <section className="bg-[#f8f8f8] py-14 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <SectionTitle eyebrow="Community" title="Community Confessions" sub="Anonymous thoughts, stories, and opinions from people around Ottawa." />
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {["I missed my OC Transpo bus three times because the app showed wrong times. Still love Ottawa though.", "To the stranger who helped me carry my groceries in the rain near Rideau Centre — you made my entire week.", "First month as a newcomer. Everyone is so polite and the city is clean. I feel genuinely welcome here."].map((text, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-5">
                <MessageCircle size={14} className="text-gray-300 mb-3" />
                <p className="text-sm text-gray-600 leading-relaxed italic">"{text}"</p>
                <p className="text-[11px] text-gray-300 mt-4 font-mono font-bold">— Anonymous · Ottawa</p>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("confessions")} className="text-sm font-bold text-gray-500 hover:text-[#1a1a1a] flex items-center gap-1 cursor-pointer transition-colors">Read more <ArrowRight size={14} /></button>
        </div>
      </section>

      {/* Submit CTA */}
      <section className="bg-white py-16 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-[#f8f8f8] border border-gray-200 rounded-2xl px-8 py-12 text-center max-w-3xl mx-auto">
            <p className="text-[11px] font-bold font-mono uppercase tracking-widest text-gray-400 mb-3">Contribute</p>
            <h2 className="text-2xl md:text-3xl font-black text-[#1a1a1a] mb-3" style={{ fontFamily: "Merriweather, serif" }}>Have something useful to share with Ottawa?</h2>
            <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto leading-relaxed">Help your neighbours by sharing news, job openings, available rooms, or community resources.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <BtnDark onClick={() => navigate("submit")}>Submit News</BtnDark>
              <BtnGhost onClick={() => navigate("submit")}>Post Accommodation</BtnGhost>
              <BtnGhost onClick={() => navigate("submit")}>Share a Job</BtnGhost>
              <BtnGhost onClick={() => navigate("submit")}>Send Confession</BtnGhost>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── NEWS PAGE ────────────────────────────────────────────────────────────────

type NewsArticle = {
  tag: "blue" | "green" | "orange" | "gray";
  cat: string;
  title: string;
  body: string;
  time: string;
  url?: string;
  source: "Live feed" | "Community";
};

const NEWS_ARTICLES: NewsArticle[] = [/*
  { tag: "blue" as const, cat: "Transit", title: "OC Transpo Route 40 weekend schedule changes effective June 22", body: "Buses will run every 20 minutes Saturdays, 30 minutes Sundays, starting June 22, 2025.", time: "2 hours ago", featured: true },
  { tag: "orange" as const, cat: "Students", title: "uOttawa & Carleton fall 2025 registration is now open", body: "Both universities have opened course registration for Fall 2025. Register early to secure your preferred courses.", time: "4 hours ago", featured: false },
  { tag: "green" as const, cat: "Events", title: "Canadian Tulip Festival 2025 — full schedule and free admission days", body: "The annual festival runs May 9–19. Free admission on opening day. Over 300,000 tulips across Commissioners Park.", time: "6 hours ago", featured: false },
  { tag: "gray" as const, cat: "Alerts", title: "Centretown water maintenance scheduled for June 18, 9AM–4PM", body: "The City of Ottawa has announced a planned water shut-off in parts of Centretown. Residents advised to store water.", time: "Yesterday", featured: false },
  { tag: "orange" as const, cat: "Community", title: "New community centre breaks ground in Barrhaven", body: "Construction on the $12M Barrhaven Community Centre began this week, with completion expected in late 2026.", time: "Yesterday", featured: false },
  { tag: "blue" as const, cat: "City", title: "Ottawa city council approves $200M affordable housing plan", body: "The plan includes 1,400 new affordable units across the city over four years, passing with a 15–9 vote.", time: "2 days ago", featured: false },
  { tag: "green" as const, cat: "Events", title: "Rideau River Dragon Boat Festival returns June 28–29", body: "75 teams registered. Live music and food vendors along the riverbank from 9 AM each day.", time: "2 days ago", featured: false },
  { tag: "gray" as const, cat: "Alerts", title: "Ottawa Public Health issues heat advisory — cooling centres open", body: "Temperatures expected to reach 36°C Saturday. Cooling centres open at all public libraries and recreation centres.", time: "3 days ago", featured: false },
  { tag: "orange" as const, cat: "Students", title: "Carleton University opens new $4M student wellness centre", body: "The facility features mental health counsellors, wellness coaches, and drop-in hours Monday through Saturday.", time: "3 days ago", featured: false },
*/];

function NewsPage({ approvedNews }: { approvedNews: ReviewPost[] }) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [liveNews, setLiveNews] = useState<NewsArticle[]>(NEWS_ARTICLES);
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  const filters = ["All", "Live feed", "Community"];

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      setFeedStatus("loading");
      try {
        const res = await fetch(`/news.json?updated=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("News feed unavailable");
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        if (!cancelled) {
          setLiveNews(items);
          setFeedStatus(items.length > 0 ? "ready" : "error");
        }
      } catch {
        if (!cancelled) {
          setLiveNews([]);
          setFeedStatus("error");
        }
      }
    };
    loadNews();
    const timer = window.setInterval(loadNews, 15 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const communityNews: NewsArticle[] = approvedNews.map(post => ({
    tag: "green",
    cat: "Community",
    title: post.title,
    body: post.details.Summary || post.details.Details || "",
    time: post.submittedAt,
    url: post.details.Source,
    source: "Community",
  }));
  const articles = [...communityNews, ...liveNews];
  const list = articles.filter(a =>
    (filter === "All" || a.cat === filter) &&
    (search === "" || `${a.title} ${a.body}`.toLowerCase().includes(search.toLowerCase()))
  );
  const featured: NewsArticle | null = null;
  const rest = list;

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · News" title="Local News & Updates" sub="Trusted community-submitted news for Ottawa residents, students, and newcomers." />

      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="hidden">
          <RefreshCw size={16} className={`${feedStatus === "loading" ? "animate-spin" : ""} ${feedStatus === "error" ? "text-amber-600" : "text-blue-600"} mt-0.5 shrink-0`} />
          <div>
            <p className={`text-sm font-black mb-1 ${feedStatus === "error" ? "text-amber-700" : "text-blue-700"}`}>Automatic News Feed</p>
            <p className={`text-xs leading-relaxed ${feedStatus === "error" ? "text-amber-700" : "text-blue-700"}`}>
              {feedStatus === "error" ? "The live feed could not load right now. Approved community news will still appear here." : "Pulling Ottawa headlines from Google News RSS and refreshing every 15 minutes."}
            </p>
          </div>
        </div>

        {/* Search + filters bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Search news…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-[#f6f6f7] focus:outline-none focus:border-gray-400 focus:bg-white transition-colors font-medium"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-2 text-xs rounded-lg border font-bold cursor-pointer transition-colors ${filter === f ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[{ n: list.length.toString(), label: "Articles shown" }, { n: liveNews.length.toString(), label: "Live headlines" }, { n: approvedNews.length.toString(), label: "Community posts" }].map(({ n, label }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl px-5 py-4 text-center">
              <p className="text-2xl font-black text-[#1a1a1a]">{n}</p>
              <p className="text-xs font-bold text-gray-400 font-mono uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* Featured article */}
        {featured && (
          <div className="relative overflow-hidden bg-[#1a1a1a] rounded-2xl p-7 mb-8 cursor-pointer group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/3 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Tag color={featured.tag}>{featured.cat}</Tag>
                <span className="text-[11px] font-bold text-white/40 font-mono">FEATURED STORY</span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white mb-3 leading-snug group-hover:text-gray-200 transition-colors" style={{ fontFamily: "Merriweather, serif" }}>{featured.title}</h2>
              <p className="text-sm text-white/60 leading-relaxed mb-5">{featured.body}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-white/40 font-mono font-bold"><Clock size={11} />{featured.time}</div>
                <span className="text-xs font-bold text-white/50 group-hover:text-white/80 transition-colors flex items-center gap-1">Read more <ArrowRight size={12} /></span>
              </div>
            </div>
          </div>
        )}

        {/* Article grid */}
        {rest.length === 0 && (
          <div className="bg-[#f8f8f8] border border-gray-200 rounded-xl py-16 text-center">
            <Newspaper size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-400">No articles match your search.</p>
          </div>
        )}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rest.map(({ tag, cat, title, body, time, url, source }) => (
            <a key={`${source}-${title}`} href={url || undefined} target={url ? "_blank" : undefined} rel="noreferrer" className="group border border-gray-200 rounded-xl p-5 bg-white hover:border-gray-300 hover:shadow-md transition-all cursor-pointer flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <Tag color={tag}>{cat}</Tag>
                <div className="flex items-center gap-1 text-xs text-gray-400 font-mono font-bold"><Clock size={11} />{time}</div>
              </div>
              <h3 className="text-sm font-black text-[#1a1a1a] mb-2 leading-snug flex-1" style={{ fontFamily: "Merriweather, serif" }}>{title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">{body}</p>
              <div className="flex items-center gap-1 text-xs font-bold text-gray-300 group-hover:text-gray-500 transition-colors mt-auto">{url ? "Open story" : "Community post"} <ArrowRight size={11} /></div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ACCOMMODATION PAGE ───────────────────────────────────────────────────────

const LISTINGS: ReviewPost[] = [/*
  { tag: "green" as const, type: "Room Available", price: "$950/mo", area: "Sandy Hill", beds: "1 Bed", detail: "Utilities included, no pets, quiet building, female preferred", avail: "July 1" },
  { tag: "blue" as const, type: "Looking for Room", price: "Budget $800", area: "Centretown", beds: "Shared ok", detail: "Female student, non-smoker, clean, references available", avail: "ASAP" },
  { tag: "orange" as const, type: "Need Roommate", price: "$700/mo each", area: "Gloucester", beds: "2BR split", detail: "Close to IKEA & Costco, laundry in unit, free parking", avail: "Aug 1" },
  { tag: "gray" as const, type: "Sublet", price: "$1,100/mo", area: "Byward Market", beds: "1 Bed", detail: "Furnished, Aug 1 – Dec 31, all utilities included", avail: "Aug 1" },
  { tag: "green" as const, type: "Room Available", price: "$875/mo", area: "Kanata", beds: "1 Bed", detail: "Near Kanata Centrum, parking included, quiet area", avail: "July 15" },
  { tag: "orange" as const, type: "Need Roommate", price: "$750/mo each", area: "Nepean", beds: "3BR share", detail: "3BR house, backyard, 2 spots open, professionals preferred", avail: "Aug 1" },
  { tag: "blue" as const, type: "Looking for Room", price: "Budget $900", area: "Sandy Hill", beds: "Own room", detail: "Male newcomer, working professional, very clean", avail: "July 1" },
  { tag: "green" as const, type: "Room Available", price: "$1,200/mo", area: "Barrhaven", beds: "1 Bed", detail: "Brand new build, modern kitchen, gym access included", avail: "ASAP" },
*/];

function AccommodationPage({ navigate, approvedAccommodation }: { navigate: (p: Page) => void; approvedAccommodation: ReviewPost[] }) {
  const [typeF, setTypeF] = useState("All");
  const [areaF, setAreaF] = useState("All");
  const types = ["All", "Room Available", "Looking for Room", "Need Roommate", "Sublet"];
  const areas = ["All", ...Array.from(new Set(approvedAccommodation.map(l => l.details.Area).filter(Boolean)))];
  const filtered = approvedAccommodation.filter(l => (typeF === "All" || l.details.Type === typeF) && (areaF === "All" || l.details.Area === areaF));

  const typeTag: Record<string, "green" | "blue" | "orange" | "gray"> = { "Room Available": "green", "Looking for Room": "blue", "Need Roommate": "orange", "Sublet": "gray" };

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · Housing" title="Accommodation" sub="Rooms, sublets, roommate listings, and housing help across Ottawa.">
        <BtnDark onClick={() => navigate("submit")} className="flex items-center gap-2"><PlusCircle size={14} /> Post a Listing</BtnDark>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Scam alert */}
        <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-5 mb-8 flex gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-red-700 mb-1">Scam Alert — Protect Yourself</p>
            <p className="text-xs text-red-600 leading-relaxed">Never send a deposit or e-transfer before viewing and verifying a property in person. If an offer seems too good to be true, it usually is. Report suspicious listings to Ottawa Police at <strong>613-236-1222</strong>.</p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { n: filtered.length.toString(), label: "Listings shown", color: "text-[#1a1a1a]" },
            { n: approvedAccommodation.filter(l => l.details.Type === "Room Available").length.toString(), label: "Rooms available", color: "text-emerald-600" },
            { n: approvedAccommodation.filter(l => l.details.Type === "Need Roommate").length.toString(), label: "Need roommate", color: "text-amber-600" },
            { n: approvedAccommodation.filter(l => l.details.Type === "Looking for Room").length.toString(), label: "Looking for room", color: "text-blue-600" },
          ].map(({ n, label, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-4 text-center">
              <p className={`text-2xl font-black ${color}`}>{n}</p>
              <p className="text-[11px] font-bold text-gray-400 font-mono uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1"><Filter size={14} className="text-gray-400" /><span className="text-xs font-black text-gray-500 uppercase tracking-widest font-mono">Filter Listings</span></div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 font-mono uppercase tracking-widest mb-2">Post Type</p>
            <div className="flex flex-wrap gap-2">
              {types.map(t => <button key={t} onClick={() => setTypeF(t)} className={`px-3 py-1.5 text-xs rounded-lg border font-bold cursor-pointer transition-colors ${typeF === t ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>{t}</button>)}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 font-mono uppercase tracking-widest mb-2">Area</p>
            <div className="flex flex-wrap gap-2">
              {areas.map(a => <button key={a} onClick={() => setAreaF(a)} className={`px-3 py-1.5 text-xs rounded-lg border font-bold cursor-pointer transition-colors ${areaF === a ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>{a}</button>)}
            </div>
          </div>
        </div>

        {/* Listings */}
        {filtered.length === 0 ? (
          <div className="bg-[#f8f8f8] border border-gray-200 rounded-xl py-16 text-center">
            <Building2 size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-black text-gray-400">No listings match your filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((listing) => {
              const area = listing.details.Area || "Ottawa";
              const beds = listing.details.Beds || "Room";
              return (
              <div key={listing.id} className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer flex flex-col">
                <Tag color={typeTag[listing.details.Type] || "gray"}>{listing.details.Type || "Listing"}</Tag>
                <div className="mt-4 text-2xl font-black text-[#1a1a1a]">{listing.details.Price || "Contact"}</div>
                <div className="flex items-center gap-1 text-xs text-gray-500 font-bold mt-1 mb-3"><MapPin size={11} />{area} · {beds}</div>
                <p className="text-xs text-gray-400 leading-relaxed mb-4 flex-1">{listing.details.Detail || listing.details.Details}</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-[11px] font-bold font-mono text-gray-400">Avail: {listing.details.Available || "Ask poster"}</span>
                  <span className="text-xs font-bold text-gray-300 group-hover:text-gray-600 transition-colors flex items-center gap-0.5">View <ChevronRight size={11} /></span>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── JOBS PAGE ────────────────────────────────────────────────────────────────

function JobsPage({ navigate, approvedJobs }: { navigate: (p: Page) => void; approvedJobs: ReviewPost[] }) {
  const [typeF, setTypeF] = useState("All");
  const types = ["All", "Part-time", "Full-time", "Student", "Co-op", "Flexible"];
  const filtered = typeF === "All" ? approvedJobs : approvedJobs.filter(j => j.details["Job Type"] === typeF);

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · Employment" title="Jobs in Ottawa" sub="Community-submitted job listings, reviewed and approved by our admin team before going live.">
        <BtnDark onClick={() => navigate("submit")} className="flex items-center gap-2"><PlusCircle size={14} /> Post a Job</BtnDark>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Send, step: "1", label: "Submit a Job", sub: "Fill out the job form with all details", color: "bg-blue-50 border-blue-200 text-blue-600" },
            { icon: Shield, step: "2", label: "Admin Reviews", sub: "Our team checks for quality and safety", color: "bg-amber-50 border-amber-200 text-amber-600" },
            { icon: CheckCircle, step: "3", label: "Goes Live", sub: "Approved jobs appear here instantly", color: "bg-emerald-50 border-emerald-200 text-emerald-600" },
          ].map(({ icon: Icon, step, label, sub, color }) => (
            <div key={label} className={`border rounded-xl p-5 flex items-start gap-4 ${color}`}>
              <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center shrink-0 font-black text-sm">{step}</div>
              <div><p className="text-sm font-black mb-1">{label}</p><p className="text-xs opacity-70 leading-relaxed">{sub}</p></div>
            </div>
          ))}
        </div>

        {/* Stats + filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-[#1a1a1a]">{approvedJobs.length}</p>
              <p className="text-[11px] font-bold text-gray-400 font-mono uppercase tracking-wide">Live jobs</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-emerald-600">{filtered.length}</p>
              <p className="text-[11px] font-bold text-gray-400 font-mono uppercase tracking-wide">Shown</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {types.map(t => (
              <button key={t} onClick={() => setTypeF(t)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-bold cursor-pointer transition-colors ${typeF === t ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state or grid */}
        {filtered.length === 0 ? (
          <div className="bg-[#f8f8f8] border border-gray-200 rounded-2xl py-20 text-center">
            <Briefcase size={36} className="text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-black text-gray-400 mb-2" style={{ fontFamily: "Merriweather, serif" }}>
              {approvedJobs.length === 0 ? "No jobs listed yet" : `No ${typeF.toLowerCase()} jobs right now`}
            </h3>
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto leading-relaxed">
              {approvedJobs.length === 0 ? "Be the first to post a job. Reviewed and published within 24 hours." : "Try a different filter, or submit a job in this category."}
            </p>
            <BtnDark onClick={() => navigate("submit")} className="inline-flex items-center gap-2"><Send size={13} /> Submit a Job</BtnDark>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(job => <JobCard key={job.id} job={job} />)}</div>
        )}
      </div>
    </div>
  );
}

// ─── CONFESSIONS PAGE ─────────────────────────────────────────────────────────

const CONFESSIONS_DATA: ReviewPost[] = [/*
  { cat: "Transit", text: "I've been taking the wrong bus home for two weeks and just realized I could walk in half the time. Ottawa transit, you humbled me." },
  { cat: "Gratitude", text: "To the stranger who helped me carry my groceries in the rain near Rideau Centre — you restored my faith in people. Thank you." },
  { cat: "General", text: "First month as a newcomer to Ottawa. I was so scared but everyone has been so kind. I already feel at home." },
  { cat: "Neighbours", text: "My neighbour has been snowblowing my driveway all winter without saying a word. Whoever you are — thank you so much." },
  { cat: "School", text: "I failed my first midterm at Carleton and was ready to give up. My professor sat with me for an hour and turned everything around." },
  { cat: "Work", text: "Applied to 5 jobs last week after staying at the same place for 3 years. One already called back. Small step, but it feels huge." },
  { cat: "General", text: "There's something beautiful about walking down a snowy Ottawa street at 7am when the whole city is completely quiet." },
  { cat: "Transit", text: "Watched an OC Transpo driver make direct eye contact with me and drive away. That was 6 months ago. I'm still not over it." },
  { cat: "Gratitude", text: "Ottawa food bank volunteers changed my life during a really hard stretch. If you can donate, please do. They do incredible work quietly." },
*/];

function ConfessionsPage({ navigate, approvedConfessions }: { navigate: (p: Page) => void; approvedConfessions: ReviewPost[] }) {
  const [cat, setCat] = useState("All");
  const cats = ["All", "Transit", "Neighbours", "Work", "School", "Gratitude", "General"];
  const catColor: Record<string, "blue" | "green" | "orange" | "gray"> = { Transit: "blue", Neighbours: "green", Work: "orange", School: "orange", Gratitude: "green", General: "gray" };
  const filtered = cat === "All" ? approvedConfessions : approvedConfessions.filter(c => c.details.Category === cat);

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · Community" title="Community Confessions" sub="Anonymous thoughts, stories, and opinions from people around Ottawa. A safe, respectful, moderated space." />

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Guidelines box */}
        <div className="bg-[#f8f8f8] border border-gray-200 rounded-xl p-5 mb-8 flex gap-3">
          <Shield size={16} className="text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-[#1a1a1a] mb-1">Community Guidelines</p>
            <p className="text-xs text-gray-500 leading-relaxed">This space is for honest, respectful sharing. No hate speech, no personal attacks, no identifying others without consent. All posts are moderated before publishing. Keep it safe and kind.</p>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-4 py-2 text-xs rounded-xl border font-bold cursor-pointer transition-colors ${cat === c ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
              {c}
              {c !== "All" && <span className="ml-1.5 font-mono text-[10px] opacity-60">({approvedConfessions.filter(x => x.details.Category === c).length})</span>}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div className="flex flex-col gap-4 mb-10">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-gray-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3 mb-4">
                <Tag color={catColor[c.details.Category] || "gray"}>{c.details.Category || "General"}</Tag>
                <button className="text-xs font-bold text-gray-300 hover:text-red-400 cursor-pointer transition-colors">❤ Support</button>
              </div>
              <p className="text-base text-gray-700 leading-relaxed italic">"{c.details.Text}"</p>
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-300 font-mono">— Anonymous · Ottawa</span>
                <span className="text-[11px] font-bold text-emerald-400 font-mono flex items-center gap-1"><CheckCircle size={10} /> Moderated</span>
              </div>
            </div>
          ))}
        </div>

        {/* Submit CTA */}
        <div className="bg-[#1a1a1a] rounded-2xl p-8 text-center">
          <MessageCircle size={24} className="text-white/30 mx-auto mb-3" />
          <h3 className="text-lg font-black text-white mb-2" style={{ fontFamily: "Merriweather, serif" }}>Have something to share?</h3>
          <p className="text-sm text-white/50 mb-5">It's completely anonymous. Every post is reviewed for safety before publishing.</p>
          <BtnWhiteHero onClick={() => navigate("submit")}>Send Your Confession</BtnWhiteHero>
        </div>
      </div>
    </div>
  );
}

// ─── SUBMIT PAGE ──────────────────────────────────────────────────────────────

function SubmitPage({ onSubmitPost }: { onSubmitPost: (post: ReviewPost) => Promise<void> | void }) {
  type Tab = "job" | "news" | "accommodation" | "confession" | "resource";
  const [tab, setTab] = useState<Tab>("job");
  const [done, setDone] = useState(false);
  const [jobTitle, setJobTitle] = useState(""); const [company, setCompany] = useState("");
  const [pay, setPay] = useState(""); const [location, setLocation] = useState("");
  const [jobType, setJobType] = useState("Part-time"); const [schedule, setSchedule] = useState("");
  const [description, setDescription] = useState(""); const [howToApply, setHowToApply] = useState("");
  const [newsHeadline, setNewsHeadline] = useState(""); const [newsCategory, setNewsCategory] = useState("Transit");
  const [newsDetails, setNewsDetails] = useState(""); const [newsSource, setNewsSource] = useState("");
  const [roomType, setRoomType] = useState("Room Available"); const [roomPrice, setRoomPrice] = useState("");
  const [roomArea, setRoomArea] = useState(""); const [roomDetails, setRoomDetails] = useState(""); const [roomContact, setRoomContact] = useState("");
  const [confessionCategory, setConfessionCategory] = useState("Transit"); const [confessionText, setConfessionText] = useState("");
  const [resourceName, setResourceName] = useState(""); const [resourceCategory, setResourceCategory] = useState("Student Help");
  const [resourceDescription, setResourceDescription] = useState(""); const [resourceContact, setResourceContact] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitTrap, setSubmitTrap] = useState("");
  const [submitStartedAt, setSubmitStartedAt] = useState(Date.now());

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "job", label: "Share a Job", icon: <Briefcase size={14} /> },
    { key: "news", label: "Submit News", icon: <Newspaper size={14} /> },
    { key: "accommodation", label: "Post Room", icon: <Building2 size={14} /> },
    { key: "confession", label: "Confession", icon: <MessageCircle size={14} /> },
    { key: "resource", label: "Suggest Resource", icon: <BookOpen size={14} /> },
  ];

  const now = () => { const d = new Date(); return `${d.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}`; };

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    const spamMessage = shouldBlockSpam(submitTrap, submitStartedAt, "och_submit_last_at");
    if (spamMessage) {
      setSubmitError(spamMessage);
      return;
    }
    let validationError = "";
    if (tab === "job") {
      validationError =
        firstMissing([["Job title", jobTitle], ["Company", company], ["Pay", pay], ["Location", location], ["How to apply", howToApply]]) ||
        tooShort("Job description", description, 20) ||
        tooLong("Job title", jobTitle, 90) ||
        tooLong("Company", company, 80) ||
        tooLong("Job description", description, 1200) ||
        tooLong("How to apply", howToApply, 240);
    } else if (tab === "news") {
      validationError =
        firstMissing([["Headline", newsHeadline], ["Story details", newsDetails]]) ||
        tooShort("Story details", newsDetails, 30) ||
        tooLong("Headline", newsHeadline, 140) ||
        tooLong("Story details", newsDetails, 1600);
    } else if (tab === "accommodation") {
      validationError =
        firstMissing([["Price or budget", roomPrice], ["Area", roomArea], ["Details", roomDetails]]) ||
        tooShort("Room details", roomDetails, 30) ||
        tooLong("Room details", roomDetails, 1200) ||
        tooLong("Contact", roomContact, 240);
    } else if (tab === "confession") {
      validationError =
        firstMissing([["Confession", confessionText]]) ||
        tooShort("Confession", confessionText, 20) ||
        tooLong("Confession", confessionText, 1000);
      if (!validationError && hasAny(confessionText, ["kill yourself", "i will kill", "dox", "address is", "phone number is"])) {
        validationError = "Please remove threats or identifying information before submitting.";
      }
    } else if (tab === "resource") {
      validationError =
        firstMissing([["Resource name", resourceName], ["Description", resourceDescription], ["Website or contact", resourceContact]]) ||
        tooShort("Resource description", resourceDescription, 20) ||
        tooLong("Resource name", resourceName, 100) ||
        tooLong("Resource description", resourceDescription, 800) ||
        tooLong("Website or contact", resourceContact, 240);
    }
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    try {
    if (tab === "job") {
      const suspicious = ["sin", "social insurance", "bank info", "e-transfer", "$500/day", "commission only", "dm on instagram", "telegram", "gift card", "crypto", "pay upfront", "training fee", "processing fee"].some(kw =>
        [jobTitle, company, description, howToApply].join(" ").toLowerCase().includes(kw)
      );
      await onSubmitPost({ id: `j${Date.now()}`, type: "job", title: jobTitle || "Job Posting", submittedAt: now(), status: "pending", flagged: suspicious, details: { "Job Title": jobTitle, "Company": company, "Pay": pay, "Location": location, "Job Type": jobType, "Schedule": schedule, "Description": description, "How to Apply": howToApply } });
      setJobTitle(""); setCompany(""); setPay(""); setLocation(""); setJobType("Part-time"); setSchedule(""); setDescription(""); setHowToApply("");
    } else if (tab === "news") {
      await onSubmitPost({ id: `n${Date.now()}`, type: "news", title: newsHeadline || "Community News", submittedAt: now(), status: "pending", flagged: false, details: { Category: newsCategory, Summary: newsDetails, Source: newsSource } });
      setNewsHeadline(""); setNewsCategory("Transit"); setNewsDetails(""); setNewsSource("");
    } else if (tab === "accommodation") {
      const suspicious = ["deposit before viewing", "e-transfer", "wire transfer", "send money", "keys by mail", "western union", "crypto", "gift card", "application fee", "viewing fee"].some(kw => [roomDetails, roomContact].join(" ").toLowerCase().includes(kw));
      await onSubmitPost({ id: `a${Date.now()}`, type: "accommodation", title: `${roomType} · ${roomArea || "Ottawa"}`, submittedAt: now(), status: "pending", flagged: suspicious, details: { Type: roomType, Price: roomPrice, Area: roomArea, Beds: roomType, Detail: roomDetails, Available: "Ask poster", Contact: roomContact } });
      setRoomType("Room Available"); setRoomPrice(""); setRoomArea(""); setRoomDetails(""); setRoomContact("");
    } else if (tab === "confession") {
      const unsafe = ["phone", "address", "full name", "kill", "dox", "instagram is", "snapchat is", "works at", "lives at"].some(kw => confessionText.toLowerCase().includes(kw));
      await onSubmitPost({ id: `c${Date.now()}`, type: "confession", title: "Anonymous Confession", submittedAt: now(), status: "pending", flagged: unsafe, details: { Category: confessionCategory, Text: confessionText } });
      setConfessionCategory("Transit"); setConfessionText("");
    } else if (tab === "resource") {
      await onSubmitPost({ id: `r${Date.now()}`, type: "resource", title: resourceName || "Community Resource", submittedAt: now(), status: "pending", flagged: false, details: { Category: resourceCategory, Description: resourceDescription, Contact: resourceContact } });
      setResourceName(""); setResourceCategory("Student Help"); setResourceDescription(""); setResourceContact("");
    }
    markSubmitted("och_submit_last_at");
    setSubmitStartedAt(Date.now());
    setDone(true);
    setTimeout(() => setDone(false), 5000);
    } catch {
      setSubmitError("Submission could not be saved right now. Please try again.");
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · Contribute" title="Submit a Post" sub="Share something useful with Ottawa. All posts are reviewed before going live." />

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Tab selector */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-8">
          {tabs.map(({ key, label, icon }) => (
            <button key={key} onClick={() => { setTab(key); setDone(false); setSubmitError(""); setSubmitTrap(""); setSubmitStartedAt(Date.now()); }}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border font-bold cursor-pointer transition-all text-xs ${tab === key ? "bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-lg" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
              {icon}
              <span className="text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-12 text-center">
            <CheckCircle size={40} className="text-emerald-500 mx-auto mb-4" />
            <h3 className="font-black text-emerald-800 text-xl mb-2" style={{ fontFamily: "Merriweather, serif" }}>
              {tab === "job" ? "Job Submitted for Review" : "Submitted Successfully"}
            </h3>
            {tab === "job" ? (
              <div className="text-sm text-emerald-600 leading-relaxed max-w-sm mx-auto">
                <p className="mb-4">Your job has been sent to admin review.</p>
                <div className="bg-white/60 border border-emerald-200 rounded-xl p-4 text-left flex flex-col gap-2">
                  {["Post is in the admin review queue", "Admin checks for quality and safety", "Once approved, it goes live instantly"].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-emerald-700 font-bold"><CheckCircle size={12} className="shrink-0" />{step}</div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-emerald-600">Thank you for contributing to the Ottawa community.</p>}
          </div>
        ) : (
          <form onSubmit={go} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <input
              type="text"
              name="website"
              value={submitTrap}
              onChange={e => setSubmitTrap(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            {/* Form header */}
            <div className="bg-[#f8f8f8] border-b border-gray-200 px-6 py-4 flex items-center gap-2">
              <div className="w-7 h-7 bg-[#1a1a1a] rounded-lg flex items-center justify-center text-white">
                {tabs.find(t => t.key === tab)?.icon}
              </div>
              <div>
                <p className="text-sm font-black text-[#1a1a1a]">{tabs.find(t => t.key === tab)?.label}</p>
                <p className="text-[11px] font-bold text-gray-400 font-mono">All fields marked * are required</p>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {submitError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"><AlertCircle size={13} className="text-red-500 shrink-0" /><p className="text-xs font-bold text-red-600">{submitError}</p></div>}
              {tab === "job" && (<>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                  <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs font-bold text-amber-700">Jobs go through admin review before appearing on the site. Scam-like postings will be rejected.</p>
                </div>
                <FF label="Job Title *" placeholder="e.g. Part-time Barista" value={jobTitle} onChange={setJobTitle} />
                <div className="grid grid-cols-2 gap-4">
                  <FF label="Company *" placeholder="e.g. Second Cup" value={company} onChange={setCompany} />
                  <FF label="Pay *" placeholder="e.g. $17/hr" value={pay} onChange={setPay} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FF label="Location *" placeholder="e.g. ByWard Market" value={location} onChange={setLocation} />
                  <FF label="Job Type" type="select" opts={["Part-time", "Full-time", "Student", "Co-op", "Flexible"]} value={jobType} onChange={setJobType} />
                </div>
                <FF label="Schedule" placeholder="e.g. Weekends + evenings, 20 hrs/week" value={schedule} onChange={setSchedule} />
                <FF label="Description *" type="textarea" placeholder="Describe the role, duties, and requirements..." value={description} onChange={setDescription} />
                <FF label="How to Apply *" placeholder="Email, website link, or walk-in instructions" value={howToApply} onChange={setHowToApply} />
              </>)}
              {tab === "news" && (<>
                <FF label="Headline *" placeholder="e.g. OC Transpo Route 12 schedule change" value={newsHeadline} onChange={setNewsHeadline} />
                <FF label="Category" type="select" opts={["Transit", "Students", "Events", "Alerts", "City", "Community"]} value={newsCategory} onChange={setNewsCategory} />
                <FF label="Story / Details *" type="textarea" placeholder="Describe the news story with as much detail as possible..." value={newsDetails} onChange={setNewsDetails} />
                <FF label="Source or Link (optional)" placeholder="https://..." value={newsSource} onChange={setNewsSource} />
              </>)}
              {tab === "accommodation" && (<>
                <FF label="Post Type" type="select" opts={["Room Available", "Looking for Room", "Need Roommate", "Sublet"]} value={roomType} onChange={setRoomType} />
                <div className="grid grid-cols-2 gap-4">
                  <FF label="Price / Budget *" placeholder="e.g. $950/mo" value={roomPrice} onChange={setRoomPrice} />
                  <FF label="Area *" placeholder="e.g. Sandy Hill" value={roomArea} onChange={setRoomArea} />
                </div>
                <FF label="Details *" type="textarea" placeholder="Describe the room, rules, utilities, availability date..." value={roomDetails} onChange={setRoomDetails} />
                <FF label="Contact (optional)" placeholder="Email or phone" value={roomContact} onChange={setRoomContact} />
              </>)}
              {tab === "confession" && (<>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-bold text-gray-500 leading-relaxed">
                  Confessions are 100% anonymous and reviewed before publishing. No hate speech, personal attacks, or identifying information.
                </div>
                <FF label="Category" type="select" opts={["Transit", "Neighbours", "Work", "School", "Gratitude", "General"]} value={confessionCategory} onChange={setConfessionCategory} />
                <FF label="Your Confession *" type="textarea" placeholder="Write your anonymous confession here..." rows={6} value={confessionText} onChange={setConfessionText} />
              </>)}
              {tab === "resource" && (<>
                <FF label="Resource Name *" placeholder="e.g. Ottawa Food Bank" value={resourceName} onChange={setResourceName} />
                <FF label="Category" type="select" opts={["Student Help", "Newcomer Help", "Housing Help", "Job Search", "Transit", "Emergency", "Health", "Other"]} value={resourceCategory} onChange={setResourceCategory} />
                <FF label="Description *" type="textarea" placeholder="What does this resource offer and who is it for?" value={resourceDescription} onChange={setResourceDescription} />
                <FF label="Website or Contact *" placeholder="https://... or phone number" value={resourceContact} onChange={setResourceContact} />
              </>)}

              <div className="pt-2">
                <BtnDark className="w-full flex items-center justify-center gap-2">
                  <Send size={14} />
                  {tab === "job" ? "Submit Job for Review" : "Submit"}
                </BtnDark>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── RESOURCES PAGE ───────────────────────────────────────────────────────────

function ResourcesPage({ navigate }: { navigate: (p: Page) => void }) {
  const cats = [
    { label: "Student Help", color: "blue" as const, icon: GraduationCap, items: [{ name: "uOttawa Student Academic Success", contact: "academic.success@uottawa.ca" }, { name: "Carleton Student Experience", contact: "sce@carleton.ca" }, { name: "OSAP Student Aid Ontario", contact: "ontario.ca/osap" }, { name: "Student Wellness Centre (uOttawa)", contact: "613-562-5200" }] },
    { label: "Newcomer Help", color: "green" as const, icon: Heart, items: [{ name: "ACCES Employment Ottawa", contact: "accesemployment.ca" }, { name: "Catholic Centre for Immigrants", contact: "613-232-9634" }, { name: "Ottawa Community Immigrant Services", contact: "ociso.org" }, { name: "Settlement.org (Province)", contact: "settlement.org" }] },
    { label: "Housing Help", color: "orange" as const, icon: Home, items: [{ name: "Ottawa Community Housing", contact: "613-731-1182" }, { name: "Centretown CHC Housing Support", contact: "613-233-4443" }, { name: "Canada Mortgage & Housing Corp.", contact: "cmhc-schl.gc.ca" }, { name: "Salvation Army Ottawa – Shelter", contact: "613-241-1573" }] },
    { label: "Job Search", color: "orange" as const, icon: Briefcase, items: [{ name: "Ottawa Employment & Social Services", contact: "613-580-2424" }, { name: "Job Bank (Government of Canada)", contact: "jobbank.gc.ca" }, { name: "Hire Ottawa", contact: "hireottawa.ca" }, { name: "Indeed Canada", contact: "ca.indeed.com" }] },
    { label: "Transit Help", color: "blue" as const, icon: Bus, items: [{ name: "OC Transpo Customer Service", contact: "613-741-4390" }, { name: "OC Transpo Trip Planner", contact: "octranspo.com" }, { name: "Para Transpo (Accessibility)", contact: "613-244-7272" }, { name: "Rideau Transit O-Train", contact: "octranspo.com/o-train" }] },
    { label: "Emergency Contacts", color: "red" as const, icon: Phone, items: [{ name: "Emergency (Police / Fire / EMS)", contact: "911" }, { name: "Ottawa Police (Non-Emergency)", contact: "613-236-1222" }, { name: "Crisis Line (24/7)", contact: "613-722-6914" }, { name: "Distress Centre Ottawa", contact: "613-238-3311" }] },
  ];

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · Help & Support" title="Community Resources" sub="Trusted local services, contacts, and guides for Ottawa residents, students, and newcomers." />

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Quick contact strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {[{ label: "Emergency", val: "911", color: "bg-red-600 text-white" }, { label: "Ottawa Police", val: "613-236-1222", color: "bg-gray-800 text-white" }, { label: "Crisis Line 24/7", val: "613-722-6914", color: "bg-blue-600 text-white" }, { label: "OC Transpo", val: "613-741-4390", color: "bg-emerald-600 text-white" }].map(({ label, val, color }) => (
            <div key={label} className={`${color} rounded-xl px-4 py-4 text-center`}>
              <p className="text-[11px] font-bold font-mono uppercase tracking-widest opacity-70 mb-1">{label}</p>
              <p className="text-lg font-black">{val}</p>
            </div>
          ))}
        </div>

        {/* Resource cards */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {cats.map(({ label, color, icon: Icon, items }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="px-5 py-4 border-b border-gray-100 bg-[#f8f8f8] flex items-center gap-3">
                <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center"><Icon size={15} className="text-gray-500" /></div>
                <Tag color={color}>{label}</Tag>
              </div>
              <div className="p-5 flex flex-col gap-4">
                {items.map(({ name, contact }) => (
                  <div key={name} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#1a1a1a] leading-snug mb-0.5">{name}</p>
                      <p className="text-xs font-bold text-gray-400 font-mono">{contact}</p>
                    </div>
                    <ArrowRight size={13} className="text-gray-300 mt-0.5 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Suggest resource */}
        <div className="mt-10 bg-[#1a1a1a] rounded-2xl p-7 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold font-mono uppercase tracking-widest text-white/40 mb-2">Help us improve</p>
            <h3 className="text-lg font-black text-white mb-1" style={{ fontFamily: "Merriweather, serif" }}>Know a resource we should add?</h3>
            <p className="text-sm text-white/50 leading-relaxed">Help us keep this list accurate and useful for every Ottawa resident.</p>
          </div>
          <BtnWhiteHero onClick={() => navigate("submit")}>Suggest a Resource</BtnWhiteHero>
        </div>
      </div>
    </div>
  );
}

// ─── CONTACT PAGE ─────────────────────────────────────────────────────────────

function ContactPage({ onSubmitPost }: { onSubmitPost: (post: ReviewPost) => Promise<void> | void }) {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General Inquiry");
  const [message, setMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactTrap, setContactTrap] = useState("");
  const [contactStartedAt, setContactStartedAt] = useState(Date.now());
  const now = () => { const d = new Date(); return `${d.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}`; };
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError("");
    const spamMessage = shouldBlockSpam(contactTrap, contactStartedAt, "och_contact_last_at");
    if (spamMessage) {
      setContactError(spamMessage);
      return;
    }
    const validationError =
      firstMissing([["Name", name], ["Email", email], ["Message", message]]) ||
      (!isEmail(email) ? "Please enter a valid email address." : "") ||
      tooShort("Message", message, 20) ||
      tooLong("Name", name, 80) ||
      tooLong("Email", email, 120) ||
      tooLong("Message", message, 1200);
    if (validationError) {
      setContactError(validationError);
      return;
    }
    try {
      await onSubmitPost({
        id: `m${Date.now()}`,
        type: "contact",
        title: subject || "Contact Message",
        submittedAt: now(),
        status: "pending",
        flagged: subject === "Scam Report" || subject === "Report Content",
        details: { Name: name, Email: email, Subject: subject, Message: message },
      });
      setName(""); setEmail(""); setSubject("General Inquiry"); setMessage("");
      setContactTrap("");
      markSubmitted("och_contact_last_at");
      setContactStartedAt(Date.now());
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch {
      setContactError("Message could not be saved right now. Please try again.");
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Ottawa Community Hub · Contact" title="Get in Touch" sub="Questions, content reports, partnership inquiries, or feature suggestions — we'd love to hear from you." />

      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-5 gap-8">
          {/* Form — wider */}
          <div className="md:col-span-3">
            <p className="text-[11px] font-bold font-mono uppercase tracking-widest text-gray-400 mb-4">Send a Message</p>
            {sent ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-12 text-center">
                <CheckCircle size={36} className="text-emerald-500 mx-auto mb-4" />
                <h3 className="font-black text-emerald-800 text-lg mb-1" style={{ fontFamily: "Merriweather, serif" }}>Message Sent!</h3>
                <p className="text-sm text-emerald-600">We'll get back to you as soon as possible.</p>
              </div>
            ) : (
              <form onSubmit={go} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <input
                  type="text"
                  name="company"
                  value={contactTrap}
                  onChange={e => setContactTrap(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />
                <div className="p-6 flex flex-col gap-5">
                  {contactError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"><AlertCircle size={13} className="text-red-500 shrink-0" /><p className="text-xs font-bold text-red-600">{contactError}</p></div>}
                  <div className="grid grid-cols-2 gap-4">
                    <FF label="Your Name *" placeholder="Jane Smith" value={name} onChange={setName} />
                    <FF label="Email Address *" placeholder="you@example.com" value={email} onChange={setEmail} />
                  </div>
                  <FF label="Subject" type="select" opts={["General Inquiry", "Report Content", "Partnership", "Suggest Feature", "Scam Report", "Other"]} value={subject} onChange={setSubject} />
                  <FF label="Message *" type="textarea" placeholder="Write your message here..." rows={6} value={message} onChange={setMessage} />
                  <BtnDark className="w-full flex items-center justify-center gap-2"><Send size={14} /> Send Message</BtnDark>
                </div>
              </form>
            )}
          </div>

          {/* Info sidebar */}
          <div className="md:col-span-2 flex flex-col gap-4">
            {/* Instagram */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="bg-gradient-to-br from-purple-600 via-pink-500 to-amber-400 px-5 py-5">
                <Instagram size={22} className="text-white mb-2" />
                <p className="text-[11px] font-bold text-white/70 font-mono uppercase tracking-widest mb-1">Follow us</p>
                <p className="text-xl font-black text-white">@ottawa._.yow</p>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 leading-relaxed mb-4 font-medium">Daily Ottawa updates, room listings, job posts, and community news — all on Instagram.</p>
                <a href="https://www.instagram.com/ottawa._.yow" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#1a1a1a] text-white px-4 py-2.5 rounded-lg text-sm font-black hover:bg-[#333] transition-colors">
                  <Instagram size={14} /> Follow @ottawa._.yow
                </a>
              </div>
            </div>

            {/* About */}
            <div className="bg-[#f8f8f8] border border-gray-200 rounded-2xl p-5">
              <p className="text-[11px] font-bold font-mono uppercase tracking-widest text-gray-400 mb-3">About This Platform</p>
              <h3 className="text-sm font-black text-[#1a1a1a] mb-2" style={{ fontFamily: "Merriweather, serif" }}>Ottawa Community Hub</h3>
              <p className="text-xs text-gray-500 leading-relaxed">An independent, community-run platform for Ottawa students, newcomers, renters, and residents. Powered by Ottawa Confession.</p>
            </div>

            {/* Rules */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-[11px] font-bold font-mono uppercase tracking-widest text-gray-400 mb-3">Community Rules</p>
              {["Be respectful and kind to all.", "No spam, ads, or self-promotion.", "Do not share private information.", "Report scams to protect others.", "Posts are moderated by volunteers."].map(r => (
                <div key={r} className="flex items-start gap-2 mb-2.5">
                  <CheckCircle size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500 font-medium">{r}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────

function Footer({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <footer className="bg-[#111] text-white pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 bg-white rounded flex items-center justify-center"><span className="text-[#111] text-xs font-black font-mono">OCH</span></div>
              <span className="text-sm font-black" style={{ fontFamily: "Merriweather, serif" }}>Ottawa Community Hub</span>
            </div>
            <p className="text-xs font-medium text-gray-400 leading-relaxed mb-3">Ottawa news, rooms, jobs, and community updates in one place.</p>
            <p className="text-[11px] font-bold text-gray-600 font-mono">Powered by Ottawa Confession</p>
          </div>
          <div>
            <p className="text-[11px] font-black font-mono uppercase tracking-widest text-gray-600 mb-4">Platform</p>
            {(["news", "accommodation", "jobs", "resources"] as Page[]).map(p => (
              <button key={p} onClick={() => navigate(p)} className="block text-xs font-bold text-gray-400 hover:text-white mb-2.5 cursor-pointer transition-colors capitalize text-left">{p}</button>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-black font-mono uppercase tracking-widest text-gray-600 mb-4">Community</p>
            {[{ l: "Confessions", p: "confessions" as Page }, { l: "Submit a Post", p: "submit" as Page }, { l: "Contact Us", p: "contact" as Page }].map(({ l, p }) => (
              <button key={l} onClick={() => navigate(p)} className="block text-xs font-bold text-gray-400 hover:text-white mb-2.5 cursor-pointer transition-colors text-left">{l}</button>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-black font-mono uppercase tracking-widest text-gray-600 mb-4">Safety</p>
            {["Community Rules", "Privacy Policy", "Scam Alerts", "Report Content"].map(r => (
              <p key={r} className="text-xs font-bold text-gray-400 hover:text-white mb-2.5 cursor-pointer transition-colors">{r}</p>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-black font-mono uppercase tracking-widest text-gray-600 mb-4">Follow Us</p>
            <a href="https://www.instagram.com/ottawa._.yow" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors mb-3"><Instagram size={13} /> @ottawa._.yow</a>
            <p className="text-xs font-medium text-gray-600 leading-relaxed">Daily Ottawa updates on Instagram.</p>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs font-bold text-gray-700">© 2025 Ottawa Community Hub. Community-run, Ottawa-focused.</p>
          <p className="text-xs font-bold text-gray-700 font-mono">Not affiliated with the City of Ottawa.</p>
        </div>
      </div>
    </footer>
  );
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────

function AdminLogin({ onLogin, onClose }: { onLogin: (token: string) => void; onClose: () => void }) {
  const [user, setUser] = useState(""); const [pass, setPass] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!HAS_SUPABASE) {
      setError("Secure backend is not configured yet.");
      return;
    }
    setLoading(true);
    try {
      const token = await signInAdmin(user.trim(), pass);
      onLogin(token);
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-[#f4f4f5] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#1a1a1a] rounded-xl flex items-center justify-center mx-auto mb-4"><Lock size={20} className="text-white" /></div>
          <h1 className="text-xl font-black text-[#1a1a1a] mb-1" style={{ fontFamily: "Merriweather, serif" }}>Admin Portal</h1>
          <p className="text-xs font-bold text-gray-400 font-mono">Ottawa Community Hub · Staff Only</p>
        </div>
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black text-gray-500 font-mono uppercase tracking-wider">Email</label>
            <input type="email" value={user} onChange={e => setUser(e.target.value)} placeholder="admin@example.com" autoComplete="username" className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-[#f6f6f7] focus:outline-none focus:border-gray-400 focus:bg-white transition-colors font-medium" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black text-gray-500 font-mono uppercase tracking-wider">Password</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Enter password" autoComplete="current-password" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-[#f6f6f7] focus:outline-none focus:border-gray-400 focus:bg-white transition-colors font-medium" />
          </div>
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"><AlertCircle size={13} className="text-red-500 shrink-0" /><p className="text-xs font-bold text-red-600">{error}</p></div>}
          <button type="submit" disabled={loading} className="bg-[#1a1a1a] text-white py-2.5 rounded-lg text-sm font-black hover:bg-[#333] transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <button onClick={onClose} className="block mx-auto mt-4 text-xs font-bold text-gray-400 hover:text-gray-600 cursor-pointer">Back to site</button>
        <p className="text-center text-xs font-bold text-gray-400 mt-5">Unauthorized access is prohibited.</p>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

function AdminDashboard({ posts, onDecide, onLogout }: { posts: ReviewPost[]; onDecide: (id: string, status: "approved" | "rejected") => Promise<void> | void; onLogout: () => void }) {
  const [view, setView] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<PostCategory | "all">("all");
  const [selected, setSelected] = useState<ReviewPost | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const decide = async (id: string, status: "approved" | "rejected") => { await onDecide(id, status); setSelected(null); showToast(status === "approved" ? "Post approved - now live on the site." : "Post rejected and removed."); };

  const filtered = posts.filter(p => (view === "all" || p.status === view) && (typeFilter === "all" || p.type === typeFilter));
  const counts = { pending: posts.filter(p => p.status === "pending").length, approved: posts.filter(p => p.status === "approved").length, rejected: posts.filter(p => p.status === "rejected").length, flagged: posts.filter(p => p.flagged && p.status === "pending").length };
  const typeLabel: Record<PostCategory, string> = { job: "Job", accommodation: "Room", news: "News", confession: "Confession", resource: "Resource", contact: "Contact" };
  const typeColor: Record<PostCategory, "blue" | "green" | "orange" | "gray"> = { job: "orange", accommodation: "green", news: "blue", confession: "gray", resource: "green", contact: "blue" };

  useEffect(() => { if (selected) { const u = posts.find(p => p.id === selected.id); if (u) setSelected(u); } }, [posts]);

  return (
    <div className="min-h-screen bg-[#f4f4f5] flex flex-col">
      <header className="bg-[#1a1a1a] text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center overflow-hidden"><img src={logo} alt="Ottawa Confession logo" className="h-full w-full" /></div>
          <span className="text-sm font-black" style={{ fontFamily: "Merriweather, serif" }}>Ottawa Confession</span>
          <span className="text-gray-600 text-xs font-bold font-mono hidden sm:inline">/ Admin Panel</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center"><span className="text-xs font-black text-white">A</span></div><span className="text-xs font-bold text-gray-300 hidden sm:inline">Admin</span></div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer border border-gray-700 hover:border-gray-500 px-2.5 py-1.5 rounded"><LogOut size={12} /> Sign out</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 bg-white border-r border-gray-200 hidden md:flex flex-col py-6 shrink-0">
          <nav className="flex flex-col gap-0.5 px-3">
            <p className="text-[10px] font-black font-mono uppercase tracking-widest text-gray-400 px-2 mb-2">Dashboard</p>
            {([{ key: "pending", label: "Pending Review", icon: Inbox, count: counts.pending }, { key: "approved", label: "Approved", icon: BadgeCheck, count: counts.approved }, { key: "rejected", label: "Rejected", icon: Ban, count: counts.rejected }, { key: "all", label: "All Posts", icon: LayoutDashboard, count: posts.length }] as const).map(({ key, label, icon: Icon, count }) => (
              <button key={key} onClick={() => setView(key)} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors text-left font-bold ${view === key ? "bg-[#1a1a1a] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                <span className="flex items-center gap-2"><Icon size={14} />{label}</span>
                <span className={`text-[11px] font-black font-mono px-1.5 py-0.5 rounded ${view === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{count}</span>
              </button>
            ))}
            {counts.flagged > 0 && (<><div className="my-3 border-t border-gray-100" /><p className="text-[10px] font-black font-mono uppercase tracking-widest text-gray-400 px-2 mb-2">Alerts</p><div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg"><AlertTriangle size={13} className="text-red-500 shrink-0" /><span className="text-xs font-black text-red-600">{counts.flagged} flagged</span></div></>)}
          </nav>
        </aside>

        <main className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[{ label: "Pending", value: counts.pending, sub: "awaiting review", color: "text-amber-600", border: "border-amber-200 bg-amber-50" }, { label: "Approved", value: counts.approved, sub: "live on site", color: "text-emerald-600", border: "border-emerald-200 bg-emerald-50" }, { label: "Rejected", value: counts.rejected, sub: "removed", color: "text-red-600", border: "border-red-200 bg-red-50" }, { label: "Flagged", value: counts.flagged, sub: "need attention", color: "text-red-700", border: "border-red-300 bg-red-100" }].map(({ label, value, sub, color, border }) => (
              <div key={label} className={`bg-white border rounded-xl px-5 py-4 ${border}`}>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs font-black text-gray-700">{label}</p>
                <p className="text-[11px] font-bold text-gray-400 font-mono">{sub}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <p className="text-sm font-black text-[#1a1a1a]" style={{ fontFamily: "Merriweather, serif" }}>
              {view === "pending" ? "Posts Awaiting Review" : view === "approved" ? "Approved Posts" : view === "rejected" ? "Rejected Posts" : "All Submissions"}
              <span className="text-gray-400 font-bold text-xs ml-2 font-mono">({filtered.length})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(["all", "job", "accommodation", "news", "confession", "resource", "contact"] as const).map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1 text-xs rounded border cursor-pointer transition-colors font-black ${typeFilter === t ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                  {t === "all" ? "All Types" : typeLabel[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {filtered.length === 0 && <div className="bg-white border border-gray-200 rounded-xl py-16 text-center"><Inbox size={28} className="text-gray-300 mx-auto mb-3" /><p className="text-sm font-bold text-gray-400">No posts in this category.</p></div>}
            {filtered.map(post => (
              <div key={post.id} onClick={() => setSelected(post)} className={`bg-white border rounded-xl px-5 py-4 cursor-pointer hover:shadow-sm transition-all flex items-start gap-4 ${post.flagged && post.status === "pending" ? "border-red-200 bg-red-50/40" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="shrink-0 mt-0.5"><Tag color={typeColor[post.type]}>{typeLabel[post.type]}</Tag></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-black text-[#1a1a1a] truncate" style={{ fontFamily: "Merriweather, serif" }}>{post.title}</p>
                    {post.flagged && <span className="flex items-center gap-1 text-[10px] font-black font-mono text-red-600 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded"><AlertTriangle size={9} /> FLAGGED</span>}
                  </div>
                  <p className="text-xs font-bold text-gray-400 font-mono">Submitted: {post.submittedAt}</p>
                  {Object.entries(post.details).slice(0, 2).map(([k, v]) => v && <p key={k} className="text-xs text-gray-500 font-medium mt-0.5"><span className="text-gray-400 font-bold">{k}:</span> {v}</p>)}
                </div>
                <div className="shrink-0"><StatusBadge status={post.status} /></div>
                <ChevronRight size={15} className="text-gray-300 shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </main>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 ${selected.flagged ? "bg-red-50" : "bg-gray-50"}`}>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Tag color={typeColor[selected.type]}>{typeLabel[selected.type]}</Tag>
                  {selected.flagged && <span className="flex items-center gap-1 text-[10px] font-black font-mono text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded"><AlertTriangle size={9} /> FLAGGED — Possible scam or violation</span>}
                </div>
                <h3 className="text-sm font-black text-[#1a1a1a] leading-snug" style={{ fontFamily: "Merriweather, serif" }}>{selected.title}</h3>
                <p className="text-[11px] font-bold text-gray-400 font-mono mt-1">ID: {selected.id} · {selected.submittedAt}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer shrink-0 mt-0.5"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 max-h-72 overflow-y-auto">
              <p className="text-[11px] font-black font-mono uppercase tracking-widest text-gray-400 mb-3">Submission Details</p>
              <div className="flex flex-col gap-3">
                {Object.entries(selected.details).map(([k, v]) => v && <div key={k} className="flex flex-col gap-0.5"><p className="text-[11px] font-black text-gray-400 font-mono uppercase tracking-wide">{k}</p><p className="text-sm font-medium text-[#1a1a1a] leading-relaxed">{v}</p></div>)}
              </div>
            </div>
            {selected.status !== "pending" && (
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
                <p className="text-xs font-bold text-gray-500">Status:</p><StatusBadge status={selected.status} />
                {selected.status === "approved" && <span className="text-xs font-black text-emerald-600 font-mono ml-1">- Live on site</span>}
              </div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 bg-white flex gap-3">
              <button onClick={() => decide(selected.id, "approved")} disabled={selected.status === "approved"} className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-black hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"><CheckSquare size={15} /> Approve & Publish</button>
              <button onClick={() => decide(selected.id, "rejected")} disabled={selected.status === "rejected"} className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg text-sm font-black hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"><XSquare size={15} /> Reject & Remove</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 bg-[#1a1a1a] text-white text-sm px-5 py-3 rounded-xl shadow-xl font-bold z-50 flex items-center gap-2"><CheckCircle size={15} className="text-emerald-400" />{toast}</div>}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [scrolled, setScrolled] = useState(false);
  const [adminMode, setAdminMode] = useState<"off" | "login" | "dashboard">("off");
  const [adminToken, setAdminToken] = useState("");
  const [posts, setPosts] = useState<ReviewPost[]>(() => {
    try {
      const saved = localStorage.getItem("och_posts_v2");
      return saved ? JSON.parse(saved) : INITIAL_QUEUE;
    } catch {
      return INITIAL_QUEUE;
    }
  });
  const approvedJobs = posts.filter(p => p.type === "job" && p.status === "approved");
  const approvedNews = posts.filter(p => p.type === "news" && p.status === "approved");
  const approvedAccommodation = posts.filter(p => p.type === "accommodation" && p.status === "approved");
  const approvedConfessions = posts.filter(p => p.type === "confession" && p.status === "approved");

  useEffect(() => {
    if (HAS_SUPABASE) return;
    try { localStorage.setItem("och_posts_v2", JSON.stringify(posts)); } catch {}
  }, [posts]);

  const refreshPosts = useCallback(async (token?: string) => {
    if (!HAS_SUPABASE) return;
    const nextPosts = await fetchPosts({ adminToken: token });
    setPosts(nextPosts);
  }, []);

  useEffect(() => {
    void refreshPosts();
  }, [refreshPosts]);

  const handleSubmitPost = useCallback(async (post: ReviewPost) => {
    if (HAS_SUPABASE) {
      await createPost(post);
      if (adminToken) await refreshPosts(adminToken);
      return;
    }
    setPosts(prev => [post, ...prev]);
  }, [adminToken, refreshPosts]);

  const handleDecide = useCallback(async (id: string, status: "approved" | "rejected") => {
    if (HAS_SUPABASE && adminToken) {
      await updatePostStatus(id, status, adminToken);
    }
    setPosts(prev => prev.map(post => post.id === id ? { ...post, status } : post));
  }, [adminToken]);

  const closeAdmin = useCallback(() => {
    setAdminMode("off");
    setAdminToken("");
    if (window.location.hash === "#admin") window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void refreshPosts();
  }, [refreshPosts]);

  const openAdmin = useCallback(() => {
    setAdminMode(adminToken ? "dashboard" : "login");
    if (window.location.hash !== "#admin") window.location.hash = "admin";
  }, [adminToken]);

  useEffect(() => {
    const check = () => { if (window.location.hash === "#admin") setAdminMode(adminToken ? "dashboard" : "login"); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [adminToken]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (adminMode !== "dashboard" || !adminToken) return;
    let timer = window.setTimeout(closeAdmin, ADMIN_IDLE_TIMEOUT_MS);
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(closeAdmin, ADMIN_IDLE_TIMEOUT_MS);
    };
    const events = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [adminMode, adminToken, closeAdmin]);

  if (adminMode === "login" && !adminToken) {
    return <AdminLogin onClose={closeAdmin} onLogin={async token => { setAdminToken(token); setAdminMode("dashboard"); await refreshPosts(token); }} />;
  }

  if (adminMode === "dashboard" && adminToken) {
    return <AdminDashboard posts={posts} onDecide={handleDecide} onLogout={closeAdmin} />;
  }

  const navigate = (p: Page) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const isHeroPage = page === "home";
  const transparent = isHeroPage && !scrolled;

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className={isHeroPage ? "absolute top-0 left-0 right-0 z-50" : ""}>
        <Navbar current={page} navigate={navigate} transparent={transparent} />
      </div>
      <main className="flex-1">
        {page === "home" && <HomePage navigate={navigate} approvedJobs={approvedJobs} approvedAccommodation={approvedAccommodation} approvedConfessions={approvedConfessions} />}
        {page === "news" && <NewsPage approvedNews={approvedNews} />}
        {page === "accommodation" && <AccommodationPage navigate={navigate} approvedAccommodation={approvedAccommodation} />}
        {page === "jobs" && <JobsPage navigate={navigate} approvedJobs={approvedJobs} />}
        {page === "confessions" && <ConfessionsPage navigate={navigate} approvedConfessions={approvedConfessions} />}
        {page === "submit" && <SubmitPage onSubmitPost={handleSubmitPost} />}
        {page === "resources" && <ResourcesPage navigate={navigate} />}
        {page === "contact" && <ContactPage onSubmitPost={handleSubmitPost} />}
      </main>
      <button onClick={openAdmin} className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full bg-[#1a1a1a] px-4 py-3 text-xs font-black text-white shadow-xl hover:bg-[#333] md:right-6 md:bottom-6">
        <Lock size={14} />
        Staff
      </button>
      <Footer navigate={navigate} />
    </div>
  );
}
