
"use client";

import {
  AlertCircle,
  ArrowLeft, AudioLines, Check, ChevronLeft, ClipboardList,
  Clock3, FlaskConical, HeartPulse, Info, Menu, MessageSquare,
  Pause, Play, RotateCcw, Scan, Send, ShieldCheck,
  Stethoscope, X,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  use, useCallback, useEffect, useRef, useState,
} from "react";

const AvatarScene = dynamic(
  () => import("../../../src/components/AvatarScene"),
  { ssr: false }
);

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

// ============================================================
// TYPES
// ============================================================

type Message = {
  role: "user" | "assistant";
  text: string;
  audio?: string;
  error?: boolean;
};

type MenuItem = {
  id: string;
  label: string;
};

type ToolResult = {
  id: string;
  label: string;
  result: unknown;
  group?: string;
};

type InvestigationGroup = {
  id: string;
  label: string;
  items: MenuItem[];
};

type ImagingResult = {
  id: string;
  label: string;
  image?: string;
  report?: string | null;
};

type CaseDetails = {
  title: string;
  short_brief?: string;
  specialty?: string;
  difficulty?: string;
  patient?: {
    age?: string;
    sex?: string;
  };
};

type DiagnosisOption = {
  id: string;
  label: string;
};

type DiagnosisAssessment = {
  status: "correct" | "needs_review" | "incorrect";
  classification: string;
  requires_review: boolean;
  reason: string;
  evidence_for: string[];
  evidence_against: string[];
  justification_provided: boolean;
};

type FinalResult = {
  correct: boolean;
  diagnosis_assessment?: DiagnosisAssessment;
  selected_option_id?: string;
  student_justification?: string;
  correct_diagnosis?: {
    option_id?: string;
    label: string;
  };
  debrief?: {
    summary?: string;
    learning_points?: string[];
  };
  secondary_findings?: string[];
};

type Panel =
  | "exam"
  | "investigations"
  | "imaging"
  | "brief"
  | "history"
  | null;

// ============================================================
// API HELPERS
// ============================================================

