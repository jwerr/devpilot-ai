import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DEFAULT_QUESTION =
  "Investigate PR #1. Review the changed files, check CI results, and explain confirmed issues with GitHub evidence.";

const NAV = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "pr", label: "Pull Request Review", icon: "git" },
  { id: "ci", label: "CI Failure Analysis", icon: "activity" },
  { id: "agent", label: "Unified Investigation", icon: "spark" },
  { id: "history", label: "Analysis History", icon: "clock" },
  { id: "evaluation", label: "Agent Evaluation", icon: "chart" },
];

const ICON_PATHS = {
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"],
  git: ["M6 3v12", "M18 6a3 3 0 0 0-3 3v3a6 6 0 0 1-6 6H6", "M6 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4", "M18 2a2 2 0 1 0 0 4a2 2 0 1 0 0-4", "M6 17a2 2 0 1 0 0 4a2 2 0 1 0 0-4"],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
  spark: ["m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z", "M19 18v4", "M17 20h4"],
  clock: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M12 7v5l3 2"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-8", "M22 20H2"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  chevron: ["m9 18 6-6-6-6"],
  refresh: ["M20 11a8 8 0 0 0-14-5L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14 5l2-2", "M16 16h4v4"],
  check: ["m5 12 4 4L19 6"],
  alert: ["M12 3 2 21h20L12 3z", "M12 9v4", "M12 17h.01"],
  copy: ["M8 8h12v13H8z", "M4 16H3V3h13v1"],
  external: ["M14 4h6v6", "M20 4 10 14", "M20 13v7H4V4h7"],
  code: ["m8 8-4 4 4 4", "m16 8 4 4-4 4", "m14 4-4 16"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M5 5l14 14", "M19 5 5 19"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9 12 2 2 4-4"],
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      {(ICON_PATHS[name] || ICON_PATHS.grid).map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`Unexpected response from server (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function readable(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
}

function reportTitle(type) {
  return ({ pr_review: "Pull Request Review", ci_analysis: "CI Failure Analysis", multi_tool: "Unified Investigation" })[type] || type || "Analysis";
}

function Pill({ children, tone = "neutral" }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

function Empty({ title, children, icon = "code" }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} size={23} /></div>
      <h3>{title}</h3><p>{children}</p>
    </div>
  );
}

function Stat({ label, value, detail, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top"><span>{label}</span><Icon name={icon} size={17} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [owner, setOwner] = useState("jwerr");
  const [repo, setRepo] = useState("MCP_Server");
  const [pr, setPr] = useState("1");
  const [runId, setRunId] = useState("41312676761");
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [health, setHealth] = useState("checking");
  const [copied, setCopied] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await api("/api/reports?limit=50");
      if (!Array.isArray(rows)) throw new Error("Invalid history format returned by API.");
      setHistory(rows);
    } catch (err) {
      setError(err.message || "Could not load saved reports.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadEvaluation = useCallback(async () => {
    setEvaluationLoading(true);
    setEvaluationError("");
    try {
      setEvaluation(await api("/api/evaluations/latest"));
    } catch (err) {
      setEvaluation(null);
      setEvaluationError(err.message || "Could not load evaluation metrics.");
    } finally {
      setEvaluationLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api("/health").then(() => { if (active) setHealth("online"); })
      .catch(() => { if (active) setHealth("offline"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (mode === "history" || mode === "overview") void loadHistory();
    if (mode === "evaluation" || mode === "overview") void loadEvaluation();
  }, [mode, loadHistory, loadEvaluation]);

  function navigate(next) {
    if (loading) return;
    setMode(next);
    setResult(null);
    setError("");
    setMobileMenu(false);
  }

  async function runAnalysis(event) {
    event.preventDefault();
    const isPR = mode === "pr";
    const id = Number(isPR ? pr : runId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      setError("Enter a valid positive PR number or workflow run ID.");
      return;
    }
    setLoading(true); setError(""); setResult(null);
    try {
      const payload = { owner: owner.trim(), repo: repo.trim(),
        ...(isPR ? { pull_number: id } : { run_id: id }) };
      const data = await api(isPR ? "/api/review-pr" : "/api/analyze-ci", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setResult(data);
    } catch (err) { setError(err.message || "Analysis failed."); }
    finally { setLoading(false); }
  }

  async function runInvestigation(event) {
    event.preventDefault();
    const prompt = question.trim();
    if (prompt.length < 10 || prompt.length > 1000) {
      setError("Investigation request must be 10–1000 characters.");
      return;
    }
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await api("/api/investigate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: owner.trim(), repo: repo.trim(), question: prompt }),
      });
      setResult(data);
    } catch (err) { setError(err.message || "Investigation failed."); }
    finally { setLoading(false); }
  }

  function openSaved(item) {
    const [savedOwner, savedRepo] = (item.repository || "").split("/");
    if (savedOwner && savedRepo) { setOwner(savedOwner); setRepo(savedRepo); }
    setError("");
    if (item.type === "multi_tool") {
      setMode("agent"); setQuestion(item.result?.question || DEFAULT_QUESTION);
      setResult({ repository: item.repository, answer: item.result?.answer || "No saved answer.",
        tool_calls: item.result?.tool_calls || [], report_id: item.id, saved: true });
    } else if (item.type === "ci_analysis") {
      setMode("ci"); setRunId(String(item.reference_id));
      setResult({ repository: item.repository, analysis: item.result, report_id: item.id, saved: true });
    } else if (item.type === "pr_review") {
      setMode("pr"); setPr(String(item.reference_id));
      setResult({ repository: item.repository, review: item.result, report_id: item.id, saved: true });
    } else {
      setError(`Unsupported report type: ${item.type}`);
    }
  }

  async function copyReport() {
    const text = mode === "agent" ? readable(result?.answer) : readable(result?.review || result?.analysis);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError("Clipboard access was denied by your browser."); }
  }

  const page = NAV.find((item) => item.id === mode) || NAV[0];
  const report = mode === "pr" ? result?.review : mode === "ci" ? result?.analysis : null;
  const toolCalls = Array.isArray(result?.tool_calls) ? result.tool_calls : [];
  const recentReports = useMemo(() => history.slice(0, 5), [history]);
  const repoUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const hasResult = (mode === "agent" && result?.answer != null) || !!report;

  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? "sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Icon name="spark" size={22} /></div>
          <div><strong>DevPilot <span>AI</span></strong><small>DEVELOPER INTELLIGENCE</small></div>
          <button className="icon-button close-menu" onClick={() => setMobileMenu(false)} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Primary navigation">
          {NAV.map((item) => (
            <button key={item.id} type="button" disabled={loading}
              className={`nav-link ${mode === item.id ? "nav-link--active" : ""}`}
              onClick={() => navigate(item.id)} aria-current={mode === item.id ? "page" : undefined}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
              {mode === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-title"><span className={`status-dot ${health === "online" ? "status-dot--online" : ""}`} /> Backend {health === "online" ? "connected" : health === "checking" ? "checking" : "unavailable"}</div>
            <div className="connection-meta">FastAPI · GitHub MCP</div>
          </div>
          <div className="sidebar-footer"><Icon name="shield" size={15} /> Read-only investigation tools</div>
        </div>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Icon name="menu" /></button>
            <span className="breadcrumb">Workspace</span><Icon name="chevron" size={14} /><strong>{page.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment"><span className="status-dot status-dot--online" /> LOCAL ENVIRONMENT</span>
            <a className="topbar-repo" href={repoUrl} target="_blank" rel="noreferrer"><Icon name="git" size={15} /> {owner}/{repo} <Icon name="external" size={13} /></a>
          </div>
        </div>

        <main className="content">
          <div className="page-heading">
            <div><div className="eyebrow">DEV PILOT / {mode.toUpperCase()}</div>
              <h1>{mode === "overview" ? "Developer command center" : page.label}</h1>
              <p>{({ overview: "Investigate, understand, and resolve engineering issues with AI-powered tools.",
                pr: "Review pull request changes and surface actionable code findings.",
                ci: "Trace failing GitHub Actions runs to their likely root causes.",
                agent: "Ask one question. Let the agent choose the right GitHub tools.",
                history: "Revisit previous analyses without generating new AI responses.",
                evaluation: "Measure real-world agent performance from saved benchmarks." })[mode]}</p>
            </div>
            {(mode === "history" || mode === "evaluation") && (
              <button className="button button--secondary" onClick={mode === "history" ? loadHistory : loadEvaluation}
                disabled={mode === "history" ? historyLoading : evaluationLoading}>
                <Icon name="refresh" size={16} /> Refresh
              </button>
            )}
          </div>

          {mode === "overview" && (
            <>
              <div className="hero">
                <div><Pill tone="accent">AGENTIC DEVELOPER WORKSPACE</Pill>
                  <h2>From GitHub signals<br />to <span>actionable answers.</span></h2>
                  <p>Review code, investigate failing pipelines, and trace every tool your AI agent uses—all in one place.</p>
                  <button className="button button--primary" onClick={() => navigate("agent")}>Start investigation <Icon name="arrow" size={17} /></button>
                </div>
                <div className="hero-visual" aria-hidden="true"><div className="hero-orbit"><Icon name="spark" size={40} /></div><div className="hero-connector" /><div className="hero-small"><Icon name="code" size={22} /></div><div className="hero-small second"><Icon name="activity" size={22} /></div></div>
              </div>
              <div className="stats-grid">
                <Stat label="Saved analyses" value={history.length} detail="Latest 50 reports" icon="clock" />
                <Stat label="Benchmark success" value={evaluation?.success_rate != null ? `${evaluation.success_rate}%` : "—"} detail="Operational response success" icon="check" />
                <Stat label="Avg. agent latency" value={evaluation?.average_latency_seconds != null ? `${evaluation.average_latency_seconds}s` : "—"} detail="Latest benchmark" icon="activity" />
                <Stat label="Avg. MCP calls" value={evaluation?.average_mcp_calls ?? "—"} detail="Per benchmark scenario" icon="git" />
              </div>
              <div className="two-columns">
                <section className="surface-card">
                  <div className="section-heading"><div><h2>Quick actions</h2><p>Start a new engineering analysis</p></div></div>
                  {NAV.filter((item) => ["pr", "ci", "agent"].includes(item.id)).map((item) => (
                    <button className="quick-action" key={item.id} onClick={() => navigate(item.id)}>
                      <span className="quick-icon"><Icon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.id === "pr" ? "Find bugs in code changes" : item.id === "ci" ? "Diagnose workflow failures" : "Investigate across multiple tools"}</small></span><Icon name="arrow" size={17} />
                    </button>
                  ))}
                </section>
                <section className="surface-card">
                  <div className="section-heading"><div><h2>Recent activity</h2><p>Reports from your SQLite history</p></div><button className="text-button" onClick={() => navigate("history")}>View all <Icon name="arrow" size={14} /></button></div>
                  {historyLoading && <p className="muted">Loading reports…</p>}
                  {!historyLoading && recentReports.length === 0 && <Empty title="No reports yet" icon="clock">Run an analysis to populate activity.</Empty>}
                  {recentReports.map((item) => (
                    <button className="recent-item" key={item.id} onClick={() => openSaved(item)}>
                      <span className="recent-icon"><Icon name={item.type === "ci_analysis" ? "activity" : item.type === "multi_tool" ? "spark" : "git"} size={17} /></span>
                      <span><strong>{reportTitle(item.type)}</strong><small>{item.repository} · {formatDate(item.created_at)}</small></span><Icon name="chevron" size={15} />
                    </button>
                  ))}
                </section>
              </div>
            </>
          )}

          {(mode === "pr" || mode === "ci" || mode === "agent") && (
            <div className="workspace-grid">
              <section className="surface-card input-card">
                <div className="section-heading"><div><h2>{mode === "agent" ? "Investigation request" : "Configure analysis"}</h2><p>Choose the repository and provide a task</p></div><span className="section-symbol"><Icon name={page.icon} /></span></div>
                <form onSubmit={mode === "agent" ? runInvestigation : runAnalysis}>
                  <div className="form-row">
                    <label className="form-field"><span>GitHub owner</span><input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" required /></label>
                    <label className="form-field"><span>Repository</span><input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Repository" required /></label>
                  </div>
                  {mode === "agent" ? (
                    <label className="form-field"><span>What should the agent investigate?</span><textarea rows={7} minLength={10} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about a PR, CI run, or repository issue…" required /><small>{question.length}/1000 characters</small></label>
                  ) : (
                    <label className="form-field"><span>{mode === "pr" ? "Pull request number" : "Workflow run ID"}</span><input type="number" min="1" step="1" value={mode === "pr" ? pr : runId} onChange={(e) => mode === "pr" ? setPr(e.target.value) : setRunId(e.target.value)} required /></label>
                  )}
                  <div className="form-note"><Icon name="shield" size={16} /> GitHub MCP access is configured as read-only.</div>
                  <button className="button button--primary button--full" disabled={loading} type="submit">
                    {loading ? <><span className="spinner" /> Running analysis…</> : <><Icon name={mode === "agent" ? "spark" : "arrow"} size={17} /> {mode === "pr" ? "Review pull request" : mode === "ci" ? "Analyze CI failure" : "Run investigation"}</>}
                  </button>
                </form>
              </section>
              <section className="surface-card results-card">
                <div className="section-heading"><div><h2>Analysis output</h2><p>Evidence-based findings and recommendations</p></div>{hasResult && <button className="icon-button" title={copied ? "Copied" : "Copy report"} onClick={copyReport}><Icon name={copied ? "check" : "copy"} /></button>}</div>
                {error && <div className="error-banner" role="alert"><Icon name="alert" /> <span>{error}</span></div>}
                {loading && <div className="loading-state"><span className="spinner spinner--large" /><h3>Analyzing GitHub evidence</h3><p>Your agent is working. Complex investigations can take a little longer.</p></div>}
                {!loading && !hasResult && <Empty title="Ready when you are" icon={mode === "agent" ? "spark" : "code"}>Configure an analysis on the left to see the report and evidence here.</Empty>}
                {!loading && hasResult && (
                  <div className="report-content">
                    <div className="report-meta"><Pill tone="success">{result.saved ? "SAVED REPORT" : "COMPLETE"}</Pill><span>{result.repository}</span>{result.report_id != null && <span>#{result.report_id}</span>}</div>
                    {mode === "pr" && <>
                      <div className="report-block"><h3>Review summary</h3><p>{readable(report?.summary)}</p></div>
                      <div className="report-block"><h3>Overall risk</h3><Pill tone={String(report?.overall_risk || "").toLowerCase().includes("high") ? "danger" : "accent"}>{readable(report?.overall_risk || "Not specified")}</Pill></div>
                      <div className="report-block"><h3>Code findings <span className="count">{report?.findings?.length || 0}</span></h3>
                        {Array.isArray(report?.findings) && report.findings.length ? report.findings.map((finding, index) => (
                          <div className="finding-card" key={index}><div className="finding-top"><Pill tone={String(finding.severity).toLowerCase().includes("high") || String(finding.severity).toLowerCase().includes("critical") ? "danger" : "accent"}>{finding.severity || "Finding"}</Pill><code>{finding.filename || "file"}{finding.line != null ? `:${finding.line}` : ""}</code></div><h4>{finding.issue}</h4><p>{finding.explanation}</p>{finding.suggested_fix && <><h5>Suggested fix</h5><pre>{readable(finding.suggested_fix)}</pre></>}</div>
                        )) : <p className="muted">No concrete defects identified in the supplied changes.</p>}
                      </div>
                    </>}
                    {mode === "ci" && <>
                      <div className="report-block"><h3>Root cause</h3><p>{readable(report?.root_cause)}</p></div>
                      <div className="report-block"><h3>Failure classification</h3><Pill tone="accent">{readable(report?.error_type || "Not specified")}</Pill><p className="muted">Confidence: {readable(report?.confidence ?? "Not specified")}</p></div>
                      <div className="report-block"><h3>Evidence</h3><pre>{readable(report?.evidence)}</pre></div>
                      <div className="report-block"><h3>Recommended fix</h3><p>{readable(report?.suggested_fix)}</p></div>
                    </>}
                    {mode === "agent" && <>
                      <div className="report-block"><h3>Investigation report</h3><div className="agent-answer markdown-body">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {readable(result.answer)}
  </ReactMarkdown>
</div></div>
                      <div className="report-block"><h3>MCP execution trace <span className="count">{result.tool_call_count ?? toolCalls.length}</span></h3>
                        {toolCalls.length === 0 && <p className="muted">No calls were recorded.</p>}
                        <div className="trace-list">{toolCalls.map((call, index) => <details className="trace-item" key={index}><summary><span className="trace-index">{String(index + 1).padStart(2, "0")}</span><strong>{call.tool || "MCP tool"}</strong><Icon name="chevron" size={15} /></summary><pre>{JSON.stringify(call.arguments ?? {}, null, 2)}</pre></details>)}</div>
                      </div>
                    </>}
                  </div>
                )}
              </section>
            </div>
          )}

          {mode === "history" && (
            <section className="surface-card full-card">
              <div className="section-heading"><div><h2>Saved reports</h2><p>Up to 50 most recent analyses · opening a report does not call the LLM</p></div><Pill>{history.length} reports</Pill></div>
              {error && <div className="error-banner" role="alert">{error}</div>}
              {historyLoading && <div className="loading-inline"><span className="spinner" /> Loading history…</div>}
              {!historyLoading && !history.length && <Empty title="No saved analyses" icon="clock">Run your first PR review, CI investigation, or unified agent task.</Empty>}
              {!historyLoading && !!history.length && <div className="history-list">{history.map((item) => (
                <article className="history-row" key={item.id}>
                  <div className="history-row-icon"><Icon name={item.type === "ci_analysis" ? "activity" : item.type === "multi_tool" ? "spark" : "git"} /></div>
                  <div className="history-row-info"><h3>{reportTitle(item.type)}</h3><p>{item.repository} · {item.type === "pr_review" ? `PR #${item.reference_id}` : item.type === "ci_analysis" ? `Run ${item.reference_id}` : item.result?.question || "Agent investigation"}</p><small>{formatDate(item.created_at)}</small></div>
                  <button className="button button--secondary button--compact" onClick={() => openSaved(item)}>View report <Icon name="arrow" size={15} /></button>
                </article>
              ))}</div>}
            </section>
          )}

          {mode === "evaluation" && (
            <>
              {evaluationError && <div className="error-banner" role="alert"><Icon name="alert" /> {evaluationError}</div>}
              {evaluationLoading && <div className="loading-inline"><span className="spinner" /> Fetching benchmark metrics…</div>}
              {!evaluationLoading && evaluation && <>
                <div className="stats-grid">
                  <Stat label="Success rate" value={evaluation.success_rate != null ? `${evaluation.success_rate}%` : "—"} detail={`${evaluation.successful ?? 0} of ${evaluation.total ?? 0} requests completed`} icon="check" />
                  <Stat label="Average latency" value={evaluation.average_latency_seconds != null ? `${evaluation.average_latency_seconds}s` : "—"} detail="Response time per scenario" icon="activity" />
                  <Stat label="Average MCP calls" value={evaluation.average_mcp_calls ?? "—"} detail="Tool usage per scenario" icon="git" />
                  <Stat label="Within call budget" value={`${evaluation.within_tool_budget ?? 0}/${evaluation.total ?? 0}`} detail="Reported eight-call compliance" icon="shield" />
                </div>
                <section className="surface-card full-card eval-summary">
                  <div className="section-heading"><div><h2>Benchmark details</h2><p>Saved results from the most recent live evaluation</p></div><Pill tone="accent">LIVE BENCHMARK</Pill></div>
                  <div className="detail-grid"><div><span>Executed</span><strong>{formatDate(evaluation.timestamp)}</strong></div><div><span>Scenarios</span><strong>{evaluation.total ?? "—"}</strong></div><div><span>Diagnostic accuracy</span><strong>{evaluation.diagnostic_accuracy == null ? "Not graded" : readable(evaluation.diagnostic_accuracy)}</strong></div><div><span>Data source</span><strong>/api/evaluations/latest</strong></div></div>
                  <div className="info-note"><Icon name="alert" size={18} /><p>Response success means the agent completed the request. It does not prove that its root-cause diagnosis was correct. Diagnostic accuracy requires labeled evaluation.</p></div>
                </section>
              </>}
              {!evaluationLoading && !evaluation && !evaluationError && <Empty title="No evaluation data" icon="chart">Run the benchmark to generate evaluation metrics.</Empty>}
            </>
          )}
        </main>
        <footer className="footer"><span>© DevPilot AI · Developer intelligence workspace</span><span>React · FastAPI · LangGraph · GitHub MCP</span></footer>
      </div>
    </div>
  );
}
