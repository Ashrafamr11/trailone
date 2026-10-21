"use client";

import {
    Activity, ArrowLeft, BookOpen,
    BrainCircuit,
    ChevronDown,
    ClipboardCheck, Clock3,
    FlaskConical,
    Info,
    MessageCircle,
    RefreshCw, ShieldAlert,
    Stethoscope, Target,
    type LucideIcon
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type BookReference = { page: number | null; ocr_review: boolean; clinical_validation: string };
type Criterion = {
  criterion_id: string;
  description: string;
  status: string;
  score: number | null;
  max_score: number;
  evidence?: string[];
  feedback?: string;
  book_references?: BookReference[];
  missing_item_ids?: string[];
};
type Domain = {
  domain_id: string;
  name: string;
  status: string;
  score: number | null;
  max_score: number;
  evaluated_max_score: number;
  criteria: Criterion[];
};
type Report = {
  session_id: string;
  case_id: string;
  report_status: string;
  overall_score: number | null;
  overall_max_score: number;
  evaluated_score: number;
  evaluated_max_score: number;
  warnings?: string[];
  domains: Domain[];
};

const domainMeta: Record<string, { icon: LucideIcon; hint: string }> = {
  communication: { icon: MessageCircle, hint: "How you interacted with the caregiver" },
  history: { icon: ClipboardCheck, hint: "Questions asked to understand the case" },
  physical_examination: { icon: Stethoscope, hint: "Examinations you selected" },
  investigations: { icon: FlaskConical, hint: "Tests and imaging you requested" },
  clinical_reasoning: { icon: BrainCircuit, hint: "Your diagnosis and clinical justification" },
};

const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
const percentage = (score: number, max: number) => max > 0 ? Math.max(0, Math.min(100, score / max * 100)) : 0;
const card = "rounded-3xl border border-white/[.11] bg-white/[.055] shadow-[0_12px_45px_rgba(0,0,0,.12)]";

function Meter({ value, max, size = "normal" }: { value: number; max: number; size?: "small" | "normal" }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`w-full overflow-hidden rounded-full bg-white/10 ${size === "small" ? "h-1.5" : "h-2.5"}`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#3fbaae] to-[#9ef4d9] transition-[width] duration-700"
        style={{ width: `${percentage(value, max)}%` }}
      />
    </div>
  );
}

