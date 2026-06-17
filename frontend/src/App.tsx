import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

type GamePhase = "intro" | "name" | "app";
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
  const [gamePhase, setGamePhase] = useState<GamePhase>("intro");
  const [notebookNotes, setNotebookNotes] = useState("");
  const [activeTab, setActiveTab] = useState<MainTab>("case");

  const [caseCount, setCaseCount] = useState(0);
  const [history, setHistory] = useState<CaseHistoryEntry[]>([]);

  const [evidenceSuspect, setEvidenceSuspect] = useState("");
  const [evidenceItem, setEvidenceItem] = useState<EvidenceItemRef | null>(null);
  const [evidenceCheckResult, setEvidenceCheckResult] = useState("");
  const [evidenceChecking, setEvidenceChecking] = useState(false);

  const [isLoadingCase, setIsLoadingCase] = useState(false);

  const [username, setUsername] = useState("");
  const [nameInput, setNameInput] = useState("");

  // welcome popup after entering name
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);

  // keep hum alive on intro + name pages
  const humRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore
    }

    // create hum element once
    const hum = new Audio("/assets/sounds/mystery-hum.mp3");
    hum.loop = true;
    hum.volume = 0.4;
    humRef.current = hum;

    // try to start hum + stinger on load (may be blocked until user click)
    hum
      .play()
      .catch(() => {
        // autoplay may be blocked; we'll try again on first click
      });

    playSound("mystery-stinger");

    return () => {
      if (humRef.current) {
        humRef.current.pause();
        humRef.current = null;
      }
    };
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
      "mystery-stinger": "mystery-stinger.mp3",
    };

    const file = soundMap[type];
    if (!file) return;
    try {
      const audio = new Audio(`/assets/sounds/${file}`);
      audio.volume =
        type === "mystery-stinger"
          ? 0.9
          : type === "case-solved"
          ? 0.8
          : 0.65;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  };

  const stopHum = () => {
    if (humRef.current) {
      humRef.current.pause();
      humRef.current.currentTime = 0;
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
      const response = await axios.get("https://mysterymind-1.onrender.com/generate-case");
      setData(response.data);
      resetCaseState();
      setCaseCount((prev) => prev + 1);

      // normal book‑open + page‑turn for case
      playSound("book-open");
      setTimeout(() => playSound("page-turn"), 400);
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

  // intro -> name screen (keep hum going)
  const goToNamePhase = () => {
    // if hum was blocked earlier, try playing now on click
    if (humRef.current && humRef.current.paused) {
      humRef.current.play().catch(() => {});
    }
    playSound("click");
    setGamePhase("name");
  };

  // name screen -> app (stop hum, book open occurs inside generateMystery)
  const confirmNameAndStart = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    setUsername(trimmed);

    stopHum();
    setGamePhase("app");
    setShowWelcomePopup(true);

    await generateMystery();
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
      const response = await axios.post("https://mysterymind-1.onrender.com/interrogate", {
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
        "https://mysterymind-1.onrender.com/check-evidence",
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
      const namePart = username ? ` You’re great, ${username}!` : "";
      setResult(`✅ CASE SOLVED.${namePart}`);
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
              <p>
                Review the suspects, evidence, and witness statements. When you
                are ready, record your verdict in the Accusation tab.
              </p>
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

    // ACCUSATION TAB
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
      {/* PHASE 1: mystery intro screen (with hum) */}
      {gamePhase === "intro" && (
        <div className="landing-shell">
          <div className="landing-card">
            <div className="landing-title">
              <h1>MYSTERYMIND</h1>
              <p>DETECTIVE CONSOLE</p>
            </div>
            <div className="landing-text">
              A dim room, a single terminal, and a trail of impossible cases.
              When you are ready, step in as the lead investigator.
            </div>
            <button className="btn-primary lg" onClick={goToNamePhase}>
              Start case
            </button>
          </div>

          <div className="landing-footer">
            © 2026 MysteryMind · Developed by Kanija Hussain
          </div>
        </div>
      )}

      {/* PHASE 2: name input (hum still playing) */}
      {gamePhase === "name" && (
        <div className="landing-shell">
          <div className="landing-card">
            <div className="landing-title">
              <h1>IDENTIFY</h1>
              <p>INVESTIGATOR LOGIN</p>
            </div>
            <div className="landing-text">
              Enter your investigator name so the system can brief you on the
              case.
            </div>
            <div className="name-input-row">
              <input
                type="text"
                placeholder="Enter your name..."
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmNameAndStart()}
              />
              <button className="btn-primary" onClick={confirmNameAndStart}>
                Continue
              </button>
            </div>
          </div>

          <div className="landing-footer">
            © 2026 MysteryMind · Developed by Kanija Hussain
          </div>
        </div>
      )}

      {/* PHASE 3: main app (no hum, normal UI) */}
      {gamePhase === "app" && (
        <div className="main-shell">
          {/* HEADER */}
          <header className="top-bar">
            {/* Left: logo + name */}
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <div className="brand-title">MYSTERYMIND</div>
                {username && (
                  <div className="brand-subtitle">
                    Investigator: {username}
                  </div>
                )}
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

            {/* welcome popup after name */}
            {showWelcomePopup && username && (
              <div className="welcome-popup">
                <div className="welcome-card">
                  <div className="welcome-title">Welcome, {username}</div>
                  <div className="welcome-text">
                    Help us with the investigation. The grid is counting on you.
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setShowWelcomePopup(false)}
                  >
                    Begin
                  </button>
                </div>
              </div>
            )}

            {renderTabContent()}
          </div>

          {/* FOOTER – visible on all app pages */}
          <footer className="app-footer">
            <span>© 2026 MysteryMind · Developed by Kanija Hussain</span>
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;