// src/hooks/useLiveKitRoom.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import { supabase } from "../lib/supabase";
import { useSound } from "./useSound";
import { useToast } from "../components/Toast";

export interface CallParticipantView {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  cameraTrack: Track | null;
  micTrack: Track | null;
  screenShareTrack: Track | null;
  cameraMuted: boolean;
  micMuted: boolean;
}

export type CallConnectionState = "idle" | "connecting" | "connected" | "error" | "not_configured";

function toView(p: Participant, isLocal: boolean): CallParticipantView {
  const camPub = [...p.videoTrackPublications.values()].find((t) => t.source === Track.Source.Camera);
  const micPub = [...p.audioTrackPublications.values()].find((t) => t.source === Track.Source.Microphone);
  const screenPub = [...p.videoTrackPublications.values()].find((t) => t.source === Track.Source.ScreenShare);
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    cameraTrack: camPub?.track ?? null,
    micTrack: micPub?.track ?? null,
    screenShareTrack: screenPub?.track ?? null,
    cameraMuted: camPub?.isMuted ?? true,
    micMuted: micPub?.isMuted ?? true,
  };
}

// Wraps livekit-client's Room for a single Meeting project's call.
// The join token comes from the `mint-meeting-token` edge function
// described in MEETING_INFRA.md — that function doesn't exist in a
// fresh Supabase project, so join() surfaces that as the explicit
// "not_configured" state rather than hanging or silently failing.
// Everything past that point (connect, publish, screen share,
// rendering remote tracks) is real livekit-client API, not a stub.
export function useLiveKitRoom(projectId: string | undefined) {
  const roomRef = useRef<Room | null>(null);
  const [connectionState, setConnectionState] = useState<CallConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CallParticipantView[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const { play } = useSound();
  const toast = useToast();

  const refreshParticipants = useCallback((room: Room) => {
    setParticipants([
      toView(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].map((p) => toView(p, false)),
    ]);
  }, []);

  const join = useCallback(async (options?: { mic?: boolean; camera?: boolean }) => {
    if (!projectId || roomRef.current) return;
    const wantMic = options?.mic ?? true;
    const wantCamera = options?.camera ?? true;
    setConnectionState("connecting");
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("mint-meeting-token", {
        body: { projectId },
      });
      if (error || !data?.token || !data?.url) {
        setConnectionState("not_configured");
        setErrorMessage(
          "Video calling isn't connected yet — this project needs a LiveKit account and the mint-meeting-token function (see MEETING_INFRA.md)."
        );
        play("error");
        return;
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room
        .on(RoomEvent.ParticipantConnected, () => refreshParticipants(room))
        .on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room))
        .on(RoomEvent.TrackSubscribed, () => refreshParticipants(room))
        .on(RoomEvent.TrackUnsubscribed, () => refreshParticipants(room))
        .on(RoomEvent.LocalTrackPublished, () => refreshParticipants(room))
        .on(RoomEvent.LocalTrackUnpublished, () => refreshParticipants(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(room))
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setConnectionState("idle");
          setParticipants([]);
          setMicEnabled(false);
          setCameraEnabled(false);
          setScreenShareEnabled(false);
          play("room-leave");
          // Matches the existing room-leave sound with the visual
          // moment it was missing — "no room join/leave visual" in
          // MICRO_INTERACTIONS.md. Fires for any disconnect (explicit
          // leave, kicked, connection drop) since all three end the
          // same way for this user: no longer in the call.
          toast("You left the meeting.");
        });

      await room.connect(data.url as string, data.token as string);

      // Respect whatever the lobby's device preview left mic/camera
      // set to, rather than forcing both on — same as Zoom/Meet
      // carrying your lobby mute choice into the actual call.
      await Promise.all([
        room.localParticipant.setMicrophoneEnabled(wantMic),
        room.localParticipant.setCameraEnabled(wantCamera),
      ]);
      setMicEnabled(wantMic);
      setCameraEnabled(wantCamera);
      setConnectionState("connected");
      refreshParticipants(room);
      play("room-join");
      toast("You joined the meeting.", { variant: "success" });
    } catch (err) {
      setConnectionState("error");
      setErrorMessage(err instanceof Error ? err.message : "Couldn't join the meeting.");
      play("error");
    }
  }, [projectId, refreshParticipants, play]);

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }, [micEnabled]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !screenShareEnabled;
      await room.localParticipant.setScreenShareEnabled(next);
      setScreenShareEnabled(next);
    } catch {
      // Most commonly the browser's own share picker was cancelled —
      // not a real error, just stays off.
      setScreenShareEnabled(false);
    }
  }, [screenShareEnabled]);

  // Disconnect on unmount so leaving the page doesn't leave a ghost
  // participant published in the room.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
    };
  }, []);

  return {
    connectionState,
    errorMessage,
    participants,
    micEnabled,
    cameraEnabled,
    screenShareEnabled,
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}
