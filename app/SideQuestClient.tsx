"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  type CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type RoomStatus = "lobby" | "playing" | "complete";

type GameChoice = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  points: number;
  energy: number;
};

type GameRound = {
  id: string;
  eyebrow: string;
  title: string;
  prompt: string;
  timeLimitSeconds: number;
  teamTarget: number;
  choices: GameChoice[];
};

type GameRole = {
  id: string;
  label: string;
  emoji: string;
  mission: string;
};

type PublicPlayer = {
  id: string;
  name: string;
  score: number;
  lastAction: string | null;
  lastActionAt: number | null;
  hasActed: boolean;
};

type Scenario = {
  id: string;
  brand: string;
  title: string;
  subtitle: string;
  intro: string;
  lobbyPrompt: string;
  completionTitle: string;
  completionPrompt: string;
  roles: GameRole[];
  rounds: GameRound[];
};

type RoomState = {
  room: {
    code: string;
    status: RoomStatus;
    round: number;
    version: number;
    createdAt: number;
    updatedAt: number;
    phaseStartedAt: number | null;
  };
  scenario: Scenario;
  currentRound: GameRound | null;
  players: PublicPlayer[];
  leaderboard: PublicPlayer[];
  progress: {
    playerCount: number;
    actionCount: number;
    teamEnergy: number;
    teamTarget: number;
    percent: number;
  };
};

type PlayerSession = {
  id: string;
  name: string;
  token: string;
  role: GameRole;
};

type View = "landing" | "host" | "player";

const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;

function hostStorageKey(code: string) {
  return `sidequest:host:${code}`;
}

function playerStorageKey(code: string) {
  return `sidequest:player:${code}`;
}

function getStoredPlayer(code: string): PlayerSession | null {
  try {
    const raw = window.localStorage.getItem(playerStorageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.token !== "string" ||
      !parsed.role ||
      typeof parsed.role.id !== "string"
    ) {
      return null;
    }
    return parsed as PlayerSession;
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "The room could not update. Please try again.");
  }
  return payload;
}

function tidyCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function formatTime(seconds: number) {
  return `00:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

function playerInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function playerRank(state: RoomState, playerId?: string) {
  if (!playerId) return null;
  const index = state.leaderboard.findIndex((candidate) => candidate.id === playerId);
  return index === -1 ? null : index + 1;
}

function activeChoice(state: RoomState, player?: PublicPlayer) {
  if (!state.currentRound || !player?.hasActed || !player.lastAction) return null;
  return state.currentRound.choices.find((choice) => choice.id === player.lastAction) ?? null;
}

export default function SideQuestClient() {
  const [view, setView] = useState<View>("landing");
  const [state, setState] = useState<RoomState | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(null);
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState(0);
  const [actionInFlight, setActionInFlight] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const booted = useRef(false);

  const refreshRoom = useCallback(async (code: string) => {
    const result = await api<{ state: RoomState }>(`/api/rooms/${code}`);
    setState(result.state);
    return result.state;
  }, []);

  useEffect(() => {
    const syncClock = () => {
      setOrigin(window.location.origin);
      setNow(Date.now());
    };
    const firstFrame = window.requestAnimationFrame(syncClock);
    const clock = window.setInterval(syncClock, 500);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(window.location.search);
    const hostCode = tidyCode(params.get("host") ?? "");
    const joinCode = tidyCode(params.get("room") ?? "");
    const code = hostCode || joinCode;
    if (!ROOM_CODE_PATTERN.test(code)) return;

    const initializeRoom = () => {
      setRoomCode(code);
      if (hostCode) {
        const token = window.localStorage.getItem(hostStorageKey(code)) ?? "";
        setHostToken(token);
        setView("host");
      } else {
        setPlayerSession(getStoredPlayer(code));
        setView("player");
      }
      refreshRoom(code).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "That room is no longer available.");
      });
    };
    const timeout = window.setTimeout(initializeRoom, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshRoom]);

  useEffect(() => {
    if (!roomCode || (view !== "host" && view !== "player")) return;
    let active = true;
    const poll = async () => {
      try {
        const next = await api<{ state: RoomState }>(`/api/rooms/${roomCode}`);
        if (active) {
          setState(next.state);
          setError("");
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Reconnecting to the raid…");
        }
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 1300);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [roomCode, view]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(id);
  }, [notice]);

  const joinUrl = useMemo(() => {
    if (!roomCode) return "";
    return `${origin || ""}/?room=${roomCode}`;
  }, [origin, roomCode]);

  const createRoom = async () => {
    setActionInFlight("create");
    setError("");
    try {
      const result = await api<{ state: RoomState; hostToken: string }>("/api/rooms", {
        method: "POST",
      });
      const code = result.state.room.code;
      window.localStorage.setItem(hostStorageKey(code), result.hostToken);
      window.history.replaceState(null, "", `?host=${code}`);
      setState(result.state);
      setRoomCode(code);
      setHostToken(result.hostToken);
      setPlayerSession(null);
      setView("host");
      setNotice("Your room is live. Put this screen up and let people scan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create a room.");
    } finally {
      setActionInFlight("");
    }
  };

  const openRoom = (code: string) => {
    const normalized = tidyCode(code);
    if (!ROOM_CODE_PATTERN.test(normalized)) {
      setError("Enter the six-character room code from the screen.");
      return;
    }
    window.history.replaceState(null, "", `?room=${normalized}`);
    setState(null);
    setRoomCode(normalized);
    setHostToken("");
    setPlayerSession(getStoredPlayer(normalized));
    setView("player");
    setError("");
    void refreshRoom(normalized).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "That room is unavailable.");
    });
  };

  const joinRoom = async (name: string) => {
    if (!roomCode) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Use the name you want people in the room to call you.");
      return;
    }
    setActionInFlight("join");
    setError("");
    try {
      const previous = getStoredPlayer(roomCode);
      const result = await api<{ state: RoomState; player: PlayerSession }>(
        `/api/rooms/${roomCode}/join`,
        {
          method: "POST",
          body: JSON.stringify({ name: trimmedName, token: previous?.token }),
        },
      );
      window.localStorage.setItem(playerStorageKey(roomCode), JSON.stringify(result.player));
      setState(result.state);
      setPlayerSession(result.player);
      setNotice(`You are in, ${result.player.name}. Your role is secret.`);
      if (navigator.vibrate) navigator.vibrate(18);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not join the room.");
    } finally {
      setActionInFlight("");
    }
  };

  const controlRoom = async (command: "start" | "advance" | "reset") => {
    if (!roomCode || !hostToken) {
      setError("This browser does not have the host controls. Open the host tab instead.");
      return;
    }
    setActionInFlight(command);
    setError("");
    try {
      const result = await api<{ state: RoomState }>(`/api/rooms/${roomCode}/control`, {
        method: "POST",
        body: JSON.stringify({ token: hostToken, command }),
      });
      setState(result.state);
      setNotice(
        command === "start"
          ? "Raid started. The room has its first mission."
          : command === "advance"
            ? "Next phase is live."
            : "Raid reset. The room is ready for a fresh run.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That host action did not land.");
    } finally {
      setActionInFlight("");
    }
  };

  const takeAction = async (choice: GameChoice) => {
    if (!roomCode || !playerSession) return;
    setActionInFlight(`choice:${choice.id}`);
    setError("");
    try {
      const result = await api<{ state: RoomState }>(`/api/rooms/${roomCode}/action`, {
        method: "POST",
        body: JSON.stringify({
          playerId: playerSession.id,
          token: playerSession.token,
          action: choice.id,
        }),
      });
      setState(result.state);
      setNotice(`+${choice.points} points · ${choice.description}`);
      if (navigator.vibrate) navigator.vibrate([16, 24, 16]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your move did not land. Try again.");
    } finally {
      setActionInFlight("");
    }
  };

  const copyJoinLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setNotice("Join link copied. Send it to a latecomer.");
    } catch {
      setNotice("Copy this link from the address bar: " + joinUrl);
    }
  };

  const leaveRoom = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setView("landing");
    setState(null);
    setRoomCode("");
    setHostToken("");
    setPlayerSession(null);
    setError("");
  };

  const clockNow = now || state?.room.phaseStartedAt || 0;
  const secondsLeft =
    state?.room.status === "playing" && state.currentRound && state.room.phaseStartedAt
      ? Math.max(
          0,
          Math.ceil(
            (state.room.phaseStartedAt + state.currentRound.timeLimitSeconds * 1000 - clockNow) / 1000,
          ),
        )
      : 0;

  return (
    <main className="sidequest-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-noise" />
      {notice ? <div className="toast toast-success">{notice}</div> : null}
      {error ? (
        <div className="toast toast-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}

      {view === "landing" ? (
        <LandingScreen
          creating={actionInFlight === "create"}
          onCreate={createRoom}
          onJoin={openRoom}
        />
      ) : state ? (
        view === "host" ? (
          <HostScreen
            state={state}
            joinUrl={joinUrl}
            secondsLeft={secondsLeft}
            hasHostToken={Boolean(hostToken)}
            busy={actionInFlight}
            onControl={controlRoom}
            onCopy={copyJoinLink}
            onLeave={leaveRoom}
          />
        ) : (
          <PlayerScreen
            state={state}
            session={playerSession}
            secondsLeft={secondsLeft}
            busy={actionInFlight}
            onJoin={joinRoom}
            onAction={takeAction}
            onLeave={leaveRoom}
          />
        )
      ) : (
        <LoadingScreen view={view} onLeave={leaveRoom} />
      )}
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark-compact" : ""}`}>
      <span className="brand-spark" aria-hidden="true">
        ✦
      </span>
      <span>sidequest</span>
    </div>
  );
}

