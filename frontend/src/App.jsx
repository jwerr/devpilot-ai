
import { useState } from "react";
import "./App.css";

export default function App() {
  // ------------------------------------
  // Application state
  // ------------------------------------
  const [mode, setMode] = useState("pr");

  const [owner, setOwner] = useState("jwerr");
  const [repo, setRepo] = useState("MCP_Server");
  const [pr, setPr] = useState("1");
  const [runId, setRunId] = useState("41312676761");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ------------------------------------
  // Read an API response safely
  // ------------------------------------
  async function readResponse(response) {
    const raw = await response.text();

    if (!raw.trim()) {
      throw new Error(
        `Empty server response (HTTP ${response.status}). ` +
        "Check the FastAPI terminal."
      );
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Invalid JSON response (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : `Request failed: HTTP ${response.status}`
      );
    }

    return data;
  }

  // ------------------------------------
  // Switch dashboard tabs
  // ------------------------------------
  function changeMode(nextMode) {
    setMode(nextMode);
    setResult(null);
    setError("");

    if (nextMode === "history") {
      loadHistory();
    }
  }

  // ------------------------------------
  // Run PR review or CI investigation
  // ------------------------------------
  async function analyze(event) {
    event.preventDefault();

    const isPR = mode === "pr";
    const number = Number(isPR ? pr : runId);

    if (!Number.isSafeInteger(number) || number <= 0) {
      setError("Please enter a valid positive number.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");

    try {
      const endpoint = isPR
        ? "/api/review-pr"
        : "/api/analyze-ci";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          ...(isPR
            ? { pull_number: number }
            : { run_id: number }),
        }),
      });

      const data = await readResponse(response);
      setResult(data);
    } catch (err) {
      setError(err.message || "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------
  // Load saved reports
  // ------------------------------------
  async function loadHistory() {
    setHistoryLoading(true);
    setError("");

    try {
      const response = await fetch("/api/reports?limit=50");
      const data = await readResponse(response);

      if (!Array.isArray(data)) {
        throw new Error("Unexpected report history format.");
      }

      setHistory(data);
    } catch (err) {
      setError(err.message || "Unable to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // ------------------------------------
  // Open a saved report without an LLM call
  // ------------------------------------
  function openSavedReport(item) {
    const isCI = item.type === "ci_analysis";

    setError("");
    setMode(isCI ? "ci" : "pr");

    const [savedOwner, savedRepo] = item.repository.split("/");

    if (savedOwner && savedRepo) {
      setOwner(savedOwner);
      setRepo(savedRepo);
    }

    if (isCI) {
      setRunId(String(item.reference_id));
      setResult({
        repository: item.repository,
        run_id: item.reference_id,
        analysis: item.result,
        saved: true,
        report_id: item.id,
      });
    } else {
      setPr(String(item.reference_id));
      setResult({
        repository: item.repository,
        pull_number: item.reference_id,
        review: item.result,
        saved: true,
        report_id: item.id,
      });
    }
  }

  // ------------------------------------
  // Report content
  // ------------------------------------
  const report = result?.review || result?.analysis;

  return (
    <main className="dashboard">
      {/* Header */}
      <header>
        <div className="eyebrow">
          MCP · LANGGRAPH · GITHUB
        </div>

        <h1>DevPilot AI</h1>

        <p>
          Intelligent Developer Productivity Assistant
        </p>
      </header>

      {/* Main application */}
      <section className="panel">
        {/* Navigation tabs */}
        <div className="tabs">
          <button
            type="button"
            className={mode === "pr" ? "active" : ""}
            onClick={() => changeMode("pr")}
          >
            Pull Request Review
          </button>

          <button
            type="button"
            className={mode === "ci" ? "active" : ""}
            onClick={() => changeMode("ci")}
          >
            CI Failure Analysis
          </button>

          <button
            type="button"
            className={mode === "history" ? "active" : ""}
            onClick={() => changeMode("history")}
          >
            Analysis History
          </button>
        </div>

        {/* PR and CI form */}
        {mode !== "history" && (
          <form onSubmit={analyze}>
            <label>
              GitHub Owner
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
              />
            </label>

            <label>
              Repository
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                required
              />
            </label>

            <label>
              {mode === "pr"
                ? "Pull Request Number"
                : "Workflow Run ID"}

              <input
                type="number"
                min="1"
                step="1"
                value={mode === "pr" ? pr : runId}
                onChange={(e) => {
                  if (mode === "pr") {
                    setPr(e.target.value);
                  } else {
                    setRunId(e.target.value);
                  }
                }}
                required
              />
            </label>

            <button
              className="submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Analyzing..."
                : mode === "pr"
                  ? "Review Pull Request"
                  : "Investigate CI Failure"}
            </button>
          </form>
        )}

        {/* Analysis history */}
        {mode === "history" && (
          <section className="history">
            <div className="history-header">
              <h2>Previous Analyses</h2>

              <button
                type="button"
                onClick={loadHistory}
                disabled={historyLoading}
              >
                {historyLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {historyLoading && (
              <p>Loading saved reports...</p>
            )}

            {!historyLoading && history.length === 0 && (
              <p>
                No saved reports yet. Run a PR review or
                CI investigation to create your first report.
              </p>
            )}

            {!historyLoading &&
              history.map((item) => (
                <article
                  className="finding history-item"
                  key={item.id}
                >
                  <h3>
                    {item.type === "ci_analysis"
                      ? "CI Failure Investigation"
                      : "Pull Request Review"}
                  </h3>

                  <p className="meta">
                    {item.repository}
                  </p>

                  <p>
                    {item.type === "ci_analysis"
                      ? `Workflow Run: ${item.reference_id}`
                      : `Pull Request: #${item.reference_id}`}
                  </p>

                  <p className="meta">
                    {item.created_at
                      ? new Date(
                          item.created_at
                        ).toLocaleString()
                      : "Date unavailable"}
                  </p>

                  <button
                    type="button"
                    onClick={() => openSavedReport(item)}
                  >
                    View Report
                  </button>
                </article>
              ))}
          </section>
        )}
      </section>

      {/* API errors */}
      {error && (
        <section className="error" role="alert">
          {error}
        </section>
      )}

      {/* Analysis results */}
      {report && mode !== "history" && (
        <section className="panel result">
          <h2>
            {mode === "pr"
              ? "AI Code Review"
              : "CI Investigation Report"}
          </h2>

          <p className="meta">{result.repository}</p>

          {result.saved && (
            <p className="saved-label">
              Saved Report #{result.report_id}
            </p>
          )}

          {result.report_id && !result.saved && (
            <p className="saved-label">
              Report saved successfully
              {" · "}ID #{result.report_id}
            </p>
          )}

          {/* PR Review report */}
          {mode === "pr" && (
            <>
              <h3>Summary</h3>
              <p>{report.summary}</p>

              <div className="risk">
                Overall Risk: {report.overall_risk}
              </div>

              {report.findings?.length > 0 ? (
                report.findings.map((item, index) => (
                  <article
                    className="finding"
                    key={index}
                  >
                    <strong>
                      {item.severity?.toUpperCase()}
                      {" · "}
                      {item.filename}:{item.line}
                    </strong>

                    <h3>{item.issue}</h3>
                    <p>{item.explanation}</p>

                    <h4>Suggested Fix</h4>
                    <pre>{item.suggested_fix}</pre>
                  </article>
                ))
              ) : (
                <p>
                  No concrete code defects identified
                  in the supplied changes.
                </p>
              )}
            </>
          )}

          {/* CI investigation report */}
          {mode === "ci" && (
            <>
              <div className="risk">
                Confidence: {report.confidence}
              </div>

              <h3>Root Cause</h3>
              <p>{report.root_cause}</p>

              <h3>Error Type</h3>
              <p>{report.error_type}</p>

              <h3>Evidence</h3>
              <pre>{report.evidence}</pre>

              <h3>Suggested Fix</h3>
              <p>{report.suggested_fix}</p>
            </>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="app-footer">
        DevPilot AI · GitHub MCP · LangGraph · FastAPI
      </footer>
    </main>
  );
}
