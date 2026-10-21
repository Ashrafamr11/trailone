
import {
  Activity,
  ArrowRight,
  AudioLines,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  FileHeart,
  HeartPulse,
  Mic2,
  Scan,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: AudioLines,
    title: "AI Voice Conversation",
    description:
      "Communicate naturally with AI-powered patients and listen to realistic voice responses.",
  },
  {
    icon: Stethoscope,
    title: "Physical Examination",
    description:
      "Perform examinations and reveal clinical findings through interactive tools.",
  },
  {
    icon: ClipboardList,
    title: "Investigations",
    description:
      "Select laboratory investigations and review documented clinical results.",
  },
  {
    icon: Scan,
    title: "Medical Imaging",
    description:
      "Request and examine available medical imaging directly within the simulation.",
  },
  {
    icon: BrainCircuit,
    title: "Clinical Decision-Making",
    description:
      "Analyze the available evidence and submit your final diagnosis.",
  },
  {
    icon: FileHeart,
    title: "Instant Feedback",
    description:
      "Receive diagnosis feedback and review the case after completing your session.",
  },
];

const steps = [
  {
    number: "01",
    title: "Choose a Case",
    description:
      "Select a clinical scenario and review the initial patient brief.",
  },
  {
    number: "02",
    title: "Start the Consultation",
    description:
      "Ask questions and interact naturally with the AI patient or caregiver.",
  },
  {
    number: "03",
    title: "Investigate",
    description:
      "Perform examinations, request laboratory tests, and review imaging.",
  },
  {
    number: "04",
    title: "Submit Your Diagnosis",
    description:
      "End the session, select your final diagnosis, and receive feedback.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050B18] text-white">
      {/* NAVBAR */}

      <header className="relative z-20 border-b border-white/10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
              <HeartPulse size={25} strokeWidth={2.3} />
            </div>

            <div>
              <span className="block text-xl font-bold tracking-tight">
                MedTwin <span className="text-cyan-400">AI</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Clinical Simulation
              </span>
            </div>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>

            <a href="#how-it-works" className="transition hover:text-white">
              How it Works
            </a>

            <a href="#about" className="transition hover:text-white">
              About
            </a>
          </div>

          <Link
            href="/cases"
            className="flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Launch Demo
            <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      {/* HERO */}

      <section className="relative">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[550px] w-[750px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 pt-20 lg:grid-cols-2 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-medium tracking-wide text-cyan-300">
              <Activity size={14} />
              THE FUTURE OF CLINICAL TRAINING
            </div>

            <h1 className="max-w-2xl text-5xl font-bold leading-[1.12] tracking-tight sm:text-6xl lg:text-7xl">
              Clinical Practice.
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                Reimagined.
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">
              Meet MedTwin AI — an interactive clinical simulation platform
              designed to help medical students practice patient
              communication, clinical examination, investigations, and
              diagnostic reasoning in one immersive experience.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/cases"
                className="flex items-center gap-3 rounded-xl bg-cyan-400 px-7 py-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:-translate-y-0.5 hover:bg-cyan-300"
              >
                Start Clinical Simulation
                <ArrowRight size={19} />
              </Link>

              <a
                href="#how-it-works"
                className="rounded-xl border border-white/15 bg-white/5 px-7 py-4 font-medium text-slate-200 transition hover:bg-white/10"
              >
                How It Works
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-cyan-400" />
                Interactive Cases
              </div>

              <div className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-cyan-400" />
                AI Voice Responses
              </div>

              <div className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-cyan-400" />
                Clinical Feedback
              </div>
            </div>
          </div>

          {/* SIMULATION PREVIEW */}

          <div className="relative">
            <div className="absolute -inset-5 rounded-[40px] bg-gradient-to-br from-cyan-500/15 to-blue-600/5 blur-2xl" />

            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0D1729] shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                    <Stethoscope size={22} />
                  </div>

                  <div>
                    <h3 className="font-semibold">Clinical Session</h3>
                    <p className="text-xs text-slate-500">
                      AI Patient Simulation
                    </p>
                  </div>
                </div>

                <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Demo
                </span>
              </div>

              <div className="space-y-6 p-6 sm:p-8">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-cyan-400 px-5 py-4 text-sm font-medium text-slate-950">
                    Hello, can you tell me what brought you here today?
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                    <Mic2 size={19} />
                  </div>

                  <div className="w-full max-w-[85%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Patient's Mother
                        </p>
                        <p className="text-xs text-slate-500">
                          AI Voice Response
                        </p>
                      </div>

                      <AudioLines size={19} className="text-cyan-400" />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-slate-950">
                        <AudioLines size={20} />
                      </div>

                      <div className="flex h-8 flex-1 items-center justify-between gap-1">
                        {[35, 65, 45, 85, 55, 95, 40, 75, 50, 90, 45, 65, 35, 80, 50, 30].map(
                          (height, index) => (
                            <div
                              key={index}
                              className="w-1 flex-1 rounded-full bg-cyan-400/75"
                              style={{ height: `${height}%` }}
                            />
                          )
                        )}
                      </div>

                      <span className="text-xs text-slate-500">0:08</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { icon: Stethoscope, label: "Examination" },
                    { icon: ClipboardList, label: "Lab Results" },
                    { icon: Scan, label: "Imaging" },
                  ].map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-4"
                    >
                      <Icon size={22} className="text-cyan-400" />
                      <span className="text-center text-xs text-slate-400">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-6 py-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={15} className="text-cyan-400" />
                  Educational Simulation
                </div>

                <span className="text-xs text-slate-500">
                  MedTwin AI
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}

      <section
        id="features"
        className="border-t border-white/5 bg-[#080F1E] py-24"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Platform Features
            </p>

            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Everything you need to practice.
            </h2>

            <p className="mt-5 leading-8 text-slate-400">
              From the first conversation to the final diagnosis, MedTwin AI
              brings the essential stages of a clinical encounter into one
              interactive workspace.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group rounded-2xl border border-white/10 bg-[#0D1729] p-7 transition hover:-translate-y-1 hover:border-cyan-400/30"
              >
                <div className="mb-6 flex h-13 w-13 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                  <Icon size={25} />
                </div>

                <h3 className="text-lg font-semibold">{title}</h3>

                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}

      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              The Experience
            </p>

            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              How MedTwin AI Works
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-slate-400">
              A structured clinical learning experience in four simple
              stages.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-7"
              >
                <span className="text-4xl font-bold text-cyan-400/60">
                  {step.number}
                </span>

                <h3 className="mt-6 text-lg font-semibold">
                  {step.title}
                </h3>

                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}

      <section id="about" className="px-6 pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-[#102B3C] via-[#0B1B30] to-[#0D1426] p-10 text-center sm:p-16">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-400">
            <HeartPulse size={33} />
          </div>

          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to begin your clinical journey?
          </h2>

          <p className="mx-auto mt-5 max-w-xl leading-8 text-slate-400">
            Step into a simulated clinical environment, communicate with
            your AI patient, explore the available findings, and make your
            diagnosis.
          </p>

          <Link
            href="/cases"
            className="mt-8 inline-flex items-center gap-3 rounded-xl bg-cyan-400 px-8 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Explore Clinical Cases
            <ArrowRight size={19} />
          </Link>
        </div>
      </section>

      {/* FOOTER */}

      <footer className="border-t border-white/10 py-7">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row">
          <div className="flex items-center gap-2 font-semibold">
            <HeartPulse size={19} className="text-cyan-400" />
            MedTwin AI
          </div>

          <p className="text-xs text-slate-500">
            AI-Powered Clinical Education & Simulation
          </p>

          <p className="text-xs text-slate-500">
            For educational use only.
          </p>
        </div>
      </footer>
    </main>
  );
}