function CriterionStatus({ criterion }: { criterion: Criterion }) {
  const state = criterion.status;
  const name = state === "complete" ? "Completed" : state === "partial" ? "Partially met" : state === "missing" ? "Not demonstrated" : "Not evaluated";
  const css = state === "complete" ? "bg-emerald-300/10 text-emerald-200" : state === "partial" ? "bg-sky-300/10 text-sky-200" : state === "missing" ? "bg-white/10 text-white/65" : "bg-amber-200/10 text-amber-200";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${css}`}>{name}</span>;
}

export default function EvaluationReportPage() {
  const params = useParams();
  const sessionId = String(params.sessionId ?? "");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    if (!sessionId) { setLoading(false); setError("Missing session ID."); return; }
    const controller = new AbortController();
    async function fetchReport() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API}/api/sessions/${encodeURIComponent(sessionId)}/evaluation`, { signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.detail === "string" ? body.detail : `Could not load report (HTTP ${response.status})`);
        }
        const payload = (await response.json()) as Report;
        if (!controller.signal.aborted) setReport(payload);
      } catch (err) {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(err instanceof Error ? err.message : "Unable to load report");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void fetchReport();
    return () => controller.abort();
  }, [sessionId, retry]);

  const stats = useMemo(() => {
    if (!report) return { pending: 0, assessed: 0, total: 0, awarded: 0 };
    const items = report.domains.flatMap(d => d.criteria);
    return {
      pending: items.filter(c => c.score === null).length,
      assessed: items.filter(c => c.score !== null).length,
      total: items.length,
      awarded: report.evaluated_score,
    };
  }, [report]);

  return (
    <main className="min-h-screen bg-[#071e29] text-[#e8f7f5] selection:bg-[#79dcd0]/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(ellipse_at_top,rgba(31,132,131,.23),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/cases" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#bae9e3] transition hover:bg-white/10"><ArrowLeft size={16} /> Back to cases</a>
          <span className="flex items-center gap-2 text-xs text-white/55"><Activity size={15} className="text-[#85e4d7]" /> MedTwin AI · Clinical Training</span>
        </div>

        <header className="mb-7 mt-10">
          <p className="text-xs font-semibold uppercase tracking-[.23em] text-[#7fdbcf]">YOUR PERFORMANCE</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Clinical Performance Report</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">A breakdown of your clinical decisions, supporting evidence, and areas to improve.</p>
        </header>

        {loading && (
          <div className={`${card} flex min-h-56 flex-col items-center justify-center gap-4 p-8`} role="status">
            <RefreshCw className="animate-spin text-[#8fe9de]" size={26} />
            <p className="font-medium">Preparing your evaluation…</p>
            <p className="text-center text-xs text-white/50">AI evaluation can take a little longer than rule-based scoring.</p>
          </div>
        )}
        {error && !loading && (
          <div role="alert" className={`${card} p-6`}>
            <div className="flex items-center gap-3 text-amber-200"><ShieldAlert size={22} /><h2 className="font-semibold">Report unavailable</h2></div>
            <p className="mt-3 text-sm text-white/70">{error}</p>
            <p className="mt-2 text-xs text-white/50">Complete a session first. For the local demo, keep the backend running with DEBUG_SESSION_LOGS=true.</p>
            <button onClick={() => setRetry(x => x + 1)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#8be3d7] px-4 py-2.5 text-sm font-semibold text-[#092b34]"><RefreshCw size={15} /> Try again</button>
          </div>
        )}

        {report && !loading && !error && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
              <div className={`${card} p-6 sm:p-8`}>
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                  <div className="relative mx-auto flex h-40 w-40 shrink-0 items-center justify-center rounded-full sm:mx-0" style={{ background: `conic-gradient(#7bdacb ${percentage(report.evaluated_score, report.overall_max_score)}%, rgba(255,255,255,.10) 0)` }}>
                    <div className="flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full bg-[#0b2b35] text-center">
                      <span className="text-4xl font-semibold tracking-tight">{number(report.evaluated_score)}</span>
                      <span className="mt-1 text-xs text-white/60">of {number(report.overall_max_score)} pts</span>
                      <span className="mt-1 text-[10px] text-[#8ce6d9]">awarded so far</span>
                    </div>
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <div className="mb-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                      <span className="rounded-full bg-[#8be3d7]/10 px-3 py-1.5 text-xs font-semibold text-[#a3f2e6]">{report.overall_score === null ? "Final score pending" : "Evaluation complete · provisional"}</span>
                    </div>
                    <h2 className="text-xl font-semibold">{report.overall_score === null ? "Your assessment is in progress" : `${number(report.overall_score)} / ${number(report.overall_max_score)} points`}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-white/60">{report.overall_score === null ? "The chart shows points awarded so far, not your final percentage. Unassessed criteria are not counted as zero." : "All criteria have been assessed. Scores remain educational and subject to clinical validation."}</p>
                    <div className="mt-4"><Meter value={report.evaluated_max_score} max={report.overall_max_score} /></div>
                    <p className="mt-2 text-xs text-white/55">Assessment coverage: {number(report.evaluated_max_score)} / {number(report.overall_max_score)} possible points reviewed</p>
                  </div>
                </div>
              </div>
              <div className={`${card} flex flex-col justify-center p-6 sm:p-7`}>
                <p className="text-sm font-medium text-white/60">Evaluation progress</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/5 p-4"><p className="text-3xl font-semibold">{stats.assessed}<span className="text-lg text-white/40">/{stats.total}</span></p><p className="mt-1 text-xs text-white/55">Criteria assessed</p></div>
                  <div className="rounded-2xl bg-white/5 p-4"><p className="text-3xl font-semibold">{stats.pending}</p><p className="mt-1 text-xs text-white/55">Still pending</p></div>
                </div>
                <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-white/55"><Info className="mt-0.5 shrink-0 text-[#8ce6d9]" size={15} /><span>Results are from a training simulation, not a formal clinical certification.</span></div>
              </div>
            </section>

            <section className="mt-9">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-widest text-[#85ded3]">PERFORMANCE BREAKDOWN</p><h2 className="mt-1 text-xl font-semibold">Your five assessment areas</h2></div>
                <button onClick={() => setDetails(v => !v)} className="rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-white/75 hover:bg-white/10">{details ? "Collapse all details" : "Expand all details"}</button>
              </div>
              <div className="space-y-4">
                {report.domains.map(domain => {
                  const Icon = domainMeta[domain.domain_id]?.icon ?? Target;
                  const isPending = domain.score === null;
                  const pending = domain.criteria.filter(c => c.score === null).length;
                  return (
                    <section key={domain.domain_id} className={`${card} overflow-hidden`}>
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#85e5d5]/10 text-[#92e6da]"><Icon size={22}/></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold sm:text-lg">{domain.name}</h3><span className="text-lg font-semibold tabular-nums">{isPending ? "Pending" : number(domain.score!)}<span className="ml-1 text-sm font-normal text-white/45">/ {number(domain.max_score)}</span></span></div>
                            <p className="mt-1 text-xs text-white/50">{domainMeta[domain.domain_id]?.hint || "Clinical assessment"}</p>
                            <div className="mt-4"><Meter value={domain.score ?? 0} max={domain.max_score}/></div>
                            <p className="mt-2 text-xs text-white/55">{pending ? `${pending} criterion${pending !== 1 ? "s" : ""} pending · ` : ""}{number(domain.evaluated_max_score)} of {number(domain.max_score)} points assessable so far</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-white/10 bg-black/[.07] px-4 py-2 sm:px-6">
                        {domain.criteria.map(criterion => (
                          <details key={criterion.criterion_id} open={details || undefined} className="group border-b border-white/[.07] py-3 last:border-b-0">
                            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg p-2 hover:bg-white/[.035] [&::-webkit-details-marker]:hidden">
                              <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-[#94e9df]">{criterion.criterion_id}</span><span className="text-sm leading-6 text-white/85">{criterion.description}</span></div>
                              <div className="flex shrink-0 items-center gap-2"><span className="text-xs font-semibold tabular-nums text-white/75">{criterion.score === null ? "—" : number(criterion.score)}/{number(criterion.max_score)}</span><ChevronDown size={15} className="text-white/50 transition-transform group-open:rotate-180"/></div>
                            </summary>
                            <div className="space-y-4 px-2 pb-3 pt-2 sm:pl-[57px]">
                              <div className="flex flex-wrap items-center gap-3"><CriterionStatus criterion={criterion} /><div className="max-w-44 flex-1"><Meter value={criterion.score ?? 0} max={criterion.max_score} size="small"/></div></div>
                              {criterion.feedback && <p className="text-sm leading-6 text-white/65">{criterion.feedback}</p>}
                              {!!criterion.evidence?.length && <div><p className="mb-2 text-xs font-semibold text-[#a3e9df]">Recorded evidence</p><ul className="space-y-2">{criterion.evidence.map((entry, index) => <li key={index} dir="auto" className="rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-sm leading-6 text-white/75">{entry}</li>)}</ul></div>}
                              {!!criterion.missing_item_ids?.length && <div><p className="mb-2 text-xs font-semibold text-white/60">Not performed</p><p className="text-xs leading-6 text-white/65">{criterion.missing_item_ids.join(", ").replaceAll("_", " ")}</p></div>}
                              {!!criterion.book_references?.length && <p className="flex items-start gap-2 text-xs leading-5 text-white/50"><BookOpen size={14} className="mt-0.5 shrink-0"/><span>Textbook reference: PDF page{criterion.book_references.length === 1 ? "" : "s"} {criterion.book_references.map(r => r.page).filter(p => p != null).join(", ")}. Historical source; clinical/OCR validation pending.</span></p>}
                              {!criterion.feedback && !criterion.evidence?.length && <p className="text-xs text-white/50">No explanation available for this criterion.</p>}
                            </div>
                          </details>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>

            <section className={`${card} mt-6 p-5 sm:p-6`}>
              <div className="flex gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-amber-200" size={20}/><div><h2 className="font-semibold">About this assessment</h2><p className="mt-1 text-sm leading-6 text-white/55">Book references support the rubric; they do not directly award marks. This is a provisional educational assessment.</p></div></div>
              {!!report.warnings?.length && <ul className="mt-4 space-y-2 pl-8 text-xs leading-6 text-white/55">{report.warnings.map((warning, index) => <li key={index} className="list-disc">{warning}</li>)}</ul>}
            </section>
            <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/40"><span>Case {report.case_id} · Session {report.session_id.slice(0, 8)}…</span><span className="flex items-center gap-1"><Clock3 size={13}/> Draft evaluation</span></footer>
          </>
        )}
      </div>
    </main>
  );
}
