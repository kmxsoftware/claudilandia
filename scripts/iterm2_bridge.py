#!/usr/bin/env python3
"""
iTerm2 Python API Bridge for Claudilandia.
Connects to iTerm2 via WebSocket, streams styled terminal content.
Protocol: JSON lines on stdin (commands) and stdout (responses).

Commands (stdin):
  {"cmd":"watch","sessionId":"xxx"}  - Start streaming styled content
  {"cmd":"stop"}                      - Stop current streaming
  {"cmd":"quit"}                      - Shutdown bridge

Responses (stdout):
  {"type":"ready"}
  {"type":"profile","sessionId":"xxx","colors":{...}}
  {"type":"content","sessionId":"xxx","lines":[...],"cursor":{...},"cols":N,"rows":N}
  {"type":"error","message":"xxx"}
  {"type":"stopped"}
"""

import asyncio
import json
import sys
import iterm2

# Globals
streaming_task = None
stop_event = None


def emit(obj):
    """Write a JSON line to stdout."""
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()


def emit_error(msg):
    emit({"type": "error", "message": str(msg)})


# --- Color Resolution ---

def get_profile_colors(profile):
    """Read ANSI palette + fg/bg/cursor from a profile. Returns dict."""
    colors = {}

    try:
        colors["fg"] = profile.foreground_color.hex
    except Exception:
        colors["fg"] = "#c7c7c7"

    try:
        colors["bg"] = profile.background_color.hex
    except Exception:
        colors["bg"] = "#000000"

    try:
        colors["cursor"] = profile.cursor_color.hex
    except Exception:
        colors["cursor"] = "#ffffff"

    ansi = []
    color_props = [
        "ansi_0_color", "ansi_1_color", "ansi_2_color", "ansi_3_color",
        "ansi_4_color", "ansi_5_color", "ansi_6_color", "ansi_7_color",
        "ansi_8_color", "ansi_9_color", "ansi_10_color", "ansi_11_color",
        "ansi_12_color", "ansi_13_color", "ansi_14_color", "ansi_15_color",
    ]
    for prop_name in color_props:
        try:
            c = getattr(profile, prop_name)
            ansi.append(c.hex)
        except Exception:
            ansi.append("#c7c7c7")

    colors["ansi"] = ansi
    return colors


