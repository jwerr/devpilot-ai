
import { useState } from "react";
import "./App.css";

const INITIAL_QUESTION =
  "Investigate PR #1, review its code changes, check CI results, " +
  "and explain any confirmed issues using GitHub evidence.";

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

async function readResponse(response) {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      `Empty server response (HTTP ${response.status}). Check API logs.`
    );
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid JSON from server (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

const REPORT_TYPES = {
  pr_review: "Pull Request Review",
  ci_analysis: "CI Failure Investigation",
  multi_tool: "Unified Investigation",
};

export default function App() {
  const [mode, setMode] = useState("pr");

  const [owner, setOwner] = useState("jwerr");
  const [repo, setRepo] = useState("MCP_Server");
  const [pr, setPr] = useState("1");
  const [runId, setRunId] = useState("41312676761");
  const [question, setQuestion] = useState(INITIAL_QUESTION);

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Agent Evaluation state
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationLoading, setEvaluationLoading] =
    useState(false);
  const [evaluationError, setEvaluationError] =
    useState("");

  function changeMode(nextMode) {
    if (loading) return;

    setMode(nextMode);
    setResult(null);
    setError("");

    if (nextMode === "history") {
      void loadHistory();
    }

    if (nextMode === "evaluation") {
      void loadEvaluation();
    }
  }

  // -----------------------------------
  // PR Review / CI Analysis
  // -----------------------------------
  async function analyze(event) {
    event.preventDefault();

    const isPR = mode === "pr";
    const numericId = Number(isPR ? pr : runId);

    if (
      !Number.isSafeInteger(numericId) ||
      numericId <= 0
    ) {
      setError(
        "Enter a valid positive PR number or workflow run ID."
      );
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch(
        isPR ? "/api/review-pr" : "/api/analyze-ci",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner: owner.trim(),
            repo: repo.trim(),
            ...(isPR
              ? { pull_number: numericId }
              : { run_id: numericId }),
          }),
        }
      );

      setResult(await readResponse(response));
    } catch (err) {
      setError(err.message || "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------------
  // Unified Multi-Tool Investigation
  // -----------------------------------
  async function runUnifiedInvestigation(event) {
    event.preventDefault();

    const prompt = question.trim();

    if (
      prompt.length < 10 ||
      prompt.length > 1000
    ) {
      setError(
        "Investigation request must contain 10–1000 characters."
      );
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch(
        "/api/investigate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner: owner.trim(),
            repo: repo.trim(),
            question: prompt,
          }),
        }
      );

      setResult(await readResponse(response));
    } catch (err) {
      setError(
        err.message || "Unified investigation failed."
      );
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------------
  // Analysis History
  // -----------------------------------
  async function loadHistory() {
    setHistoryLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/reports?limit=50"
      );

      const data = await readResponse(response);

      if (!Array.isArray(data)) {
        throw new Error(
          "Unexpected history response format."
        );
      }

      setHistory(data);
    } catch (err) {
      setError(
        err.message || "Unable to retrieve reports."
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function openSavedReport(item) {
    const [savedOwner, savedRepo] =
      (item.repository || "").split("/");

    if (savedOwner && savedRepo) {
      setOwner(savedOwner);
      setRepo(savedRepo);
    }

    setError("");

    if (item.type === "multi_tool") {
      setMode("agent");

      setQuestion(
        item.result?.question || INITIAL_QUESTION
      );

      setResult({
        repository: item.repository,
        answer:
          item.result?.answer ||
          "No answer stored.",
        tool_calls:
          item.result?.tool_calls || [],
        tool_call_count:
          item.result?.tool_calls?.length || 0,
        report_id: item.id,
        saved: true,
      });
    } else if (item.type === "ci_analysis") {
      setMode("ci");
      setRunId(String(item.reference_id));

      setResult({
        repository: item.repository,
        run_id: item.reference_id,
        analysis: item.result,
        report_id: item.id,
        saved: true,
      });
    } else if (item.type === "pr_review") {
      setMode("pr");
      setPr(String(item.reference_id));

      setResult({
        repository: item.repository,
        pull_number: item.reference_id,
        review: item.result,
        report_id: item.id,
        saved: true,
      });
    } else {
      setError(
        `Unsupported report type: ${item.type}`
      );
    }
  }

  // -----------------------------------
  // Agent Evaluation
  // -----------------------------------
  async function loadEvaluation() {
    setEvaluationLoading(true);
    setEvaluationError("");

    try {
      const response = await fetch(
        "/api/evaluations/latest"
      );

      const data = await readResponse(response);

      if (!data || typeof data !== "object") {
        throw new Error(
          "Unexpected evaluation response."
        );
      }

      setEvaluation(data);
    } catch (err) {
      setEvaluation(null);
      setEvaluationError(
        err.message ||
          "Unable to retrieve evaluation results."
      );
    } finally {
      setEvaluationLoading(false);
    }
  }

  const report =
    mode === "pr"
      ? result?.review
      : mode === "ci"
        ? result?.analysis
        : null;

  const toolCalls = Array.isArray(
    result?.tool_calls
  )
    ? result.tool_calls
    : [];

  return (
    <main className="dashboard">
      <header>
        <div className="eyebrow">
          MCP · LANGGRAPH · GITHUB
        </div>

        <h1>DevPilot AI</h1>

        <p>
          Intelligent Developer Productivity Assistant
        </p>
      </header>

      <section className="panel">
        {/* Navigation */}
        <nav
          className="tabs"
          aria-label="DevPilot features"
        >
          {[
            ["pr", "Pull Request Review"],
            ["ci", "CI Failure Analysis"],
            ["agent", "Unified Investigation"],
            ["history", "Analysis History"],
            ["evaluation", "Agent Evaluation"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                mode === value ? "active" : ""
              }
              aria-pressed={mode === value}
              disabled={loading}
              onClick={() => changeMode(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* PR / CI Forms */}
        {(mode === "pr" || mode === "ci") && (
          <form onSubmit={analyze}>
            <label>
              GitHub Owner
              <input
                value={owner}
                onChange={(e) =>
                  setOwner(e.target.value)
                }
                required
              />
            </label>

            <label>
              Repository
              <input
                value={repo}
                onChange={(e) =>
                  setRepo(e.target.value)
                }
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
                value={
                  mode === "pr" ? pr : runId
                }
                onChange={(e) =>
                  mode === "pr"
                    ? setPr(e.target.value)
                    : setRunId(e.target.value)
                }
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

        {/* Unified Investigation Form */}
        {mode === "agent" && (
          <form
            onSubmit={runUnifiedInvestigation}
          >
            <label>
              GitHub Owner
              <input
                value={owner}
                onChange={(e) =>
                  setOwner(e.target.value)
                }
                required
              />
            </label>

            <label>
              Repository
              <input
                value={repo}
                onChange={(e) =>
                  setRepo(e.target.value)
                }
                required
              />
            </label>

            <label>
              Investigation Request
              <textarea
                rows={5}
                minLength={10}
                maxLength={1000}
                value={question}
                onChange={(e) =>
                  setQuestion(e.target.value)
                }
                required
              />
            </label>

            <p className="meta">
              Read-only GitHub MCP tools
              · 8-call target budget
            </p>

            <button
              className="submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Investigating..."
                : "Run Unified Investigation"}
            </button>
          </form>
        )}

        {/* Analysis History */}
        {mode === "history" && (
          <section className="history">
            <div className="history-header">
              <h2>Previous Analyses</h2>

              <button
                type="button"
                onClick={loadHistory}
                disabled={historyLoading}
              >
                {historyLoading
                  ? "Loading..."
                  : "Refresh"}
              </button>
            </div>

            {historyLoading && (
              <p>Loading saved reports...</p>
            )}

            {!historyLoading &&
              history.length === 0 && (
                <p>No reports saved yet.</p>
              )}

            {!historyLoading &&
              history.map((item) => (
                <article
                  className="finding history-item"
                  key={item.id}
                >
                  <h3>
                    {REPORT_TYPES[item.type] ||
                      item.type}
                  </h3>

                  <p className="meta">
                    {item.repository}
                  </p>

                  {item.type === "pr_review" && (
                    <p>
                      Pull Request: #
                      {item.reference_id}
                    </p>
                  )}

                  {item.type === "ci_analysis" && (
                    <p>
                      Workflow Run:{" "}
                      {item.reference_id}
                    </p>
                  )}

                  {item.type === "multi_tool" && (
                    <p>
                      {item.result?.question ||
                        "Unified investigation"}
                    </p>
                  )}

                  <p className="meta">
                    {formatDate(item.created_at)}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      openSavedReport(item)
                    }
                  >
                    View Report
                  </button>
                </article>
              ))}
          </section>
        )}

        {/* Agent Evaluation Dashboard */}
        {mode === "evaluation" && (
          <section className="evaluation">
            <div className="history-header">
              <h2>
                Agent Performance Evaluation
              </h2>

              <button
                type="button"
                onClick={loadEvaluation}
                disabled={evaluationLoading}
              >
                {evaluationLoading
                  ? "Loading..."
                  : "Refresh"}
              </button>
            </div>

            <p className="meta">
              Performance metrics from saved
              benchmark results.
            </p>

            {evaluationLoading && (
              <p>Loading evaluation metrics...</p>
            )}

            {evaluationError && (
              <div
                className="error"
                role="alert"
              >
                {evaluationError}
              </div>
            )}

            {!evaluationLoading &&
              evaluation && (
                <>
                  <div className="evaluation-grid">
                    <article className="finding">
                      <h3>Success Rate</h3>
                      <p className="metric">
                        {evaluation.success_rate ==
                        null
                          ? "N/A"
                          : `${evaluation.success_rate}%`}
                      </p>
                    </article>

                    <article className="finding">
                      <h3>
                        Average Latency
                      </h3>
                      <p className="metric">
                        {evaluation.average_latency_seconds ==
                        null
                          ? "N/A"
                          : `${evaluation.average_latency_seconds}s`}
                      </p>
                    </article>

                    <article className="finding">
                      <h3>
                        Average MCP Calls
                      </h3>
                      <p className="metric">
                        {evaluation.average_mcp_calls ??
                          "N/A"}
                      </p>
                    </article>

                    <article className="finding">
                      <h3>
                        Within Tool Budget
                      </h3>
                      <p className="metric">
                        {evaluation.within_tool_budget ??
                          0}
                        /
                        {evaluation.total ?? 0}
                      </p>
                    </article>
                  </div>

                  <p className="meta">
                    Successful scenarios:{" "}
                    {evaluation.successful ?? 0}
                    /
                    {evaluation.total ?? 0}
                  </p>

                  <p className="meta">
                    Last evaluated:{" "}
                    {formatDate(
                      evaluation.timestamp
                    )}
                  </p>

                  <p className="meta">
                    Diagnostic accuracy:{" "}
                    {evaluation.diagnostic_accuracy ==
                    null
                      ? "Not yet graded"
                      : evaluation.diagnostic_accuracy}
                  </p>

                  <p className="meta">
                    Success rate measures
                    completed responses, not
                    root-cause correctness.
                  </p>
                </>
              )}
          </section>
        )}
      </section>

      {/* General API Errors */}
      {error && (
        <section
          className="error"
          role="alert"
        >
          {error}
        </section>
      )}

      {/* PR / CI Reports */}
      {report && (
        <section className="panel result">
          <h2>
            {mode === "pr"
              ? "AI Code Review"
              : "CI Investigation Report"}
          </h2>

          <p className="meta">
            {result.repository}
          </p>

          {result.report_id && (
            <p className="saved-label">
              {result.saved
                ? "Saved report"
                : "Report saved"}{" "}
              #{result.report_id}
            </p>
          )}

          {mode === "pr" ? (
            <>
              <h3>Summary</h3>
              <p>{report.summary}</p>

              <div className="risk">
                Overall Risk:{" "}
                {report.overall_risk}
              </div>

              {report.findings?.length > 0 ? (
                report.findings.map(
                  (finding, index) => (
                    <article
                      className="finding"
                      key={index}
                    >
                      <strong>
                        {finding.severity?.toUpperCase()}
                        {" · "}
                        {finding.filename}:
                        {finding.line}
                      </strong>

                      <h3>{finding.issue}</h3>
                      <p>
                        {finding.explanation}
                      </p>

                      <h4>Suggested Fix</h4>
                      <pre>
                        {finding.suggested_fix}
                      </pre>
                    </article>
                  )
                )
              ) : (
                <p>
                  No concrete code defects
                  identified in the supplied
                  changes.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="risk">
                Confidence:{" "}
                {report.confidence}
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

      {/* Unified Investigation Results */}
      {mode === "agent" &&
        result?.answer != null && (
          <section className="panel result">
            <h2>
              Unified Investigation Report
            </h2>

            <p className="meta">
              {result.repository}
            </p>

            {result.report_id && (
              <p className="saved-label">
                {result.saved
                  ? "Saved report"
                  : "Report saved"}{" "}
                #{result.report_id}
              </p>
            )}

            <div className="risk">
              MCP Tool Calls:{" "}
              {result.tool_call_count ??
                toolCalls.length}
            </div>

            <h3>Investigation Results</h3>

            <div className="agent-answer">
              {result.answer}
            </div>

            <h3>Tool Execution Trace</h3>

            {toolCalls.length === 0 && (
              <p>
                No MCP tool calls were recorded.
              </p>
            )}

            {toolCalls.map(
              (call, index) => (
                <article
                  className="finding"
                  key={index}
                >
                  <strong>
                    {index + 1}.{" "}
                    {call.tool}
                  </strong>

                  <pre>
                    {JSON.stringify(
                      call.arguments || {},
                      null,
                      2
                    )}
                  </pre>
                </article>
              )
            )}
          </section>
        )}

      <footer className="app-footer">
        DevPilot AI · GitHub MCP ·
        LangGraph · FastAPI
      </footer>
    </main>
  );
}
