"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyzeWebsite = async () => {
    if (!url) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `https://hook.us2.make.com/rzm6lhgit29f5zgtqtkm0vgloxms1iyh?url=${encodeURIComponent(url)}`
      );

      const data = await response.json();
      setResult(data);
    } catch (error) {
      alert("Error calling backend");
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
      
      {/* Input Card */}
      <div className="w-full max-w-xl bg-white shadow-md rounded-xl p-6">
        <h1 className="text-2xl font-semibold mb-4">
          Performance Intelligence Engine
        </h1>

        <input
          type="text"
          placeholder="Enter website URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-gray-300 rounded-md p-3 mb-4"
        />

        <button
          onClick={analyzeWebsite}
          disabled={loading}
          className="w-full bg-black text-white rounded-md p-3"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {/* Results Card */}
      {result && result.summary && (
  <div className="w-full max-w-xl mt-8 bg-white shadow-md rounded-xl p-6 space-y-6">

    <div>
      <h2 className="text-2xl font-bold">
        {result.summary.overall_health_display}
      </h2>
      <p>
        Risk Level: <strong>{result.summary.risk_level}</strong>
      </p>
      <p className="mt-2">
        {result.summary.executive_summary}
      </p>
    </div>

    {result.risk_breakdown && (
      <div>
        <h3 className="font-semibold mb-2">Risk Breakdown</h3>
        <ul className="text-sm space-y-1">
          <li>Speed: {result.risk_breakdown.speed_risk_score}</li>
          <li>UX: {result.risk_breakdown.ux_risk_score}</li>
          <li>SEO: {result.risk_breakdown.seo_risk_score}</li>
          <li>Conversion: {result.risk_breakdown.conversion_risk_score}</li>
          <li>Scaling: {result.risk_breakdown.scaling_risk_score}</li>
        </ul>
      </div>
    )}

    {Array.isArray(result.top_issues) && (
      <div>
        <h3 className="font-semibold mb-2">Top 3 Issues</h3>
        <ul className="text-sm space-y-2">
          {result.top_issues.map((item: any, index: number) => (
            <li key={index}>• {item.issue}</li>
          ))}
        </ul>
      </div>
    )}

    {Array.isArray(result.prioritized_actions) && (
      <div>
        <h3 className="font-semibold mb-2">Top 3 Actions</h3>
        <ul className="text-sm space-y-2">
          {result.prioritized_actions.map((item: any, index: number) => (
            <li key={index}>• {item.action}</li>
          ))}
        </ul>
      </div>
    )}

  </div>
)}


    </main>
  );
}
