import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

type GamePhase = "landing" | "app";
type MainTab =
  | "case"
  | "suspects"
  | "evidence"
  | "interrogation"
  | "accusation"
  | "history";

interface Suspect {
  name: string;
  motive: string;
  alibi?: string;
  image_url?: string;
}

interface InterrogationMessage {
  from: "detective" | "suspect";
  text: string;
}

interface CaseHistoryEntry {
  caseId: string;
  title: string;
  correct: boolean;
  scoreDelta: number;
  finalScore: number;
  date: string;
}

type EvidenceItemRef =
  | { type: "clue"; index: number }
  | { type: "witness"; index: number };

const HISTORY_KEY = "mysterymind_history_v1";

function App() {
  const [data, setData] = useState<any>(null);
  const [selectedSuspect, setSelectedSuspect] = useState("");
  const [result, setResult] = useState("");
  const [selectedInterrogation, setSelectedInterrogation] =
    useState<Suspect | null>(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<InterrogationMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [score, setScore] = useState(0);
  const [interrogated, setInterrogated] = useState<string[]>([]);
  const [gamePhase, setGamePhase] = useState<GamePhase>("landing");
  const [notebookNotes, setNotebookNotes] = useState("");
  const [activeTab, setActiveTab] = useState<MainTab>("case");

  const [caseCount, setCaseCount] = useState(0);
  const [history, setHistory] = useState<CaseHistoryEntry[]>([]);

  const [evidenceSuspect, setEvidenceSuspect] = useState("");
  const [evidenceItem, setEvidenceItem] = useState<EvidenceItemRef | null>(null);
  const [evidenceCheckResult, setEvidenceCheckResult] = useState("");
  const [evidenceChecking, setEvidenceChecking] = useState(false);

  const [isLoadingCase, setIsLoadingCase] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        setHistory(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  const persistHistory = (entries: CaseHistoryEntry[]) => {
    setHistory(entries);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }
  };

  const playSound = (type: string) => {
    const soundMap: { [key: string]: string } = {
      "book-open": "book-open.mp3",
      "page-turn": "page-turn.mp3",
      click: "click.mp3",
      "evidence-reveal": "evidence-reveal.mp3",
      "case-solved": "case-solved.mp3",
    };

    const file = soundMap[type];
    if (!file) return;
    try {
      const audio = new Audio(`/assets/sounds/${file}`);
      audio.volume = type === "book-open" ? 0.9 : 0.65;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  };

  const resetCaseState = () => {
    setResult("");
    setSelectedSuspect("");
    setSelectedInterrogation(null);
    setQuestion("");
    setChat([]);
    setIsTyping(false);
    setInterrogated([]);
    setNotebookNotes("");
    setEvidenceSuspect("");
    setEvidenceItem(null);
    setEvidenceCheckResult("");
    setEvidenceChecking(false);
    setActiveTab("case");
  };

  const generateMystery = async () => {
    playSound("click");
    setIsLoadingCase(true);
    try {
      const response = await axios.get("http://localhost:8000/generate-case");
      setData(response.data);
      resetCaseState();
      setCaseCount((prev) => prev + 1);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingCase(false);
    }
  };

  const getRank = () => {
    if (score >= 400) return "Master Detective";
    if (score >= 200) return "Senior Investigator";
    if (score >= 100) return "Investigator";
    return "Rookie Detective";
  };

  const startInvestigation = () => {
    playSound("book-open");
    setTimeout(() => {
      playSound("page-turn");
    }, 600);

    setTimeout(() => {
      setGamePhase("app");
      generateMystery();
    }, 1300);
  };

  const interrogate = (suspect: Suspect) => {
    playSound("click");
    setSelectedInterrogation(suspect);
    if (!interrogated.includes(suspect.name)) {
      setInterrogated((prev) => [...prev, suspect.name]);
      setScore((prev) => prev + 5);
    }
    setQuestion("");
    setChat([]);
    setIsTyping(false);
    setActiveTab("interrogation");
  };

  const askQuestion = async () => {
    if (!selectedInterrogation || !question.trim()) return;
    const q = question.trim();

    playSound("click");
    setChat((prev) => [...prev, { from: "detective", text: q }]);
    setQuestion("");
    setIsTyping(true);

    try {
      const response = await axios.post("http://localhost:8000/interrogate", {
        suspect_name: selectedInterrogation.name,
        motive: selectedInterrogation.motive,
        alibi: selectedInterrogation.alibi,
        question: q,
      });

      const answer = response.data.answer;
      setTimeout(() => {
        setChat((prev) => [...prev, { from: "suspect", text: answer }]);
        setIsTyping(false);
        setScore((prev) => prev + 2);
        playSound("evidence-reveal");
      }, 650);
    } catch {
      const fallback =
        "The suspect remains silent, eyes fixed on the terminal...";
      setTimeout(() => {
        setChat((prev) => [...prev, { from: "suspect", text: fallback }]);
        setIsTyping(false);
      }, 650);
    }
  };

  const checkEvidence = async () => {
    if (!data || !evidenceSuspect || !evidenceItem) return;
    setEvidenceChecking(true);
    setEvidenceCheckResult("");

    try {
      const suspect = data.suspects.find(
        (s: Suspect) => s.name === evidenceSuspect
      );
      if (!suspect) {
        setEvidenceChecking(false);
        return;
      }

      let text = "";
      if (evidenceItem.type === "clue") {
        const clue = data.clues[evidenceItem.index];
        text = clue ? `${clue.name}: ${clue.description}` : "";
      } else {
        const w = data.witnesses[evidenceItem.index];
        text = w ? `${w.name}: ${w.statement}` : "";
      }

      const response = await axios.post(
        "http://localhost:8000/check-evidence",
        {
          suspect,
          evidence_text: text,
          case_id: data.case_id,
        }
      );

      setEvidenceCheckResult(response.data.analysis || "");
    } catch {
      setEvidenceCheckResult("Unable to analyse this evidence right now.");
    } finally {
      setEvidenceChecking(false);
    }
  };

  const solveCase = () => {
    playSound("click");
    if (!data) return;

    if (!selectedSuspect) {
      setResult("Select a suspect first.");
      return;
    }

    const correct = selectedSuspect === data.culprit;
    const scoreChange = correct ? +100 : -25;

    if (correct) {
      setResult("✅ CASE CLOSED — BRILLIANT DEDUCTION, DETECTIVE!");
      playSound("case-solved");
    } else {
      setResult("❌ WRONG SUSPECT. TRACE LOST IN THE GRID...");
    }

    setScore((prev) => {
      const newScore = Math.max(0, prev + scoreChange);
      const entry: CaseHistoryEntry = {
        caseId: data.case_id,
        title: data.title,
        correct,
        scoreDelta: scoreChange,
        finalScore: newScore,
        date: new Date().toISOString(),
      };
      const next = [entry, ...history].slice(0, 50);
      persistHistory(next);
      return newScore;
    });
  };

  const getSuspectImageUrl = (suspect: Suspect, index: number) => {
    if (suspect.image_url) return suspect.image_url;
    const initials = suspect.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
    const seed = encodeURIComponent(initials || `suspect-${index}`);
    return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=020617&fontSize=40&bold=true`;
  };

  const sidebarTabs: { id: MainTab; label: string }[] = [
    { id: "case", label: "Case" },
    { id: "suspects", label: "Suspects" },
    { id: "evidence", label: "Evidence" },
    { id: "interrogation", label: "Interrogation" },
    { id: "accusation", label: "Accusation" },
    { id: "history", label: "History" },
  ];

  const renderTabContent = () => {
    if (activeTab === "history") {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>Case history</h2>
          </div>
          {history.length === 0 ? (
            <div className="empty-state">
              No completed cases recorded yet. Solve a case to see it here.
            </div>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Title</th>
                    <th>Outcome</th>
                    <th>Score Δ</th>
                    <th>Final score</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={`${h.caseId}-${i}`}>
                      <td>{h.caseId}</td>
                      <td>{h.title}</td>
                      <td className={h.correct ? "good" : "bad"}>
                        {h.correct ? "Correct" : "Wrong"}
                      </td>
                      <td>{h.scoreDelta > 0 ? `+${h.scoreDelta}` : h.scoreDelta}</td>
                      <td>{h.finalScore}</td>
                      <td>{new Date(h.date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      );
    }

    if (!data) {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>No case loaded</h2>
          </div>
          <div className="empty-state">
            Use the "New Case" button to generate a fresh investigation file.
          </div>
        </section>
      );
    }

    if (activeTab === "case") {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>Case overview</h2>
          </div>

          <div className="case-layout">
            <div className="case-summary">
              <div className="summary-row">
                <span className="label">Case ID</span>
                <span className="value">{data.case_id}</span>
              </div>
              <div className="summary-row">
                <span className="label">Title</span>
                <span className="value">{data.title}</span>
              </div>
              <div className="summary-row">
                <span className="label">Victim</span>
                <span className="value">{data.victim}</span>
              </div>
              <div className="summary-row">
                <span className="label">Crime scene</span>
                <span className="value">{data.crime_scene}</span>
              </div>
              <div className="summary-row">
                <span className="label">Status</span>
                <span className="status-pill open">In progress</span>
              </div>
            </div>

            <div className="case-note">
              Use the tabs to review suspects, evidence, and interrogation.
              When you are ready, record your verdict in the Accusation tab.
            </div>
          </div>
        </section>
      );
    }

    if (activeTab === "suspects") {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>Suspects</h2>
          </div>
          <div className="suspect-grid">
            {data.suspects.map((suspect: Suspect, index: number) => {
              const isDone = interrogated.includes(suspect.name);
              return (
                <div key={index} className="suspect-card">
                  <div className="suspect-photo">
                    <img
                      src={getSuspectImageUrl(suspect, index)}
                      alt={suspect.name}
                    />
                  </div>
                  <div className="suspect-body">
                    <div className="suspect-header-row">
                      <span className="suspect-name">{suspect.name}</span>
                      <span
                        className={`chip ${isDone ? "chip-green" : "chip-amber"}`}
                      >
                        {isDone ? "Questioned" : "Pending"}
                      </span>
                    </div>
                    <div className="suspect-line">
                      <span className="label">Motive</span>
                      <span className="value">{suspect.motive}</span>
                    </div>
                    {suspect.alibi && (
                      <div className="suspect-line">
                        <span className="label">Alibi</span>
                        <span className="value">{suspect.alibi}</span>
                      </div>
                    )}
                    <div className="suspect-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => interrogate(suspect)}
                      >
                        Open interrogation
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (activeTab === "evidence") {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>Evidence</h2>
          </div>

          <div className="evidence-layout">
            <div className="evidence-column">
              <h3>Clues</h3>
              <ul className="item-list">
                {Array.isArray(data.clues) &&
                  data.clues.map((clue: any, i: number) => (
                    <li key={clue.id || i}>
                      <span className="bullet" />
                      <span>
                        {clue.name} — {clue.description}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="evidence-column">
              <h3>Witness statements</h3>
              <ul className="item-list">
                {Array.isArray(data.witnesses) &&
                  data.witnesses.map((w: any, i: number) => (
                    <li key={w.name || i}>
                      <span className="bullet bullet-alt" />
                      <span>
                        <strong>{w.name}:</strong> {w.statement}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          <div className="evidence-check card-like">
            <h3>Check evidence against suspect</h3>

            <div className="evidence-check-row">
              <label>Suspect</label>
              <select
                value={evidenceSuspect}
                onChange={(e) => setEvidenceSuspect(e.target.value)}
              >
                <option value="">Select suspect...</option>
                {data.suspects.map((s: Suspect, i: number) => (
                  <option key={i} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="evidence-check-row">
              <label>Evidence</label>
              <select
                value={
                  evidenceItem
                    ? `${evidenceItem.type}-${evidenceItem.index}`
                    : ""
                }
                onChange={(e) => {
                  if (!e.target.value) {
                    setEvidenceItem(null);
                    return;
                  }
                  const [type, idx] = e.target.value.split("-");
                  setEvidenceItem({
                    type: type as "clue" | "witness",
                    index: Number(idx),
                  });
                }}
              >
                <option value="">Select clue or statement...</option>

                {Array.isArray(data.clues) &&
                  data.clues.map((clue: any, i: number) => (
                    <option key={`c-${clue.id || i}`} value={`clue-${i}`}>
                      Clue {i + 1}: {clue.name.slice(0, 40)}...
                    </option>
                  ))}

                {Array.isArray(data.witnesses) &&
                  data.witnesses.map((w: any, i: number) => (
                    <option key={`w-${i}`} value={`witness-${i}`}>
                      Witness {i + 1}: {w.name.slice(0, 40)}...
                    </option>
                  ))}
              </select>
            </div>

            <button
              className="btn-secondary"
              onClick={checkEvidence}
              disabled={evidenceChecking || !evidenceSuspect || !evidenceItem}
            >
              {evidenceChecking ? "Checking..." : "Analyse"}
            </button>

            {evidenceCheckResult && (
              <div className="evidence-check-result">
                {evidenceCheckResult}
              </div>
            )}
          </div>
        </section>
      );
    }

    if (activeTab === "interrogation") {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>Interrogation</h2>
          </div>

          <div className="interrogation-layout">
            <div className="interrogation-meta">
              <label htmlFor="interrogation-suspect">Suspect</label>
              <select
                id="interrogation-suspect"
                value={selectedInterrogation?.name || ""}
                onChange={(e) => {
                  const s = data.suspects.find(
                    (suspect: Suspect) => suspect.name === e.target.value
                  );
                  if (s) interrogate(s);
                }}
              >
                <option value="">Select suspect...</option>
                {data.suspects.map((s: Suspect, i: number) => (
                  <option key={i} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedInterrogation ? (
              <>
                <div className="chat-window">
                  {chat.map((msg, i) => (
                    <div
                      key={i}
                      className={`chat-row ${
                        msg.from === "detective" ? "me" : "them"
                      }`}
                    >
                      <div className="chat-bubble">
                        <span className="chat-label">
                          {msg.from === "detective" ? "Detective" : "Suspect"}
                        </span>
                        <span>{msg.text}</span>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="chat-row them">
                      <div className="chat-bubble typing">
                        <span className="chat-label">Suspect</span>
                        <span className="typing-dots">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="chat-input-row">
                  <input
                    type="text"
                    value={question}
                    placeholder="Type your question and press Enter..."
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                  />
                  <button className="btn-primary" onClick={askQuestion}>
                    Ask
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Select a suspect from the list to begin an interrogation.
              </div>
            )}
          </div>
        </section>
      );
    }

    // Accusation tab
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Final accusation</h2>
        </div>
        <div className="accusation-layout">
          <div className="accusation-form">
            <label htmlFor="culprit-select">Primary suspect</label>
            <select
              id="culprit-select"
              value={selectedSuspect}
              onChange={(e) => setSelectedSuspect(e.target.value)}
            >
              <option value="">Select suspect...</option>
              {data.suspects.map((s: Suspect, i: number) => (
                <option key={i} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            <label htmlFor="notes">Analysis notes</label>
            <textarea
              id="notes"
              rows={4}
              value={notebookNotes}
              onChange={(e) => setNotebookNotes(e.target.value)}
              placeholder="Summarise your reasoning before recording the verdict."
            />

            <button className="btn-danger" onClick={solveCase}>
              Record verdict
            </button>

            {result && <div className="result-banner">{result}</div>}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="app-root">
      {gamePhase === "landing" && (
        <div className="landing-shell">
          <div className="landing-card">
            <div className="landing-title">
              <h1>MYSTERYMIND</h1>
              <p>DETECTIVE CONSOLE</p>
            </div>
            <div className="landing-text">
              Open a new case file and use AI-powered tools to solve each
              mystery by interrogating suspects and analysing evidence.
            </div>
            <button className="btn-primary lg" onClick={startInvestigation}>
              Start investigation
            </button>
          </div>
        </div>
      )}

      {gamePhase === "app" && (
        <div className="main-shell">
          {/* HEADER – only logo+name, title, cases/score/rank/new case */}
          <header className="top-bar">
            {/* Left: logo + name */}
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <div className="brand-title">MYSTERYMIND</div>
              </div>
            </div>

            {/* Middle: case title */}
            <div className="case-header">
              <div className="case-title">
                <span>CASE TITLE</span>
                <strong>{data?.title || "No case loaded"}</strong>
              </div>
            </div>

            {/* Right: stats + new case */}
            <div className="status-stack">
              <div className="status-card">
                <span>CASES</span>
                <strong>{caseCount}</strong>
              </div>
              <div className="status-card">
                <span>SCORE</span>
                <strong>{score}</strong>
              </div>
              <div className="status-card">
                <span>RANK</span>
                <strong>{getRank()}</strong>
              </div>
              <button className="btn-secondary" onClick={generateMystery}>
                New Case
              </button>
            </div>
          </header>

          {/* TABS */}
          <nav className="tab-bar">
            {sidebarTabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* CONTENT */}
          <div className="content-shell">
            {isLoadingCase && (
              <div className="loading-overlay">
                <div className="loading-spinner" />
                <div className="loading-text">Generating new case...</div>
              </div>
            )}
            {renderTabContent()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;