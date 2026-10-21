"use client";

import { AudioLines, FileText, Pause, Play, RotateCcw } from "lucide-react";
import { use, useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Message = { role: "user" | "assistant"; text: string; audio?: string; error?: boolean };
type MenuItem = { id: string; label: string };
type ToolResult = { id: string; label: string; result: unknown; group?: string };
type InvestigationGroup = { id: string; label: string; items: MenuItem[] };
type ImagingResult = { id: string; label: string; image?: string; report?: string };
type CaseDetails = {
  title: string; short_brief?: string; specialty?: string; difficulty?: string;
  patient?: { age?: string; sex?: string };
};
type DiagnosisOption = { id: string; label: string };
type FinalResult = {
  correct: boolean;
  correct_diagnosis?: { label: string };
  debrief?: { summary?: string; learning_points?: string[] };
  secondary_findings?: string[];
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.detail === "string" ? detail.detail : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function postJson<T>(url: string, payload: object) {
  return jsonRequest<T>(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

function resultText(value: unknown): string {
  if (value === null || value === undefined) return "Not documented";
  if (typeof value === "object") {
    const v = value as { value?: unknown; unit?: string };
    if ("value" in v) return `${v.value ?? "Not documented"} ${v.unit || ""}`.trim();
    return JSON.stringify(value);
  }
  return String(value);
}

export default function SessionPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = use(params);
  const [sessionId, setSessionId] = useState("");
  const [caseData, setCaseData] = useState<CaseDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [transcripts, setTranscripts] = useState<number[]>([]);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [examMenu, setExamMenu] = useState<MenuItem[]>([]);
  const [examResults, setExamResults] = useState<ToolResult[]>([]);
  const [investigationGroups, setInvestigationGroups] = useState<InvestigationGroup[]>([]);
  const [selectedInvestigations, setSelectedInvestigations] = useState<string[]>([]);
  const [investigationResults, setInvestigationResults] = useState<ToolResult[]>([]);
  const [imagingStudies, setImagingStudies] = useState<MenuItem[]>([]);
  const [imagingResults, setImagingResults] = useState<ImagingResult[]>([]);
  const [activeTool, setActiveTool] = useState("exam");
  const [ended, setEnded] = useState(false);
  const [diagnosisOptions, setDiagnosisOptions] = useState<DiagnosisOption[]>([]);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState("");
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [busyTool, setBusyTool] = useState(false);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; audioRef.current = null; }
    setPlayingIndex(null);
  }, []);

  const playVoice = useCallback(async (base64: string, index: number) => {
    if (playingIndex === index && audioRef.current) {
      const audio = audioRef.current;
      if (!audio.paused) { audio.pause(); setPlayingIndex(null); return; }
      try { await audio.play(); setPlayingIndex(index); } catch { setError("Browser blocked audio playback. Click Play again."); }
      return;
    }
    stopAudio();
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audioRef.current = audio;
    audio.onended = () => { audioRef.current = null; setPlayingIndex(null); };
    audio.onerror = () => { audioRef.current = null; setPlayingIndex(null); setError("Couldn't play the audio. Please try again."); };
    try { await audio.play(); setPlayingIndex(index); }
    catch { setPlayingIndex(null); setError("Browser blocked autoplay. Tap Play to hear the response."); }
  }, [playingIndex, stopAudio]);

  useEffect(() => {
    let canceled = false;
    async function init() {
      try {
        const [details, exam, inv, imaging] = await Promise.all([
          jsonRequest<CaseDetails>(`${API}/api/cases/${caseId}`),
          jsonRequest<{ items: MenuItem[] }>(`${API}/api/cases/${caseId}/physical-exam`),
          jsonRequest<{ groups: InvestigationGroup[] }>(`${API}/api/cases/${caseId}/investigations`),
          jsonRequest<{ studies: MenuItem[] }>(`${API}/api/cases/${caseId}/imaging`),
        ]);
        if (canceled) return;
        setCaseData(details); setExamMenu(exam.items || []);
        setInvestigationGroups(inv.groups || []); setImagingStudies(imaging.studies || []);
        // In React Strict Mode, an effect may be re-run in development. Only start the live session after menus load.
        const session = await postJson<{ session_id: string }>(`${API}/api/sessions/start`, { case_id: caseId });
        if (!canceled) setSessionId(session.session_id);
      } catch (e) { if (!canceled) setError(e instanceof Error ? e.message : "Unable to load case."); }
    }
    void init();
    return () => { canceled = true; };
  }, [caseId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  async function sendMessage() {
    if (!message.trim() || !sessionId || ended || sending) return;
    const userText = message.trim(); setMessage(""); setError(""); setSending(true);
    setMessages(prev => [...prev, { role: "user", text: userText }]);
    try {
      const data = await postJson<{ reply: string; audio_base64: string; audio_format: string }>(
        `${API}/api/chat/voice`, { case_id: caseId, message: userText },
      );
      if (!data.audio_base64) throw new Error("Voice response contains no audio.");
      const assistantIndex = messages.length + 1; // preceding user message
      setMessages(prev => [...prev, { role: "assistant", text: data.reply, audio: data.audio_base64 }]);
      void playVoice(data.audio_base64, assistantIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate the voice response.");
      setMessages(prev => [...prev, { role: "assistant", text: "Voice unavailable. Please try again.", error: true }]);
    } finally { setSending(false); }
  }

  async function openExam(id: string) {
    if (!sessionId || ended || busyTool) return;
    setBusyTool(true); setError("");
    try {
      const data = await postJson<{ results: ToolResult[] }>(`${API}/api/cases/${caseId}/physical-exam`, { session_id: sessionId, item_ids: [id] });
      setExamResults(prev => [...prev.filter(x => x.id !== id), ...(data.results || [])]);
    } catch (e) { setError(e instanceof Error ? e.message : "Examination failed."); }
    finally { setBusyTool(false); }
  }

  async function getInvestigations() {
    if (!sessionId || !selectedInvestigations.length || ended || busyTool) return;
    setBusyTool(true); setError("");
    try {
      const data = await postJson<{ results: ToolResult[] }>(`${API}/api/cases/${caseId}/investigations`, { session_id: sessionId, item_ids: selectedInvestigations });
      setInvestigationResults(data.results || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Investigations failed."); }
    finally { setBusyTool(false); }
  }

  async function openImaging(id: string) {
    if (!sessionId || ended || busyTool) return;
    setBusyTool(true); setError("");
    try {
      const data = await postJson<{ results: ImagingResult[] }>(`${API}/api/cases/${caseId}/imaging`, { session_id: sessionId, item_ids: [id] });
      setImagingResults(prev => [...prev.filter(x => x.id !== id), ...(data.results || [])]);
    } catch (e) { setError(e instanceof Error ? e.message : "Imaging request failed."); }
    finally { setBusyTool(false); }
  }

  async function endSession() {
    if (!sessionId || sending || ended || busyTool) return;
    if (!window.confirm("End this consultation and submit your final diagnosis?")) return;
    setError(""); setBusyTool(true);
    try {
      const data = await postJson<{ assessment?: { options?: DiagnosisOption[] } }>(`${API}/api/cases/${caseId}/end-session`, { session_id: sessionId });
      stopAudio(); setDiagnosisOptions(data.assessment?.options || []); setEnded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to end session."); }
    finally { setBusyTool(false); }
  }

  async function submitDiagnosis() {
    if (!sessionId || !selectedDiagnosis || finalResult || busyTool) return;
    setError(""); setBusyTool(true);
    try {
      const data = await postJson<FinalResult>(`${API}/api/cases/${caseId}/submit-diagnosis`, { session_id: sessionId, option_id: selectedDiagnosis });
      setFinalResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to submit diagnosis."); }
    finally { setBusyTool(false); }
  }

  if (!caseData) return <main className="min-h-screen bg-slate-950 p-10 text-white">{error || "Loading case..."}</main>;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
        <div><p className="text-sm text-cyan-400">MedTwin AI</p><h1 className="font-semibold">{caseData.title}</h1></div>
        {!ended && <button onClick={endSession} disabled={!sessionId || sending || busyTool} className="rounded-xl bg-red-500 px-5 py-2 font-medium text-white hover:bg-red-400 disabled:opacity-50">End Session</button>}
      </header>
      {error && <div role="alert" className="border-b border-amber-600/30 bg-amber-500/10 px-6 py-3 text-sm text-amber-200">{error} <button className="ml-3 underline" onClick={() => setError("")}>Dismiss</button></div>}
      <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[310px_minmax(0,1fr)_300px]">
        <aside className="border-b border-slate-800 p-4 lg:border-b-0 lg:border-r">
          <h2 className="mb-4 font-semibold">Clinical Tools</h2>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {([["exam", "Exam"], ["investigations", "Labs"], ["imaging", "Imaging"]] as const).map(([id, label]) => <button key={id} onClick={() => setActiveTool(id)} className={`rounded-lg px-2 py-2 text-xs ${activeTool === id ? "bg-cyan-500 text-slate-950" : "bg-slate-900 text-slate-300"}`}>{label}</button>)}
          </div>
          {activeTool === "exam" && <div className="space-y-2">{examMenu.map(item => {
            const result = examResults.find(x => x.id === item.id);
            return <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <button disabled={ended || busyTool} onClick={() => openExam(item.id)} className="w-full text-left text-sm disabled:opacity-60">{item.label}</button>
              {result && <div className="mt-2 rounded-lg bg-slate-950 p-2 text-xs text-cyan-300">{resultText(result.result)}</div>}
            </div>;
          })}</div>}
          {activeTool === "investigations" && <div>{investigationGroups.map(group => <div key={group.id} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">{group.label}</h3>
            <div className="space-y-2">{group.items.map(item => <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-400"><input type="checkbox" disabled={ended} checked={selectedInvestigations.includes(item.id)} onChange={e => setSelectedInvestigations(prev => e.target.checked ? [...prev, item.id] : prev.filter(x => x !== item.id))} />{item.label}</label>)}</div>
          </div>)}
            <button onClick={getInvestigations} disabled={ended || busyTool || !selectedInvestigations.length} className="w-full rounded-xl bg-cyan-500 py-2 font-semibold text-slate-950 disabled:opacity-50">Next</button>
            <div className="mt-4 space-y-2">{investigationResults.map(item => <div key={item.id} className="rounded-lg bg-slate-900 p-3 text-sm"><p className="text-slate-400">{item.label}</p><p className="mt-1 text-cyan-300">{resultText(item.result)}</p></div>)}</div>
          </div>}
          {activeTool === "imaging" && <div className="space-y-4">{imagingStudies.map(study => <button key={study.id} disabled={ended || busyTool} onClick={() => openImaging(study.id)} className="w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-left text-sm disabled:opacity-50">{study.label}</button>)}
            {imagingResults.map(result => <div key={result.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">{result.image && <img src={`${API}/case-assets/${result.image}`} className="w-full rounded-xl" alt={result.label} />}<p className="mt-3 text-xs text-slate-400">{result.report}</p></div>)}
          </div>}
        </aside>
        <section className="flex min-h-[700px] min-w-0 flex-col">
          {!ended ? <>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {messages.length === 0 && <div className="mx-auto mt-24 max-w-md text-center"><div className="text-5xl">👩‍👧</div><h2 className="mt-5 text-2xl font-semibold">Begin the consultation</h2><p className="mt-3 text-sm leading-6 text-slate-400">Speak naturally to the patient's mother and take the clinical history.</p></div>}
              {messages.map((msg, index) => <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${msg.role === "user" ? "bg-cyan-500 text-slate-950" : "border border-slate-800 bg-slate-900 text-slate-200"}`}>
                  {msg.role === "assistant" && msg.audio ? <div className="min-w-[205px] sm:min-w-[260px]">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-cyan-300"><AudioLines size={16} /> Patient's Mother · Voice message</div>
                    <div className="flex items-center gap-3">
                      <button aria-label={playingIndex === index ? "Pause voice" : "Play voice"} onClick={() => void playVoice(msg.audio!, index)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">{playingIndex === index ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                      <div className="flex h-8 flex-1 items-center gap-[3px]">{[25, 55, 39, 75, 49, 87, 33, 68, 94, 47, 72, 38, 55, 80, 34, 57].map((height, i) => <span key={i} className="flex-1 rounded-full bg-cyan-400/75" style={{ height: `${height}%` }} />)}</div>
                      <button aria-label="Replay voice" title="Replay" onClick={() => { stopAudio(); void playVoice(msg.audio!, index); }} className="text-slate-400 hover:text-white"><RotateCcw size={17} /></button>
                    </div>
                    <button className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300" onClick={() => setTranscripts(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index])}><FileText size={13} /> {transcripts.includes(index) ? "Hide transcript" : "Show transcript"}</button>
                    {transcripts.includes(index) && <p dir="auto" className="mt-2 border-t border-slate-700 pt-2 leading-6 text-slate-200">{msg.text}</p>}
                  </div> : <span dir="auto">{msg.text}</span>}
                </div>
              </div>)}
              {sending && <div className="flex justify-start"><div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-cyan-300"><AudioLines size={15} className="mr-2 inline animate-pulse" />Generating mother's voice...</div></div>}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-slate-800 p-4"><div className="flex gap-3"><input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void sendMessage(); }} disabled={sending || !sessionId} placeholder="Ask the patient's mother..." className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-500 disabled:opacity-60" /><button onClick={sendMessage} disabled={sending || !message.trim() || !sessionId} className="rounded-xl bg-cyan-500 px-5 font-semibold text-slate-950 disabled:opacity-50">{sending ? "Generating..." : "Send"}</button></div></div>
          </> : !finalResult ? <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center p-8"><p className="text-sm text-cyan-400">Final Assessment</p><h2 className="mt-2 text-3xl font-bold">What is your final diagnosis?</h2><div className="mt-8 space-y-3">{diagnosisOptions.map(option => <label key={option.id} className={`block cursor-pointer rounded-2xl border p-4 ${selectedDiagnosis === option.id ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-900"}`}><input type="radio" name="diagnosis" className="mr-3" checked={selectedDiagnosis === option.id} onChange={() => setSelectedDiagnosis(option.id)} />{option.label}</label>)}</div><button onClick={submitDiagnosis} disabled={!selectedDiagnosis || busyTool} className="mt-6 rounded-xl bg-cyan-500 py-3 font-semibold text-slate-950 disabled:opacity-40">{busyTool ? "Submitting..." : "Submit Diagnosis"}</button></div>
          : <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center p-8"><div className={`rounded-3xl border p-8 ${finalResult.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}><p className="text-sm uppercase tracking-wide">Final Result</p><h2 className="mt-2 text-4xl font-bold">{finalResult.correct ? "Correct Diagnosis" : "Incorrect Diagnosis"}</h2><p className="mt-5 text-lg">Correct diagnosis: <strong>{finalResult.correct_diagnosis?.label}</strong></p>{finalResult.debrief?.summary && <p className="mt-5 leading-7 text-slate-300">{finalResult.debrief.summary}</p>}{!!finalResult.debrief?.learning_points?.length && <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-slate-300">{finalResult.debrief.learning_points.map((point, i) => <li key={i}>{point}</li>)}</ul>}</div></div>}
        </section>
        <aside className="border-t border-slate-800 p-5 lg:border-l lg:border-t-0"><p className="text-xs uppercase tracking-wider text-cyan-400">Case Brief</p><h2 className="mt-2 text-xl font-semibold">{caseData.title}</h2><p className="mt-4 text-sm leading-6 text-slate-400">{caseData.short_brief}</p><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-slate-900 p-3">Age: {caseData.patient?.age}</div><div className="rounded-xl bg-slate-900 p-3">Sex: {caseData.patient?.sex}</div><div className="rounded-xl bg-slate-900 p-3">Specialty: {caseData.specialty}</div><div className="rounded-xl bg-slate-900 p-3">Difficulty: {caseData.difficulty}</div></div></aside>
      </div>
    </main>
  );
}
