"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The live connection to a room's Durable Object.
 *
 * Replaces the 1300ms polling loop in SideQuestClient. Identity is restored
 * from localStorage on reconnect so a phone that loses venue wifi comes back as
 * the same player with the same score, rather than as a duplicate.
 *
 * Tokens are kept out of the URL and sent in the first socket message instead.
 */

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "failed";

export type RoomView = {
  code: string;
  players: { id: string; name: string }[];
  activeGameId: string | null;
  catalog: { id: string; title: string; tagline: string; minPlayers: number }[];
};

export type Results = {
  headline: string;
  scores: { playerId: string; name: string; points: number }[];
};

type Options = {
  code: string;
  role: "host" | "player";
  /** Players only. Absent until the join form is submitted. */
  name?: string | null;
};

const RECONNECT_BASE_MS = 400;
const RECONNECT_MAX_MS = 5_000;

const storageKey = (role: string, code: string) => `bounce:${role}:${code}`;

function readStored(role: string, code: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(role, code));
  } catch {
    return null; // Safari private mode and similar.
  }
}

function writeStored(role: string, code: string, token: string) {
  try {
    window.localStorage.setItem(storageKey(role, code), token);
  } catch {
    // Not fatal: the session just won't survive a refresh.
  }
}

export function useRoomSocket({ code, role, name }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [view, setView] = useState<Record<string, unknown> | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ playerId: string; name: string } | null>(null);

  const socket = useRef<WebSocket | null>(null);
  const attempts = useRef(0);
  const closed = useRef(false);

  const send = useCallback((message: unknown) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    if (!code) return;
    // `name` is already a dependency below, so the effect reconnects when it
    // arrives; no ref is needed to reach the latest value.
    if (role === "player" && !name && !readStored("player", code)) return;

    closed.current = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${code}/live`);
      socket.current = ws;

      ws.onopen = () => {
        attempts.current = 0;
        setStatus("live");
        setError(null);

        if (role === "host") {
          send({ type: "hello", role: "host", hostToken: readStored("host", code) ?? undefined });
        } else {
          send({
            type: "hello",
            role: "player",
            name: name ?? undefined,
            playerToken: readStored("player", code) ?? undefined,
          });
        }
      };

      ws.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }

        switch (message.type) {
          case "welcome": {
            if (typeof message.hostToken === "string") writeStored("host", code, message.hostToken);
            if (typeof message.playerToken === "string") writeStored("player", code, message.playerToken);
            if (typeof message.playerId === "string") {
              setMe({ playerId: message.playerId, name: String(message.name ?? "") });
            }
            break;
          }
          case "room":
            setRoom(message as unknown as RoomView);
            break;
          case "view":
            setView(message.view as Record<string, unknown>);
            setResults(null);
            break;
          case "results":
            setResults(message.results as Results);
            break;
          case "game:ended":
            setView(null);
            break;
          case "error":
            setError(String(message.error));
            break;
        }
      };

      ws.onclose = () => {
        if (closed.current) return;
        setStatus("reconnecting");
        // Venue wifi drops constantly, so back off but never give up entirely.
        attempts.current += 1;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempts.current - 1), RECONNECT_MAX_MS);
        retry = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed.current = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [code, role, name, send]);

  return { status, room, view, results, error, me, send, setError };
}

/** Short, sharp haptic. No-op where the Vibration API is unsupported. */
export function buzz(pattern: number | number[] = 18) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Ignore; haptics are a nicety.
  }
}