def resolve_cell_color(color, ansi_palette):
    """Resolve a CellStyle.Color to hex string. Returns None for default."""
    if color is None:
        return None

    if color.is_rgb:
        rgb = color.rgb
        return f"#{rgb.red:02x}{rgb.green:02x}{rgb.blue:02x}"
    elif color.is_standard:
        idx = color.standard
        if 0 <= idx < 16 and idx < len(ansi_palette):
            return ansi_palette[idx]
        elif 16 <= idx < 232:
            # 6x6x6 color cube
            idx -= 16
            r = (idx // 36) * 51
            g = ((idx % 36) // 6) * 51
            b = (idx % 6) * 51
            return f"#{r:02x}{g:02x}{b:02x}"
        elif 232 <= idx < 256:
            v = (idx - 232) * 10 + 8
            return f"#{v:02x}{v:02x}{v:02x}"
    elif color.is_alternate:
        alt = color.alternate
        # DEFAULT means use profile fg/bg color
        return None

    return None


# --- Screen Content Processing ---

def process_screen_contents(contents, ansi_palette):
    """Convert ScreenContents to wire format (list of lines, each a list of runs)."""
    lines = []
    num_lines = contents.number_of_lines

    for i in range(num_lines):
        line = contents.line(i)
        text = line.string
        runs = []

        if not text:
            lines.append(runs)
            continue

        current_text = ""
        current_style = None

        for x in range(len(text)):
            char = text[x]
            style = line.style_at(x)
            style_dict = style_to_dict(style, ansi_palette) if style else {}

            if style_dict == current_style:
                current_text += char
            else:
                if current_text:
                    run = {"t": current_text}
                    if current_style:
                        run.update(current_style)
                    runs.append(run)
                current_text = char
                current_style = style_dict

        if current_text:
            run = {"t": current_text}
            if current_style:
                run.update(current_style)
            runs.append(run)

        lines.append(runs)

    return lines


def style_to_dict(style, ansi_palette):
    """Convert CellStyle to compact dict."""
    if style is None:
        return {}

    d = {}

    try:
        fg = resolve_cell_color(style.fg_color, ansi_palette)
        if fg:
            d["fg"] = fg
    except Exception:
        pass

    try:
        bg = resolve_cell_color(style.bg_color, ansi_palette)
        if bg:
            d["bg"] = bg
    except Exception:
        pass

    try:
        if style.bold:
            d["b"] = True
    except Exception:
        pass

    try:
        if style.italic:
            d["i"] = True
    except Exception:
        pass

    try:
        if style.underline:
            d["u"] = True
    except Exception:
        pass

    try:
        if style.strikethrough:
            d["s"] = True
    except Exception:
        pass

    try:
        if style.inverse:
            d["inv"] = True
    except Exception:
        pass

    try:
        if style.faint:
            d["f"] = True
    except Exception:
        pass

    return d


# --- Streaming ---

async def stream_session(connection, session_id, ansi_palette):
    """Stream styled content from a session using ScreenStreamer."""
    global stop_event

    app = await iterm2.async_get_app(connection)
    session = app.get_session_by_id(session_id)
    if not session:
        emit_error(f"Session not found: {session_id}")
        return

    stop_event = asyncio.Event()

    try:
        async with session.get_screen_streamer(want_contents=True) as streamer:
            while not stop_event.is_set():
                try:
                    contents = await asyncio.wait_for(
                        streamer.async_get(style=True),
                        timeout=2.0
                    )
                except asyncio.TimeoutError:
                    if stop_event.is_set():
                        break
                    continue

                if contents is None or stop_event.is_set():
                    break

                lines = process_screen_contents(contents, ansi_palette)
                cursor_x = contents.cursor_coord.x
                cursor_y = contents.cursor_coord.y

                try:
                    cols = session.grid_size.width
                    rows = session.grid_size.height
                except Exception:
                    cols = 80
                    rows = 25

                emit({
                    "type": "content",
                    "sessionId": session_id,
                    "lines": lines,
                    "cursor": {"x": cursor_x, "y": cursor_y},
                    "cols": cols,
                    "rows": rows,
                })
    except iterm2.rpc.RPCException as e:
        emit_error(f"Session disconnected: {e}")
    except Exception as e:
        emit_error(f"Streaming error: {e}")


# --- Command Processing ---

async def process_command(connection, cmd_str):
    """Process a single command from stdin. Returns True to quit."""
    global streaming_task, stop_event

    try:
        cmd = json.loads(cmd_str.strip())
    except json.JSONDecodeError:
        emit_error("Invalid JSON")
        return False

    action = cmd.get("cmd")

    if action == "quit":
        if stop_event:
            stop_event.set()
        if streaming_task and not streaming_task.done():
            streaming_task.cancel()
            try:
                await streaming_task
            except (asyncio.CancelledError, Exception):
                pass
        return True

    elif action == "stop":
        if stop_event:
            stop_event.set()
        if streaming_task and not streaming_task.done():
            streaming_task.cancel()
            try:
                await streaming_task
            except (asyncio.CancelledError, Exception):
                pass
            streaming_task = None
        emit({"type": "stopped"})

    elif action == "watch":
        session_id = cmd.get("sessionId")
        if not session_id:
            emit_error("Missing sessionId")
            return False

        # Stop current streaming
        if stop_event:
            stop_event.set()
        if streaming_task and not streaming_task.done():
            streaming_task.cancel()
            try:
                await streaming_task
            except (asyncio.CancelledError, Exception):
                pass

        await asyncio.sleep(0.05)

        # Get profile colors
        app = await iterm2.async_get_app(connection)
        session = app.get_session_by_id(session_id)
        if not session:
            emit_error(f"Session not found: {session_id}")
            return False

        profile = await session.async_get_profile()
        palette = get_profile_colors(profile)
        ansi_palette = palette["ansi"]

        emit({"type": "profile", "sessionId": session_id, "colors": palette})

        # Fetch initial content so terminal shows current state immediately
        try:
            initial = await session.async_get_screen_contents()
            if initial:
                init_lines = process_screen_contents(initial, ansi_palette)
                try:
                    cols = session.grid_size.width
                    rows = session.grid_size.height
                except Exception:
                    cols, rows = 80, 25
                emit({
                    "type": "content",
                    "sessionId": session_id,
                    "lines": init_lines,
                    "cursor": {"x": initial.cursor_coord.x, "y": initial.cursor_coord.y},
                    "cols": cols,
                    "rows": rows,
                })
        except Exception as e:
            emit_error(f"Initial fetch failed: {e}")

        # Start streaming for ongoing updates
        streaming_task = asyncio.create_task(
            stream_session(connection, session_id, ansi_palette)
        )

    return False


# --- Stdin Reader ---

async def read_stdin(connection):
    """Read commands from stdin line by line."""
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line = await reader.readline()
        if not line:
            break
        should_quit = await process_command(connection, line.decode())
        if should_quit:
            break

    # Cleanup
    global stop_event, streaming_task
    if stop_event:
        stop_event.set()
    if streaming_task and not streaming_task.done():
        streaming_task.cancel()


# --- Main ---

async def main(connection):
    """Main coroutine - called after iTerm2 connection established."""
    emit({"type": "ready"})
    await read_stdin(connection)


iterm2.run_until_complete(main)
