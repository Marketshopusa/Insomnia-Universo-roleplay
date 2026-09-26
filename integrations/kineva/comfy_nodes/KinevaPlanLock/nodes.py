from __future__ import annotations

import copy
import json
import re

from comfy_api.latest import ComfyExtension, io

StoryPlan = io.Custom("STORY_PLAN")
CATEGORY = "Kineva/Control"

def _visible_characters(plan):
    cast = (plan or {}).get("cast") or {}
    return [
        c for c in (cast.get("characters") or [])
        if c.get("seen") is not False
        and str(c.get("name") or "").strip()
    ]

class KinevaPlanLock(io.ComfyNode):
    """Deterministic guardrail between Story Planner and Director."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="KinevaPlanLock",
            display_name="KINEVA PLAN LOCK",
            category=CATEGORY,
            description=(
                "Locks planner output for Kineva production profiles. "
                "TALKING_PRESENTER removes accidental POV/cuts and preserves "
                "only the supplied exact dialogue as speech."
            ),
            inputs=[
                StoryPlan.Input("story_plan"),
                io.Combo.Input(
                    "profile",
                    options=["MINISERIES", "TALKING_PRESENTER", "CINEMATIC"],
                    default="TALKING_PRESENTER",
                ),
                io.Boolean.Input("preserve_dialogue", default=True),
                io.Boolean.Input("force_single_take", default=True),
                io.Boolean.Input("presenter_visible", default=True),
                io.Boolean.Input("lock_camera", default=True),
                io.String.Input(
                    "camera_rule",
                    default="locked medium close-up / half-body shot, presenter visible",
                    multiline=False,
                ),
                io.String.Input("exact_dialogue", default="", multiline=True),
                io.String.Input("dialogue_language", default="Spanish", multiline=False),
                io.String.Input("project_id", default="", multiline=False),
            ],
            outputs=[
                StoryPlan.Output(display_name="story_plan"),
                io.String.Output(display_name="lock_report"),
                io.String.Output(display_name="locked_plan_json"),
            ],
        )

    @classmethod
    def execute(
        cls,
        story_plan,
        profile="TALKING_PRESENTER",
        preserve_dialogue=True,
        force_single_take=True,
        presenter_visible=True,
        lock_camera=True,
        camera_rule="locked medium close-up / half-body shot, presenter visible",
        exact_dialogue="",
        dialogue_language="Spanish",
        project_id="",
    ):
        plan = copy.deepcopy(story_plan or {})
        profile = str(profile or "MINISERIES").strip().upper()
        chars = _visible_characters(plan)
        primary = str(chars[0].get("name") or "").strip() if chars else ""

        report = {
            "version": 1,
            "profile": profile,
            "primary_character": primary,
            "changes": [],
            "warnings": [],
        }

        shots = plan.get("shots") or []
        project_id = str(project_id or "").strip()
        if project_id:
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", project_id):
                raise ValueError("Unsafe Kineva project ID")
            plan["_project_id"] = project_id
            report["changes"].append("Persistent project identity locked.")

        if profile == "TALKING_PRESENTER":
            exact_dialogue = str(exact_dialogue or "").strip()
            if preserve_dialogue and (not exact_dialogue or len(shots) != 1 or not primary):
                raise ValueError(
                    "TALKING_PRESENTER requires exact_dialogue, one shot, "
                    "and a visible speaker; visual instructions are not spoken dialogue."
                )

            for i, shot in enumerate(shots):
                if presenter_visible and shot.get("pov"):
                    report["changes"].append(
                        f"shot {i}: pov '{shot.get('pov')}' -> ''"
                    )
                    shot["pov"] = ""

                if primary:
                    names = list(shot.get("characters") or [])
                    if primary not in names:
                        names.insert(0, primary)
                        shot["characters"] = names
                        report["changes"].append(
                            f"shot {i}: primary character forced visible"
                        )

                if lock_camera:
                    old_camera = str(shot.get("camera") or "")
                    shot["camera"] = camera_rule
                    if old_camera != camera_rule:
                        report["changes"].append(
                            f"shot {i}: camera locked"
                        )

                if force_single_take:
                    for b, beat in enumerate(shot.get("beats") or []):
                        if bool(beat.get("cut")):
                            report["changes"].append(
                                f"shot {i} beat {b}: cut true -> false"
                            )
                        beat["cut"] = False
                        beat["camera"] = ""

                if preserve_dialogue and primary:
                    source_text = exact_dialogue
                    if source_text:
                        old_dialogue = shot.get("dialogue") or []
                        language = str(dialogue_language or "Spanish").strip()
                        delivery = "naturally and conversationally"
                        if old_dialogue:
                            delivery = str(
                                old_dialogue[0].get("delivery") or delivery
                            )

                        old_line = " ".join(
                            str(d.get("line") or "").strip()
                            for d in old_dialogue
                            if str(d.get("line") or "").strip()
                        ).strip()

                        shot["dialogue"] = [{
                            "speaker": primary,
                            "language": language,
                            "line": source_text,
                            "delivery": delivery,
                            "off_screen": False,
                        }]

                        if old_line != source_text:
                            report["changes"].append(
                                f"shot {i}: exact spoken dialogue restored"
                            )

                shot["action"] = str(shot.get("action") or "")
                if force_single_take:
                    shot["continuity"] = "single continuous take"

        elif profile == "MINISERIES":
            exact_dialogue = str(exact_dialogue or "").strip()
            if preserve_dialogue and exact_dialogue:
                if len(shots) != 1 or not primary:
                    raise ValueError(
                        "An exact miniseries segment requires one shot and a visible speaker."
                    )
                shot = shots[0]
                previous = shot.get("dialogue") or []
                language = str(dialogue_language or "Spanish").strip()
                delivery = str(
                    previous[0].get("delivery") or "naturally"
                ) if previous else "naturally"
                shot["dialogue"] = [{
                    "speaker": primary,
                    "language": language,
                    "line": exact_dialogue,
                    "delivery": delivery,
                    "off_screen": False,
                }]
                characters = list(shot.get("characters") or [])
                if primary not in characters:
                    shot["characters"] = [primary, *characters]
                report["changes"].append(
                    "MINISERIES exact spoken segment restored."
                )
            else:
                report["changes"].append(
                    "MINISERIES profile: planner structure preserved."
                )

        elif profile == "CINEMATIC":
            report["changes"].append(
                "CINEMATIC profile: planner cuts and POV preserved."
            )

        plan["_kineva_plan_lock"] = {
            "enabled": True,
            "profile": profile,
            "preserve_dialogue": bool(preserve_dialogue),
            "force_single_take": bool(force_single_take),
            "presenter_visible": bool(presenter_visible),
            "lock_camera": bool(lock_camera),
            "camera_rule": camera_rule,
            "report": report,
        }

        locked_json = json.dumps(plan, ensure_ascii=False, indent=2)
        return io.NodeOutput(
            plan,
            json.dumps(report, ensure_ascii=False, indent=2),
            locked_json,
        )


def _one_shot_h3_frames(story_plan):
    shots = (story_plan or {}).get("shots") or []
    if len(shots) != 1:
        raise ValueError("Depth guide needs exactly one locked shot")
    requested = shots[0].get("frames")
    if isinstance(requested, bool) or not isinstance(requested, int):
        raise ValueError("Depth guide needs an integer frame count")
    if not 124 <= requested <= 362:
        raise ValueError("Depth guide requires a trained H3 duration of 124-362 frames")
    aligned = requested + (5 - requested) % 17
    if aligned > 362:
        raise ValueError("Depth guide exceeds the 362-frame H3 range")
    return aligned


class KinevaH3FrameCount(io.ComfyNode):
    """Size a one-shot visual guide to H3's actual 17k+5 duration."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="KinevaH3FrameCount",
            display_name="Kineva H3 Frame Count",
            category=CATEGORY,
            description="Round the locked one-shot plan to H3's 17k+5 frame grid.",
            inputs=[StoryPlan.Input("story_plan")],
            outputs=[io.Int.Output(display_name="aligned_frames")],
        )

    @classmethod
    def execute(cls, story_plan):
        return io.NodeOutput(_one_shot_h3_frames(story_plan))


class KinevaPlanLockExtension(ComfyExtension):
    async def get_node_list(self):
        return [KinevaPlanLock, KinevaH3FrameCount]

async def comfy_entrypoint():
    return KinevaPlanLockExtension()
