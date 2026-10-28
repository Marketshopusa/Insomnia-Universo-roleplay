"""High-fidelity Spanish narration synthesis and audio-video pacing synchronization for Kineva Studio."""
import asyncio
import os
import subprocess
from pathlib import Path
import edge_tts

DEFAULT_VOICE = "es-VE-SebastianNeural"

def pick_voice(text: str) -> str:
    # Default to Sebastian (warm, dramatic Latin American / Venezuelan voice)
    return DEFAULT_VOICE

async def _synthesize(text: str, out_path: str, voice: str):
    comm = edge_tts.Communicate(text, voice, rate="+2%")
    await comm.save(out_path)

def probe_duration(path: Path) -> float:
    res = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ], capture_output=True, text=True, check=True)
    return float(res.stdout.strip())

def sync_episode_narration(video_path: Path, script_text: str, destination: Path, voice: str = None) -> Path:
    video_path = Path(video_path).resolve(strict=True)
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    
    script_text = script_text.strip()
    if not script_text:
        return video_path
        
    voice = voice or pick_voice(script_text)
    temp_audio = destination.with_suffix(".narr.mp3")
    
    try:
        # 1. Synthesize crystal-clear Spanish narration with Edge TTS
        asyncio.run(_synthesize(script_text, str(temp_audio), voice))
        
        audio_dur = probe_duration(temp_audio)
        video_dur = probe_duration(video_path)
        
        print(f"[Kineva Narration] Audio: {audio_dur:.2f}s | Raw Video: {video_dur:.2f}s | Voice: {voice}", flush=True)
        
        fade_start = max(0.5, audio_dur - 1.0)
        video_filter = f"fade=t=out:st={fade_start:.2f}:d=1.0"
        
        # 2. Seamlessly match video duration to audio narration length
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            "-stream_loop", "-1", "-i", str(video_path),
            "-i", str(temp_audio),
            "-t", str(audio_dur),
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-vf", video_filter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "19",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            str(destination)
        ]
        subprocess.run(cmd, check=True)
        return destination
    finally:
        if temp_audio.exists():
            temp_audio.unlink(missing_ok=True)
