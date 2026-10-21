"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API = "http://127.0.0.1:8000";

type CaseItem = {
  case_id: string;
  title: string;
  subtitle?: string;
  short_brief?: string;
  difficulty?: string;
  specialty?: string;
  setting?: string;
  estimated_duration_minutes?: number;
  thumbnail?: string;
  patient?: {
    age?: string;
    sex?: string;
  };
};

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/cases`)
      .then((res) => res.json())
      .then((data) => setCases(data.cases || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <p className="text-sm font-medium text-cyan-400">MedTwin AI</p>
          <h1 className="mt-2 text-4xl font-bold">Clinical Cases</h1>
          <p className="mt-3 text-slate-400">
            Choose a patient scenario and begin your clinical simulation.
          </p>
        </div>

        {loading && <p className="text-slate-400">Loading cases...</p>}

        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {cases.map((item) => {
            const imageUrl = item.thumbnail
              ? `${API}/case-assets/${item.thumbnail}`
              : "";

            return (
              <div
                key={item.case_id}
                className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900"
              >
                <div className="aspect-video bg-slate-800">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="p-6">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {item.specialty && (
                      <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                        {item.specialty}
                      </span>
                    )}

                    {item.difficulty && (
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                        {item.difficulty}
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl font-semibold">{item.title}</h2>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
                    {item.short_brief}
                  </p>

                  <div className="mt-5 flex gap-4 text-sm text-slate-400">
                    <span>{item.patient?.age}</span>
                    <span>{item.patient?.sex}</span>
                    {item.estimated_duration_minutes && (
                      <span>{item.estimated_duration_minutes} min</span>
                    )}
                  </div>

                  <Link
                    href={`/session/${item.case_id}`}
                    className="mt-6 block rounded-xl bg-cyan-500 px-5 py-3 text-center font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    Start Case
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