function LandingScreen({
  creating,
  onCreate,
  onJoin,
}: {
  creating: boolean;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");

  const submitJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onJoin(code);
  };

  return (
    <section className="landing-page">
      <nav className="top-nav">
        <BrandMark />
        <div className="nav-note">
          <span className="status-dot" /> LIVE EVENT GAMES
        </div>
      </nav>

      <div className="landing-grid">
        <div className="landing-copy">
          <p className="kicker">THE ANTIDOTE TO THE AWKWARD FIVE MINUTES</p>
          <h1>
            THE ROOM IS
            <span> QUIET.</span>
            <br />
            FIX THAT.
          </h1>
          <p className="landing-lede">
            One screen. Every phone. Ninety seconds of organized chaos that makes strangers feel
            like a crew.
          </p>
          <div className="landing-actions">
            <button
              className="button button-lime button-xl"
              type="button"
              onClick={onCreate}
              disabled={creating}
            >
              {creating ? "OPENING THE PORTAL…" : "HOST A LIVE ROOM"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="microcopy">No app. No account. Just a QR code and a room full of people.</p>
          </div>
        </div>

        <div className="landing-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <Demon health={57} mood="idle" large />
          <div className="floating-score score-one">+160</div>
          <div className="floating-score score-two">✦ NEW CREW</div>
          <div className="floating-card card-left">
            <span>TEAM ENERGY</span>
            <strong>840</strong>
            <div className="mini-meter">
              <i />
            </div>
          </div>
          <div className="floating-card card-right">
            <span>ROOM STATUS</span>
            <strong>LET&apos;S GO</strong>
            <em>12 players connected</em>
          </div>
        </div>
      </div>

      <div className="landing-footer">
        <div className="footer-statement">
          <span className="footer-index">01</span>
          <p>Turn waiting time into shared momentum.</p>
        </div>
        <form className="join-code-form" onSubmit={submitJoin}>
          <label htmlFor="room-code">Already in the room?</label>
          <div>
            <input
              id="room-code"
              value={code}
              onChange={(event) => setCode(tidyCode(event.target.value))}
              placeholder="ENTER CODE"
              maxLength={6}
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button className="button button-paper" type="submit">
              JOIN →
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function LoadingScreen({ view, onLeave }: { view: View; onLeave: () => void }) {
  return (
    <section className="loading-screen">
      <BrandMark />
      <div className="loading-orb" aria-hidden="true">
        <span>✦</span>
      </div>
      <p className="kicker">SIDEQUEST IS CONNECTING</p>
      <h1>{view === "host" ? "LOADING YOUR CONTROL ROOM" : "FINDING THE RAID"}</h1>
      <p>Keeping the screen simple while we sync the room.</p>
      <button type="button" className="text-button" onClick={onLeave}>
        Return home
      </button>
    </section>
  );
}

function HostScreen({
  state,
  joinUrl,
  secondsLeft,
  hasHostToken,
  busy,
  onControl,
  onCopy,
  onLeave,
}: {
  state: RoomState;
  joinUrl: string;
  secondsLeft: number;
  hasHostToken: boolean;
  busy: string;
  onControl: (command: "start" | "advance" | "reset") => void;
  onCopy: () => void;
  onLeave: () => void;
}) {
  if (state.room.status === "lobby") {
    return (
      <HostLobby
        state={state}
        joinUrl={joinUrl}
        canControl={hasHostToken}
        busy={busy}
        onControl={onControl}
        onCopy={onCopy}
        onLeave={onLeave}
      />
    );
  }

  if (state.room.status === "complete") {
    return (
      <ResultsScreen
        state={state}
        isHost
        busy={busy}
        onReset={() => onControl("reset")}
        onLeave={onLeave}
      />
    );
  }

  const round = state.currentRound;
  const energyPercent = Math.min(100, Math.max(0, state.progress.percent));
  const bossHealth = Math.max(4, 100 - energyPercent);
  const timeExpired = secondsLeft <= 0;

  return (
    <section className="projector-page">
      <header className="projector-header">
        <BrandMark compact />
        <div className="projector-mission">
          <span className="live-pill"><i /> LIVE RAID</span>
          <strong>DEMO DEMON</strong>
        </div>
        <div className="projector-timer" aria-label={`${secondsLeft} seconds remaining`}>
          {formatTime(secondsLeft)}
        </div>
        <div className="projector-players">
          <span>CREW</span>
          <strong>{state.progress.playerCount}</strong>
        </div>
      </header>

      <div className="projector-layout">
        <div className="raid-stage">
          <div className="stage-corner stage-corner-left">
            <span>ROOM</span>
            <strong>{state.room.code}</strong>
          </div>
          <div className="stage-corner stage-corner-right">
            <span>PHASE</span>
            <strong>0{state.room.round}/03</strong>
          </div>
          <p className="round-eyebrow">{round?.eyebrow}</p>
          <h1>{round?.title}</h1>
          <p className="round-prompt">{round?.prompt}</p>
          <Demon health={bossHealth} mood={timeExpired ? "angry" : "hit"} />
          <div className="boss-health" aria-label={`Demo Demon at ${Math.round(bossHealth)} percent health`}>
            <div className="health-labels">
              <span>DEMO DEMON</span>
              <strong>{Math.round(bossHealth)}% HP</strong>
            </div>
            <div className="meter meter-coral">
              <i style={{ width: `${bossHealth}%` }} />
            </div>
          </div>
          <p className="demon-taunt">
            {state.progress.actionCount === 0
              ? "A QR code is not a personality. Prove me wrong."
              : state.progress.percent >= 100
                ? "The room is learning to cooperate. Disgusting."
                : "Someone has discovered the teamwork button. Finally."}
          </p>
        </div>

        <Leaderboard state={state} />
      </div>

      <footer className="projector-command-bar">
        <div className="command-copy">
          <span>RIGHT NOW</span>
          <strong>{timeExpired ? "TIME IS UP — ADVANCE WHEN THE ROOM IS READY." : round?.prompt}</strong>
        </div>
        <div className="team-energy">
          <span>TEAM ENERGY</span>
          <div className="meter meter-lime">
            <i style={{ width: `${energyPercent}%` }} />
          </div>
          <strong>
            {state.progress.teamEnergy} / {state.progress.teamTarget}
          </strong>
        </div>
      </footer>

      <HostControls
        state={state}
        joinUrl={joinUrl}
        canControl={hasHostToken}
        busy={busy}
        onControl={onControl}
        onCopy={onCopy}
      />
    </section>
  );
}

function HostLobby({
  state,
  joinUrl,
  canControl,
  busy,
  onControl,
  onCopy,
  onLeave,
}: {
  state: RoomState;
  joinUrl: string;
  canControl: boolean;
  busy: string;
  onControl: (command: "start" | "advance" | "reset") => void;
  onCopy: () => void;
  onLeave: () => void;
}) {
  const canStart = canControl && state.players.length > 0;
  return (
    <section className="lobby-page">
      <header className="projector-header lobby-header">
        <BrandMark compact />
        <div className="projector-mission">
          <span className="live-pill"><i /> ROOM OPEN</span>
          <strong>ROOM {state.room.code}</strong>
        </div>
        <button type="button" className="top-exit" onClick={onLeave}>
          Exit room
        </button>
      </header>
      <div className="lobby-content">
        <div className="lobby-copy">
          <p className="kicker">ROOMRAID / 90-SECOND SOCIAL GAME</p>
          <h1>
            THE ROOM IS QUIET.
            <span> FIX THAT.</span>
          </h1>
          <p>
            Scan in. Get a secret role. Then defeat the Demo Demon before it turns this event
            into a waiting room.
          </p>
          <div className="lobby-readiness">
            <div className="crew-count">
              <span>RAIDERS IN</span>
              <strong>{state.players.length}</strong>
            </div>
            <p>
              {state.players.length === 0
                ? "Waiting for the first person to scan."
                : state.players.length < 3
                  ? "You can start now. More people can jump in as you play."
                  : `${state.players.length} raiders are in. Start whenever the room is looking.`}
            </p>
          </div>
          {!canControl ? (
            <p className="host-warning">
              You&apos;re viewing the projector, but this browser does not hold the host key. Open
              the original host tab to start or reset.
            </p>
          ) : null}
          <div className="lobby-buttons">
            <button
              className="button button-lime button-xl"
              type="button"
              disabled={!canStart || busy === "start"}
              onClick={() => onControl("start")}
            >
              {busy === "start" ? "WAKING THE DEMON…" : "START THE RAID"}
              <span aria-hidden="true">⚔</span>
            </button>
            <button className="button button-ghost" type="button" onClick={onCopy}>
              COPY PLAYER LINK
            </button>
          </div>
        </div>

        <div className="qr-stage">
          <div className="qr-frame">
            <QRCodeSVG value={joinUrl || `room:${state.room.code}`} size={240} bgColor="#fff9ed" fgColor="#11111a" />
          </div>
          <p>OPEN YOUR CAMERA &amp; JOIN</p>
          <strong>{state.room.code}</strong>
          <button type="button" onClick={onCopy} className="text-button">
            Or copy player link
          </button>
        </div>
      </div>
      <div className="lobby-roster" aria-label="Players in the room">
        {state.players.length ? (
          state.players.map((player) => (
            <div className="roster-player" key={player.id}>
              <span>{playerInitial(player.name)}</span>
              {player.name}
            </div>
          ))
        ) : (
          <span className="empty-roster">The crew will appear here as people scan in.</span>
        )}
      </div>
    </section>
  );
}

function HostControls({
  state,
  joinUrl,
  canControl,
  busy,
  onControl,
  onCopy,
}: {
  state: RoomState;
  joinUrl: string;
  canControl: boolean;
  busy: string;
  onControl: (command: "start" | "advance" | "reset") => void;
  onCopy: () => void;
}) {
  return (
    <details className="host-controls">
      <summary>⚙ HOST</summary>
      <div className="host-control-popover">
        <div className="mini-qr">
          <QRCodeSVG value={joinUrl || `room:${state.room.code}`} size={72} bgColor="#fff9ed" fgColor="#11111a" />
          <span>ROOM {state.room.code}</span>
        </div>
        <button type="button" className="button button-paper" onClick={onCopy}>
          COPY LINK
        </button>
        <button
          type="button"
          className="button button-lime"
          disabled={!canControl || busy === "advance"}
          onClick={() => onControl("advance")}
        >
          {busy === "advance" ? "LOADING…" : "NEXT PHASE"}
        </button>
        <button
          type="button"
          className="button button-danger"
          disabled={!canControl || busy === "reset"}
          onClick={() => onControl("reset")}
        >
          RESET RAID
        </button>
      </div>
    </details>
  );
}

function PlayerScreen({
  state,
  session,
  secondsLeft,
  busy,
  onJoin,
  onAction,
  onLeave,
}: {
  state: RoomState;
  session: PlayerSession | null;
  secondsLeft: number;
  busy: string;
  onJoin: (name: string) => void;
  onAction: (choice: GameChoice) => void;
  onLeave: () => void;
}) {
  if (!session) {
    return <JoinScreen state={state} busy={busy} onJoin={onJoin} onLeave={onLeave} />;
  }

  if (state.room.status === "complete") {
    return <ResultsScreen state={state} session={session} isHost={false} onLeave={onLeave} />;
  }

  const mine = state.players.find((player) => player.id === session.id);
  const rank = playerRank(state, session.id);
  const selection = activeChoice(state, mine);

  if (state.room.status === "lobby") {
    return <RoleReveal state={state} session={session} onLeave={onLeave} />;
  }

  const round = state.currentRound;
  if (!round) return <LoadingScreen view="player" onLeave={onLeave} />;

  return (
    <section className="player-page">
      <PlayerHeader role={session.role} score={mine?.score ?? 0} rank={rank} />
      <div className="player-mission">
        <p className="round-eyebrow">{round.eyebrow}</p>
        <div className="player-timer">{formatTime(secondsLeft)}</div>
        <h1>{round.title}</h1>
        <p>{round.prompt}</p>
        {round.id === "power-duo" ? (
          <div className="social-callout">
            <span>🔗</span>
            <div>
              <strong>NOT NETWORKING THEATRE.</strong>
              <p>Your shared move gives the whole room a shield.</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="player-role-strip">
        <span>{session.role.emoji}</span>
        <p>
          <strong>{session.role.label.toUpperCase()}</strong>
          {session.role.mission}
        </p>
      </div>
      <div className="choice-stack" aria-label="Choose your move">
        {round.choices.map((choice) => {
          const selected = selection?.id === choice.id;
          return (
            <button
              type="button"
              key={choice.id}
              className={`choice-button ${selected ? "choice-selected" : ""}`}
              disabled={busy.startsWith("choice:")}
              onClick={() => onAction(choice)}
            >
              <span className="choice-emoji">{choice.emoji}</span>
              <span className="choice-label">
                <strong>{selected ? "LOCKED IN · " : ""}{choice.label}</strong>
                <small>{choice.description}</small>
              </span>
              <span className="choice-points">+{choice.points}</span>
            </button>
          );
        })}
      </div>
      <div className="player-footer">
        <span>{mine?.hasActed ? "Your move is powering the room." : "Pick one move. You can change it before the phase ends."}</span>
        <strong>{state.progress.playerCount} PLAYING</strong>
      </div>
    </section>
  );
}

function JoinScreen({
  state,
  busy,
  onJoin,
  onLeave,
}: {
  state: RoomState;
  busy: string;
  onJoin: (name: string) => void;
  onLeave: () => void;
}) {
  const [name, setName] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onJoin(name);
  };

  return (
    <section className="join-page">
      <div className="player-topline">
        <BrandMark compact />
        <span>ROOM {state.room.code}</span>
      </div>
      <div className="join-hero">
        <div className="join-icon" aria-hidden="true">✦</div>
        <p className="kicker">YOU JUST WALKED IN?</p>
        <h1>PERFECT.</h1>
        <p>This room needs one more hero. Drop your name in and we&apos;ll give you a secret job.</p>
      </div>
      <form className="join-form" onSubmit={submit}>
        <label htmlFor="player-name">What should the crew call you?</label>
        <input
          id="player-name"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 18))}
          placeholder="YOUR NAME"
          autoComplete="nickname"
          inputMode="text"
          autoFocus
        />
        <button className="button button-lime button-xl" disabled={busy === "join"} type="submit">
          {busy === "join" ? "JOINING…" : "JOIN THE RAID"}
          <span aria-hidden="true">→</span>
        </button>
      </form>
      <p className="join-fineprint">No account. No contact list. No one is judging your name.</p>
      <button type="button" className="text-button join-leave" onClick={onLeave}>Wrong room? Go home</button>
    </section>
  );
}

function RoleReveal({
  state,
  session,
  onLeave,
}: {
  state: RoomState;
  session: PlayerSession;
  onLeave: () => void;
}) {
  return (
    <section className="role-page">
      <div className="player-topline">
        <BrandMark compact />
        <span>YOU&apos;RE IN</span>
      </div>
      <div className="role-card">
        <p className="kicker">YOUR SECRET ROLE</p>
        <span className="role-emoji" aria-hidden="true">{session.role.emoji}</span>
        <h1>{session.role.label.toUpperCase()}</h1>
        <p>{session.role.mission}</p>
        <div className="role-rule">
          <span>THE MISSION</span>
          <strong>{state.scenario.lobbyPrompt}</strong>
        </div>
      </div>
      <div className="waiting-card">
        <span className="pulse-dot" />
        <div>
          <strong>WAITING FOR THE HOST</strong>
          <p>{state.players.length} raiders are in. Keep this tab open—your first move is coming.</p>
        </div>
      </div>
      <button type="button" className="text-button role-leave" onClick={onLeave}>Leave room</button>
    </section>
  );
}

function PlayerHeader({ role, score, rank }: { role: GameRole; score: number; rank: number | null }) {
  return (
    <header className="player-header">
      <span className="role-badge">{role.emoji} {role.label.toUpperCase()}</span>
      <span>{score} PTS · {rank ? `#${rank}` : "SYNCING"}</span>
    </header>
  );
}

function Leaderboard({ state }: { state: RoomState }) {
  return (
    <aside className="leaderboard">
      <div className="leaderboard-heading">
        <span>LIVE SCORES</span>
        <strong>LEADERBOARD</strong>
      </div>
      {state.leaderboard.length ? (
        <ol>
          {state.leaderboard.slice(0, 5).map((player, index) => (
            <li key={player.id} className={index === 0 ? "leader" : ""}>
              <span className="leader-rank">0{index + 1}</span>
              <span className="leader-name">{player.name}</span>
              <strong>{player.score}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <div className="leaderboard-empty">
          <span>✦</span>
          <p>First scan gets the top spot.</p>
        </div>
      )}
      <div className="leaderboard-foot">
        <span>POWERED BY</span>
        <strong>THE ROOM</strong>
      </div>
    </aside>
  );
}

function ResultsScreen({
  state,
  session,
  isHost,
  busy = "",
  onReset,
  onLeave,
}: {
  state: RoomState;
  session?: PlayerSession | null;
  isHost: boolean;
  busy?: string;
  onReset?: () => void;
  onLeave: () => void;
}) {
  const rank = playerRank(state, session?.id ?? undefined);
  const mine = state.players.find((player) => player.id === session?.id);
  const powerDuo = state.players.filter((player) => player.lastAction === "power-duo" || player.lastAction === "squad-up").length;
  const top = state.leaderboard.slice(0, 3);

  if (!isHost) {
    return (
      <section className="player-results">
        <div className="victory-burst" aria-hidden="true">✦ ✦ ✦</div>
        <p className="kicker">ROOMRAID COMPLETE</p>
        <h1>YOU HELPED SAVE THE ROOM.</h1>
        <div className="player-score-card">
          <span>YOUR SCORE</span>
          <strong>{mine?.score ?? 0}</strong>
          <p>{rank ? `You finished #${rank} in the crew.` : "Your score is syncing."}</p>
        </div>
        <p className="next-move">
          <strong>Your next move:</strong> Ask the person you met, “What are you building next?”
        </p>
        <button type="button" className="button button-lime button-xl" onClick={onLeave}>BACK TO SIDEQUEST</button>
      </section>
    );
  }

  return (
    <section className="results-page">
      <header className="projector-header">
        <BrandMark compact />
        <div className="projector-mission">
          <span className="live-pill complete-pill"><i /> COMPLETE</span>
          <strong>ROOM {state.room.code}</strong>
        </div>
      </header>
      <div className="results-hero">
        <div className="confetti confetti-one" />
        <div className="confetti confetti-two" />
        <div className="confetti confetti-three" />
        <p className="kicker">MISSION COMPLETE</p>
        <h1>DEMO DEMON<br /><span>DEFEATED.</span></h1>
        <p>{state.progress.playerCount} people chose chaos over awkward silence.</p>
      </div>
      <div className="room-report">
        <div className="results-leaders">
          <p className="kicker">MVP CREW</p>
          {top.length ? top.map((player, index) => (
            <div className="result-leader" key={player.id}>
              <span>0{index + 1}</span>
              <strong>{player.name}</strong>
              <em>{player.score}</em>
            </div>
          )) : <p>No scores landed—but the room still showed up.</p>}
        </div>
        <div className="report-panel">
          <p className="kicker">ROOM REPORT</p>
          <div className="report-grid">
            <div><strong>{state.progress.playerCount}</strong><span>joined the raid</span></div>
            <div><strong>{powerDuo}</strong><span>power-duo moves</span></div>
            <div><strong>{state.progress.actionCount}</strong><span>team moves landed</span></div>
          </div>
          <p className="report-closing">You have one person to talk to now. Go find them before the next thing starts.</p>
        </div>
      </div>
      <div className="results-actions">
        <button
          type="button"
          className="button button-lime button-xl"
          disabled={!onReset || busy === "reset"}
          onClick={onReset}
        >
          {busy === "reset" ? "RESETTING…" : "PLAY ANOTHER RAID"}
        </button>
        <button type="button" className="button button-ghost" onClick={onLeave}>END ROOM</button>
      </div>
    </section>
  );
}

function Demon({
  health,
  mood,
  large = false,
}: {
  health: number;
  mood: "idle" | "hit" | "angry";
  large?: boolean;
}) {
  return (
    <div
      className={`demon demon-${mood} ${large ? "demon-large" : ""}`}
      style={{ "--demon-health": `${health}%` } as CSSProperties}
      role="img"
      aria-label={`Demo Demon at ${Math.round(health)} percent strength`}
    >
      <span className="demon-horn horn-left" />
      <span className="demon-horn horn-right" />
      <div className="demon-body">
        <div className="demon-brow" />
        <div className="demon-eye eye-left"><i /></div>
        <div className="demon-eye eye-right"><i /></div>
        <div className="demon-mouth"><i /><i /><i /><i /></div>
      </div>
      <span className="demon-arm arm-left">⌁</span>
      <span className="demon-arm arm-right">⌁</span>
    </div>
  );
}