async function jsonRequest<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`
    );
  }

  return response.json() as Promise<T>;
}

function postJson<T>(url: string, payload: object) {
  return jsonRequest<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function resultText(value: unknown): string {
  if (value == null || value === "NOT_DOCUMENTED") {
    return "Not documented";
  }

  if (typeof value === "object") {
    const data = value as {
      value?: unknown;
      unit?: string;
    };

    if ("value" in data) {
      return `${data.value ?? "Not documented"} ${data.unit || ""}`.trim();
    }

    return JSON.stringify(value);
  }

  return String(value);
}

// ============================================================
// STYLES
// ============================================================

const glass =
  "border border-white/25 bg-[#092832]/75 shadow-[0_16px_48px_rgba(2,22,28,.22)] backdrop-blur-2xl";

const innerCard =
  "rounded-[18px] border border-white/10 bg-white/[.065] shadow-[inset_0_1px_0_rgba(255,255,255,.07)]";

const selected =
  "bg-[#84e1d5] text-[#06313a] shadow-[0_7px_20px_rgba(70,200,185,.14)]";

const unselected =
  "text-[#e1f0ee]/80 hover:bg-white/[.11] hover:text-white";

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function SessionPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = use(params);

  const [sessionId, setSessionId] = useState("");
  const [caseData, setCaseData] =
    useState<CaseDetails | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [playingIndex, setPlayingIndex] =
    useState<number | null>(null);

  const [analyser, setAnalyser] =
    useState<AnalyserNode | null>(null);

  const [speaking, setSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<number[]>([]);
  const [error, setError] = useState("");

  const [panel, setPanel] = useState<Panel>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef =
    useRef<MediaElementAudioSourceNode | null>(null);

  const requestInFlight = useRef(false);

  const sessionStartRef = useRef<
    Promise<{ session_id: string }> | null
  >(null);

  const sessionCaseRef = useRef<string | null>(null);
  const historyBottomRef = useRef<HTMLDivElement | null>(null);

  // Clinical tools
  const [examMenu, setExamMenu] = useState<MenuItem[]>([]);
  const [examResults, setExamResults] =
    useState<ToolResult[]>([]);

  const [investigationGroups, setInvestigationGroups] =
    useState<InvestigationGroup[]>([]);

  const [selectedInvestigations, setSelectedInvestigations] =
    useState<string[]>([]);

  const [investigationResults, setInvestigationResults] =
    useState<ToolResult[]>([]);

  const [imagingStudies, setImagingStudies] =
    useState<MenuItem[]>([]);

  const [imagingResults, setImagingResults] =
    useState<ImagingResult[]>([]);

  const [ended, setEnded] = useState(false);
  const [diagnosisOptions, setDiagnosisOptions] =
    useState<DiagnosisOption[]>([]);

  const [selectedDiagnosis, setSelectedDiagnosis] =
    useState("");

  // NEW: Student's clinical reasoning
  const [clinicalJustification, setClinicalJustification] =
    useState("");

  const [finalResult, setFinalResult] =
    useState<FinalResult | null>(null);

  const [busyTool, setBusyTool] = useState(false);

  // ==========================================================
  // AUDIO
  // ==========================================================

  const stopAudio = useCallback(() => {
    const old = audioRef.current;

    if (old) {
      old.pause();
      old.onended = null;
      old.onerror = null;
      audioRef.current = null;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    setAnalyser(null);
    setSpeaking(false);
    setPlayingIndex(null);

    const context = contextRef.current;
    contextRef.current = null;

    if (context && context.state !== "closed") {
      void context.close().catch(() => {});
    }
  }, []);

  const playVoice = useCallback(
    async (
      base64: string,
      index: number,
      restart = false
    ) => {
      if (
        !restart &&
        audioRef.current &&
        playingIndex === index
      ) {
        const current = audioRef.current;

        if (!current.paused) {
          current.pause();
          setSpeaking(false);
          setPlayingIndex(null);
          return;
        }

        try {
          if (contextRef.current?.state === "suspended") {
            await contextRef.current.resume();
          }

          await current.play();
          setSpeaking(true);
          setPlayingIndex(index);
        } catch {
          setError(
            "Audio playback was blocked. Click Play again."
          );
        }

        return;
      }

      stopAudio();

      const audio = new Audio(
        `data:audio/mpeg;base64,${base64}`
      );

      audioRef.current = audio;

      audio.onended = () => stopAudio();

      audio.onerror = () => {
        stopAudio();
        setError("Couldn't play this voice response.");
      };

      try {
        const context = new window.AudioContext();
        contextRef.current = context;

        const source =
          context.createMediaElementSource(audio);

        sourceRef.current = source;

        const nextAnalyser = context.createAnalyser();
        nextAnalyser.fftSize = 1024;
        nextAnalyser.smoothingTimeConstant = 0.65;

        source.connect(nextAnalyser);
        nextAnalyser.connect(context.destination);

        setAnalyser(nextAnalyser);

        if (context.state === "suspended") {
          await context.resume();
        }

        await audio.play();

        setPlayingIndex(index);
        setSpeaking(true);
      } catch {
        setSpeaking(false);
        setPlayingIndex(null);

        setError(
          "Autoplay blocked. Click the voice Play button to hear the response."
        );
      }
    },
    [playingIndex, stopAudio]
  );

  // ==========================================================
  // INITIALIZATION
  // ==========================================================

  useEffect(() => {
    let canceled = false;

    if (sessionCaseRef.current !== caseId) {
      sessionCaseRef.current = caseId;
      sessionStartRef.current = null;
    }

    async function init() {
      try {
        const [details, exam, investigations, imaging] =
          await Promise.all([
            jsonRequest<CaseDetails>(
              `${API}/api/cases/${caseId}`
            ),
            jsonRequest<{ items: MenuItem[] }>(
              `${API}/api/cases/${caseId}/physical-exam`
            ),
            jsonRequest<{
              groups: InvestigationGroup[];
            }>(
              `${API}/api/cases/${caseId}/investigations`
            ),
            jsonRequest<{ studies: MenuItem[] }>(
              `${API}/api/cases/${caseId}/imaging`
            ),
          ]);

        if (canceled) return;

        setCaseData(details);
        setExamMenu(exam.items || []);
        setInvestigationGroups(investigations.groups || []);
        setImagingStudies(imaging.studies || []);

        if (!sessionStartRef.current) {
          sessionStartRef.current = postJson<{
            session_id: string;
          }>(
            `${API}/api/sessions/start`,
            { case_id: caseId }
          );
        }

        const pendingSession = sessionStartRef.current;

        try {
          const session = await pendingSession;

          if (!canceled) {
            setSessionId(session.session_id);
          }
        } catch (e) {
          if (sessionStartRef.current === pendingSession) {
            sessionStartRef.current = null;
          }
          throw e;
        }
      } catch (e) {
        if (!canceled) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load case."
          );
        }
      }
    }

    void init();

    return () => {
      canceled = true;
    };
  }, [caseId]);

  useEffect(() => {
    if (!sessionId || ended) return;

    const timer = window.setInterval(
      () => setElapsed((s) => s + 1),
      1000
    );

    return () => window.clearInterval(timer);
  }, [sessionId, ended]);

  useEffect(() => {
    if (panel === "history") {
      historyBottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [messages, sending, panel]);

  useEffect(
    () => () => {
      const a = audioRef.current;
      if (a) a.pause();

      const ctx = contextRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPanel(null);
        setRailOpen(false);
      }
    }

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // ==========================================================
  // CHAT
  // ==========================================================

  async function sendMessage() {
    if (
      !message.trim() ||
      !sessionId ||
      ended ||
      sending ||
      requestInFlight.current
    ) {
      return;
    }

    requestInFlight.current = true;

    const userText = message.trim();

    setMessage("");
    setError("");
    setSending(true);

    const assistantIndex = messages.length + 1;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: userText },
    ]);

    try {
      const data = await postJson<{
        reply: string;
        audio_base64: string;
      }>(
        `${API}/api/chat/voice`,
        {
          case_id: caseId,
          session_id: sessionId,
          message: userText,
        }
      );

      if (!data.audio_base64) {
        throw new Error(
          "Voice response contains no audio."
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          audio: data.audio_base64,
        },
      ]);

      void playVoice(
        data.audio_base64,
        assistantIndex
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to generate voice response."
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Voice unavailable. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setSending(false);
      requestInFlight.current = false;
    }
  }

  // ==========================================================
  // PHYSICAL EXAMINATION
  // ==========================================================

  async function openExam(id: string) {
    if (!sessionId || ended || busyTool) return;

    setBusyTool(true);
    setError("");

    try {
      const data = await postJson<{
        results: ToolResult[];
      }>(
        `${API}/api/cases/${caseId}/physical-exam`,
        {
          session_id: sessionId,
          item_ids: [id],
        }
      );

      setExamResults((prev) => [
        ...prev.filter((x) => x.id !== id),
        ...(data.results || []),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Examination failed."
      );
    } finally {
      setBusyTool(false);
    }
  }

  // ==========================================================
  // INVESTIGATIONS
  // ==========================================================

  async function getInvestigations() {
    if (
      !sessionId ||
      !selectedInvestigations.length ||
      ended ||
      busyTool
    ) {
      return;
    }

    setBusyTool(true);
    setError("");

    try {
      const data = await postJson<{
        results: ToolResult[];
      }>(
        `${API}/api/cases/${caseId}/investigations`,
        {
          session_id: sessionId,
          item_ids: selectedInvestigations,
        }
      );

      setInvestigationResults(data.results || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Investigations failed."
      );
    } finally {
      setBusyTool(false);
    }
  }

  // ==========================================================
  // IMAGING
  // ==========================================================

  async function openImaging(id: string) {
    if (!sessionId || ended || busyTool) return;

    setBusyTool(true);
    setError("");

    try {
      const data = await postJson<{
        results: ImagingResult[];
      }>(
        `${API}/api/cases/${caseId}/imaging`,
        {
          session_id: sessionId,
          item_ids: [id],
        }
      );

      setImagingResults((prev) => [
        ...prev.filter((x) => x.id !== id),
        ...(data.results || []),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Imaging failed."
      );
    } finally {
      setBusyTool(false);
    }
  }

  // ==========================================================
  // END SESSION
  // ==========================================================

  async function endSession() {
    if (
      !sessionId ||
      ended ||
      sending ||
      busyTool
    ) {
      return;
    }

    if (
      !window.confirm(
        "End this consultation and submit your final diagnosis?"
      )
    ) {
      return;
    }

    setBusyTool(true);
    setError("");

    try {
      const data = await postJson<{
        assessment?: {
          options?: DiagnosisOption[];
        };
      }>(
        `${API}/api/cases/${caseId}/end-session`,
        { session_id: sessionId }
      );

      stopAudio();
      setPanel(null);

      setDiagnosisOptions(
        data.assessment?.options || []
      );

      setEnded(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to end session."
      );
    } finally {
      setBusyTool(false);
    }
  }

  // ==========================================================
  // DIAGNOSIS SUBMISSION - UPDATED
  // ==========================================================

  async function submitDiagnosis() {
    if (
      !sessionId ||
      !selectedDiagnosis ||
      finalResult ||
      busyTool
    ) {
      return;
    }

    const justification = clinicalJustification.trim();

    if (justification.length < 20) {
      setError(
        "Please explain your clinical reasoning in at least 20 characters."
      );
      return;
    }

    setBusyTool(true);
    setError("");

    try {
      const data = await postJson<FinalResult>(
        `${API}/api/cases/${caseId}/submit-diagnosis`,
        {
          session_id: sessionId,
          option_id: selectedDiagnosis,
          justification,
        }
      );

      setFinalResult(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to submit diagnosis."
      );
    } finally {
      setBusyTool(false);
    }
  }

  // ==========================================================
  // UI HELPERS
  // ==========================================================

  const togglePanel = (next: Panel) => {
    setPanel((old) =>
      old === next ? null : next
    );

    setRailOpen(false);
  };

  const timeLabel =
    `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:` +
    `${String(elapsed % 60).padStart(2, "0")}`;

  const latestVoiceIndex = messages.reduce(
    (last, msg, i) => msg.audio ? i : last,
    -1
  );

  const latestVoice =
    latestVoiceIndex >= 0
      ? messages[latestVoiceIndex]
      : null;

  const diagnosisStatus =
    finalResult?.diagnosis_assessment?.status ??
    (finalResult?.correct ? "correct" : "incorrect");

  const diagnosisStatusLabel = {
    correct: "Primary Diagnosis Matched",
    needs_review: "Clinical Review Required",
    incorrect: "Diagnosis Not Supported",
  }[diagnosisStatus];

  const diagnosisStatusStyle = {
    correct: "bg-emerald-300/15 text-emerald-200",
    needs_review: "bg-amber-300/15 text-amber-200",
    incorrect: "bg-rose-300/15 text-rose-200",
  }[diagnosisStatus];

  if (!caseData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#09252d] px-6 text-white">
        {error || "Preparing your consultation room…"}
      </main>
    );
  }

  // ==========================================================
  // PAGE UI
  // ==========================================================

  return (
    <main className="relative isolate h-[100dvh] min-h-[590px] overflow-hidden bg-[#09252d] font-sans text-white">

      {/* 3D AVATAR */}
      <div className="absolute inset-0">
        <AvatarScene
          analyser={analyser}
          isSpeaking={speaking}
        />
      </div>

      {/* BACKGROUND OVERLAYS */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,29,36,.43),transparent_23%,transparent_79%,rgba(3,29,36,.12))]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#03232e]/50 to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[33%] bg-gradient-to-t from-[#041f29]/75 via-[#041f29]/15 to-transparent" />

      {/* NAVIGATION RAIL */}
      <nav
        aria-label="Session navigation"
        className={`absolute bottom-4 left-4 top-4 z-30 flex flex-col rounded-[26px] ${glass} transition-all duration-300 ${
          railOpen ? "w-52" : "w-[62px]"
        }`}
      >
        <button
          aria-label="Toggle navigation"
          onClick={() => setRailOpen((v) => !v)}
          className="mx-auto mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#84e1d5] text-[#06313a] shadow-[0_7px_22px_rgba(88,230,211,.24)] transition hover:scale-[1.03]"
        >
          <HeartPulse size={22} />
        </button>

        {railOpen && (
          <p className="mt-3 text-center text-sm font-bold tracking-tight">
            MedTwin AI
          </p>
        )}

        <div className="mt-9 space-y-2 px-2">
          {([
            ["brief", Info, "Case brief"],
            ["exam", Stethoscope, "Examination"],
            ["investigations", FlaskConical, "Investigations"],
            ["imaging", Scan, "Imaging"],
            ["history", MessageSquare, "Conversation"],
          ] as const).map(([name, Icon, label]) => (
            <button
              key={name}
              title={label}
              aria-label={label}
              aria-pressed={panel === name}
              onClick={() => togglePanel(name)}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-[11px] text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9de9df] ${
                panel === name ? selected : unselected
              }`}
            >
              <Icon size={19} className="shrink-0" />
              {railOpen && <span>{label}</span>}
            </button>
          ))}
        </div>

        <div className="mt-auto p-2">
          <button
            aria-label={
              railOpen
                ? "Collapse navigation"
                : "Expand navigation"
            }
            onClick={() => setRailOpen((v) => !v)}
            className={`flex h-10 w-full items-center justify-center rounded-xl ${unselected}`}
          >
            {railOpen
              ? <ChevronLeft size={20} />
              : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* TOP HUD */}
      <header className="pointer-events-none absolute left-[90px] right-4 top-5 z-20 flex flex-wrap items-center justify-between gap-3 sm:right-7">
        <div className={`pointer-events-auto max-w-[min(450px,60vw)] rounded-[20px] px-5 py-3.5 ${glass}`}>
          <p className="text-[10px] font-bold uppercase tracking-[.23em] text-[#a3ede4]">
            MedTwin / Virtual consultation
          </p>

          <h1
            className="mt-1 truncate text-sm font-semibold sm:text-base"
            title={caseData.title}
          >
            {caseData.title}
          </h1>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className={`flex items-center gap-2 rounded-[18px] px-4 py-3 text-xs ${glass}`}>
            <span
              className={`h-2 w-2 rounded-full ${
                ended ? "bg-white/50" : "bg-emerald-300"
              }`}
            />

            {ended ? "Completed" : "Live session"}

            <span className="mx-1 text-white/25">|</span>
            <Clock3 size={13} />
            {timeLabel}
          </div>

          {!ended && (
            <button
              onClick={endSession}
              disabled={!sessionId || sending || busyTool}
              className="rounded-[18px] border border-rose-100/25 bg-[#643d49]/80 px-4 py-3 text-xs font-semibold text-rose-50 shadow-lg backdrop-blur-xl transition hover:bg-[#80505b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
            >
              End Session
            </button>
          )}
        </div>
      </header>

      {/* FLOATING SCENE STATUS */}
      {!ended && (
        <div className={`pointer-events-none absolute bottom-[178px] left-[calc(50%+28px)] z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium ${glass}`}>
          <AudioLines
            size={15}
            className={
              speaking
                ? "animate-pulse text-[#6cd9cf]"
                : "text-white/60"
            }
          />

          {sending
            ? "Preparing mother's response…"
            : speaking
              ? "Mother is speaking"
              : "Patient's mother · Ready"}
        </div>
      )}

      {/* SCENE CONTROLS */}
      {!ended && (
        <div className="absolute bottom-5 left-[90px] right-4 z-20 mx-auto flex max-w-[820px] flex-col gap-3 sm:right-6">
          <div className="mx-auto flex max-w-full flex-wrap justify-center gap-2 rounded-full border border-white/15 bg-[#052831]/35 p-1.5 backdrop-blur-md">

            <button
              onClick={() => togglePanel("exam")}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9de9df] ${
                panel === "exam" ? selected : glass
              }`}
            >
              <Stethoscope size={15} />
              Examine
            </button>

            <button
              onClick={() => togglePanel("investigations")}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9de9df] ${
                panel === "investigations" ? selected : glass
              }`}
            >
              <FlaskConical size={15} />
              Labs
            </button>

            <button
              onClick={() => togglePanel("imaging")}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9de9df] ${
                panel === "imaging" ? selected : glass
              }`}
            >
              <Scan size={15} />
              Imaging
            </button>

            <button
              onClick={() => togglePanel("history")}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9de9df] ${
                panel === "history" ? selected : glass
              }`}
            >
              <MessageSquare size={15} />
              History

              {messages.length > 0 && (
                <span className="text-[#8de8db]">
                  {messages.length}
                </span>
              )}
            </button>

            {latestVoice?.audio && (
              <button
                aria-label="Replay latest response"
                title="Replay latest response"
                onClick={() =>
                  void playVoice(
                    latestVoice.audio!,
                    latestVoiceIndex,
                    true
                  )
                }
                className={`rounded-full p-2.5 ${glass}`}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>

          {/* MESSAGE COMPOSER */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className={`flex items-center gap-2 rounded-[26px] border-white/30 p-2 pl-4 ring-1 ring-white/5 transition-shadow focus-within:shadow-[0_0_0_3px_rgba(132,225,213,.20)] ${glass}`}
          >
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#6cd9cf]/15 text-[#a3ede4] sm:flex">
              <MessageSquare size={18} />
            </div>

            <input
              dir="auto"
              aria-label="Message to patient's mother"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending || !sessionId}
              placeholder="Ask the patient's mother…"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/70 disabled:opacity-50"
            />

            <button
              aria-label="Send message"
              type="submit"
              disabled={
                sending ||
                !message.trim() ||
                !sessionId
              }
              className="flex h-12 items-center gap-2 rounded-[18px] bg-[#84e1d5] px-5 font-semibold text-[#07333b] shadow-[0_8px_20px_rgba(58,200,181,.19)] transition hover:bg-[#a1f4e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
            >
              <Send size={17} />

              <span className="hidden text-sm sm:inline">
                {sending ? "Working…" : "Send"}
              </span>
            </button>
          </form>

          <p className="px-2 text-center text-[11px] font-medium text-white/75">
            Conversation is for patient history only.
            Examination, labs and imaging are available in
            Clinical Tools.
          </p>
        </div>
      )}

      {/* CLINICAL TOOLS DRAWER */}
      {panel && !ended && (
        <>
          <button
            aria-label="Close panel"
            onClick={() => setPanel(null)}
            className="absolute inset-0 z-30 bg-[#061820]/35 backdrop-blur-[3px]"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label={panel}
            className="absolute bottom-4 left-[92px] top-[104px] z-40 flex w-[min(440px,calc(100vw-108px))] flex-col overflow-hidden rounded-[28px] border border-white/30 bg-[#082b35]/90 shadow-[0_30px_90px_rgba(1,19,24,.38)] backdrop-blur-3xl"
          >
            <div className="flex items-center justify-between border-b border-white/15 bg-white/[.045] px-5 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.19em] text-[#98e5db]">
                  Consultation tools
                </p>

                <h2 className="mt-1 text-lg font-semibold">
                  {{
                    exam: "Physical examination",
                    investigations: "Laboratory investigations",
                    imaging: "Medical imaging",
                    brief: "Case brief",
                    history: "Conversation history",
                  }[panel]}
                </h2>
              </div>

              <button
                aria-label="Close panel"
                onClick={() => setPanel(null)}
                className="rounded-xl p-2 text-white/75 hover:bg-white/10"
              >
                <X size={19} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-color:#49777b_transparent]">

              {/* CASE BRIEF */}
              {panel === "brief" && (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-white/80">
                    {caseData.short_brief}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Age", caseData.patient?.age],
                      ["Sex", caseData.patient?.sex],
                      ["Specialty", caseData.specialty],
                      ["Difficulty", caseData.difficulty],
                    ].map(([key, value]) => (
                      <div
                        key={key}
                        className={`${innerCard} p-4`}
                      >
                        <p className="text-xs text-white/55">
                          {key}
                        </p>

                        <p className="mt-1 text-sm font-semibold">
                          {value || "—"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="flex items-center gap-2 text-xs text-[#a3ede4]">
                    <ShieldCheck size={15} />
                    Education-only clinical simulation
                  </p>
                </div>
              )}

              {/* PHYSICAL EXAMINATION */}
              {panel === "exam" && (
                <>
                  {examMenu.map((item) => {
                    const finding = examResults.find(
                      (r) => r.id === item.id
                    );

                    return (
                      <div
                        key={item.id}
                        className={`overflow-hidden ${innerCard}`}
                      >
                        <button
                          onClick={() => void openExam(item.id)}
                          disabled={busyTool || ended}
                          className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-medium hover:bg-white/[.06] disabled:opacity-50"
                        >
                          {item.label}

                          {finding ? (
                            <Check
                              size={16}
                              className="text-[#7ce4d5]"
                            />
                          ) : (
                            <ChevronLeft
                              size={16}
                              className="rotate-180 text-white/50"
                            />
                          )}
                        </button>

                        {finding && (
                          <div className="border-t border-white/10 bg-[#051b22]/45 px-4 py-3 text-sm text-[#a3ede4]">
                            {resultText(finding.result)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* INVESTIGATIONS */}
              {panel === "investigations" && (
                <>
                  {investigationGroups.map((group) => (
                    <div
                      key={group.id}
                      className={`${innerCard} p-4`}
                    >
                      <h3 className="mb-3 text-sm font-semibold">
                        {group.label}
                      </h3>

                      <div className="space-y-3">
                        {group.items.map((item) => (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-start gap-3 text-sm text-white/80"
                          >
                            <input
                              type="checkbox"
                              disabled={busyTool || ended}
                              checked={selectedInvestigations.includes(
                                item.id
                              )}
                              onChange={(e) =>
                                setSelectedInvestigations(
                                  (prev) =>
                                    e.target.checked
                                      ? [...prev, item.id]
                                      : prev.filter(
                                          (id) =>
                                            id !== item.id
                                        )
                                )
                              }
                              className="mt-1 accent-[#72ded2]"
                            />

                            {item.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    disabled={
                      busyTool ||
                      ended ||
                      !selectedInvestigations.length
                    }
                    onClick={() =>
                      void getInvestigations()
                    }
                    className="w-full rounded-2xl bg-[#72ded2] px-4 py-3 text-sm font-bold text-[#07333b] disabled:opacity-40"
                  >
                    {busyTool
                      ? "Loading…"
                      : "View selected results"}
                  </button>

                  {investigationResults.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-[#041d27]/55 p-3"
                    >
                      <p className="text-xs text-white/60">
                        {item.label}
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[#a3ede4]">
                        {resultText(item.result)}
                      </p>
                    </div>
                  ))}
                </>
              )}

              {/* IMAGING */}
              {panel === "imaging" && (
                <>
                  {imagingStudies.map((study) => (
                    <button
                      key={study.id}
                      onClick={() =>
                        void openImaging(study.id)
                      }
                      disabled={busyTool || ended}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.06] p-4 text-left text-sm hover:bg-white/10 disabled:opacity-50"
                    >
                      {study.label}

                      <Scan
                        size={17}
                        className="text-[#a3ede4]"
                      />
                    </button>
                  ))}

                  {imagingResults.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-[#051b22]/50 p-3"
                    >
                      <p className="mb-2 text-sm font-medium">
                        {item.label}
                      </p>

                      {item.image && (
                        <img
                          src={`${API}/case-assets/${item.image}`}
                          alt={item.label}
                          className="w-full rounded-xl bg-white object-contain"
                        />
                      )}

                      <p className="mt-3 text-xs leading-6 text-white/70">
                        {item.report &&
                        item.report !== "NOT_DOCUMENTED"
                          ? item.report
                          : "No documented radiology report."}
                      </p>
                    </div>
                  ))}
                </>
              )}

              {/* CONVERSATION HISTORY */}
              {panel === "history" && (
                <>
                  {!messages.length && (
                    <p className="py-16 text-center text-sm text-white/60">
                      Your conversation will appear here
                      once you begin.
                    </p>
                  )}

                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        msg.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[94%] rounded-2xl px-4 py-3 text-sm ${
                          msg.role === "user"
                            ? "bg-[#72ded2] text-[#07333b]"
                            : "border border-white/10 bg-white/[.08]"
                        }`}
                      >
                        {msg.role === "assistant" &&
                        msg.audio ? (
                          <div className="space-y-2">
                            <p className="flex items-center gap-2 text-xs text-[#a3ede4]">
                              <AudioLines size={14} />
                              Mother's response
                            </p>

                            <div className="flex items-center gap-2">
                              <button
                                aria-label={
                                  playingIndex === index
                                    ? "Pause voice"
                                    : "Play voice"
                                }
                                onClick={() =>
                                  void playVoice(
                                    msg.audio!,
                                    index
                                  )
                                }
                                className="rounded-full bg-[#72ded2] p-2 text-[#07333b]"
                              >
                                {playingIndex === index
                                  ? <Pause size={17} />
                                  : <Play size={17} />}
                              </button>

                              <button
                                aria-label="Replay voice"
                                onClick={() =>
                                  void playVoice(
                                    msg.audio!,
                                    index,
                                    true
                                  )
                                }
                                className="rounded-full p-2 text-white/70 hover:bg-white/10"
                              >
                                <RotateCcw size={15} />
                              </button>

                              <button
                                onClick={() =>
                                  setTranscripts(
                                    (prev) =>
                                      prev.includes(index)
                                        ? prev.filter(
                                            (i) =>
                                              i !== index
                                          )
                                        : [...prev, index]
                                  )
                                }
                                className="text-xs text-white/75 underline underline-offset-4"
                              >
                                {transcripts.includes(index)
                                  ? "Hide transcript"
                                  : "Transcript"}
                              </button>
                            </div>

                            {transcripts.includes(index) && (
                              <p
                                dir="auto"
                                className="border-t border-white/10 pt-3 leading-7"
                              >
                                {msg.text}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p
                            dir="auto"
                            className="leading-6"
                          >
                            {msg.text}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <p className="text-xs text-[#a3ede4]">
                      Generating the mother's response…
                    </p>
                  )}

                  <div ref={historyBottomRef} />
                </>
              )}
            </div>
          </section>
        </>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <div
          role="alert"
          className="absolute bottom-[186px] left-1/2 z-50 flex w-[min(540px,85vw)] -translate-x-1/2 items-start justify-between gap-3 rounded-2xl border border-amber-200/25 bg-[#4a3328]/90 p-4 text-xs leading-5 text-amber-50 shadow-2xl backdrop-blur-xl"
        >
          {error}

          <button
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ====================================================
          FINAL ASSESSMENT OVERLAY
          ==================================================== */}

      {ended && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#031820]/75 p-5 backdrop-blur-xl">
          <div
            className={`max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[30px] p-7 sm:p-9 ${glass}`}
          >

            {/* DIAGNOSIS FORM */}
            {!finalResult ? (
              <>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[#a3ede4]">
                  <ClipboardList size={17} />
                  Final assessment
                </p>

                <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                  What is your final diagnosis?
                </h2>

                <p className="mt-2 text-sm text-white/60">
                  Select the most likely diagnosis and
                  explain your clinical reasoning.
                </p>

                {/* DIAGNOSIS OPTIONS */}
                <div className="mt-6 space-y-3">
                  {diagnosisOptions.map((item) => (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm transition ${
                        selectedDiagnosis === item.id
                          ? "border-[#72ded2] bg-[#72ded2]/15"
                          : "border-white/15 bg-white/[.05] hover:bg-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        name="diagnosis"
                        checked={
                          selectedDiagnosis === item.id
                        }
                        onChange={() =>
                          setSelectedDiagnosis(item.id)
                        }
                        className="accent-[#72ded2]"
                      />

                      {item.label}
                    </label>
                  ))}
                </div>

                {/* NEW: CLINICAL JUSTIFICATION */}
                <div className="mt-7">
                  <label
                    htmlFor="clinical-justification"
                    className="block text-sm font-semibold text-[#a3ede4]"
                  >
                    Clinical Justification
                  </label>

                  <p className="mt-2 text-xs leading-5 text-white/60">
                    Explain which symptoms, clinical findings,
                    and investigations support your diagnosis.
                    You may answer in Arabic or English.
                  </p>

                  <textarea
                    id="clinical-justification"
                    dir="auto"
                    value={clinicalJustification}
                    onChange={(e) =>
                      setClinicalJustification(
                        e.target.value
                      )
                    }
                    maxLength={5000}
                    rows={5}
                    placeholder="Explain why you chose this diagnosis..."
                    className="mt-3 w-full resize-y rounded-2xl border border-white/20 bg-[#051e27]/70 p-4 text-sm leading-7 text-white outline-none placeholder:text-white/35 focus:border-[#72ded2] focus:ring-1 focus:ring-[#72ded2]"
                  />

                  <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                    <span>
                      Minimum 20 characters
                    </span>

                    <span>
                      {clinicalJustification.trim().length}
                      /5000
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => void submitDiagnosis()}
                  disabled={
                    !selectedDiagnosis ||
                    clinicalJustification.trim().length < 20 ||
                    busyTool
                  }
                  className="mt-6 w-full rounded-2xl bg-[#72ded2] p-4 font-bold text-[#07333b] transition hover:bg-[#a1f4e8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyTool
                    ? "Submitting…"
                    : "Submit Diagnosis & Reasoning"}
                </button>
              </>
            ) : (
              /* DIAGNOSIS RESULT */
              <>
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${diagnosisStatusStyle}`}
                >
                  {diagnosisStatus === "correct" ? (
                    <Check size={16} />
                  ) : diagnosisStatus === "needs_review" ? (
                    <AlertCircle size={16} />
                  ) : (
                    <Info size={16} />
                  )}

                  {diagnosisStatusLabel}
                </div>

                <h2 className="mt-5 text-3xl font-bold">
                  Diagnostic Assessment
                </h2>

                {/* STUDENT'S SELECTED DIAGNOSIS */}
                <div className={`mt-5 ${innerCard} p-4`}>
                  <p className="text-xs text-white/55">
                    Your Selected Diagnosis
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    {diagnosisOptions.find(
                      (option) =>
                        option.id === finalResult.selected_option_id
                    )?.label ?? selectedDiagnosis}
                  </p>
                </div>

                {/* STUDENT'S JUSTIFICATION */}
                <div className={`mt-3 ${innerCard} p-4`}>
                  <p className="text-xs text-white/55">
                    Your Clinical Reasoning
                  </p>

                  <p
                    dir="auto"
                    className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white/85"
                  >
                    {finalResult.student_justification ||
                      clinicalJustification}
                  </p>
                </div>

                {/* ASSESSMENT EXPLANATION */}
                {finalResult.diagnosis_assessment && (
                  <div className={`mt-3 ${innerCard} p-4`}>
                    <p className="text-xs font-semibold text-[#a3ede4]">
                      Assessment Explanation
                    </p>

                    <p className="mt-2 text-sm leading-7 text-white/80">
                      {finalResult.diagnosis_assessment.reason}
                    </p>

                    {finalResult.diagnosis_assessment
                      .requires_review && (
                      <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-6 text-amber-100">
                        This alternative diagnosis requires clinical
                        review. Your justification has been recorded,
                        but has not yet been graded by the AI
                        Evaluation Engine.
                      </p>
                    )}
                  </div>
                )}

                {/* SUPPORTING EVIDENCE */}
                {!!finalResult.diagnosis_assessment
                  ?.evidence_for?.length && (
                  <div className={`mt-3 ${innerCard} p-4`}>
                    <p className="text-sm font-semibold text-emerald-200">
                      Supporting Clinical Evidence
                    </p>

                    <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-white/75">
                      {finalResult.diagnosis_assessment.evidence_for.map(
                        (item, index) => (
                          <li key={index}>{item}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {/* CONTRADICTING EVIDENCE */}
                {!!finalResult.diagnosis_assessment
                  ?.evidence_against?.length && (
                  <div className={`mt-3 ${innerCard} p-4`}>
                    <p className="text-sm font-semibold text-amber-200">
                      Evidence Requiring Consideration
                    </p>

                    <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-white/75">
                      {finalResult.diagnosis_assessment.evidence_against.map(
                        (item, index) => (
                          <li key={index}>{item}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {/* DOCUMENTED PRIMARY DIAGNOSIS */}
                <div className={`mt-3 ${innerCard} p-4`}>
                  <p className="text-xs text-white/55">
                    Documented Primary Diagnosis
                  </p>

                  <p className="mt-2 text-lg font-semibold text-[#a3ede4]">
                    {finalResult.correct_diagnosis?.label}
                  </p>
                </div>

                {/* DEBRIEF */}
                {finalResult.debrief?.summary && (
                  <p className="mt-6 text-sm leading-7 text-white/80">
                    {finalResult.debrief.summary}
                  </p>
                )}

                {!!finalResult.debrief?.learning_points?.length && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-[#a3ede4]">
                      Key Learning Points
                    </h3>

                    <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80">
                      {finalResult.debrief.learning_points.map(
                        (point, i) => (
                          <li key={i}>{point}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                <a
                  href={`/report/${encodeURIComponent(sessionId)}`}
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#72ded2] px-5 py-3 text-sm font-bold text-[#07333b]"
                >
                  View Clinical Evaluation Report
                </a>

                <a
                  href="/cases"
                  className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#72ded2] px-5 py-3 text-sm font-bold text-[#07333b]"
                >
                  <ArrowLeft size={16} />
                  Back to cases
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
