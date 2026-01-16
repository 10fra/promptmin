from __future__ import annotations

import dataclasses
import os
import subprocess
import shutil
from pathlib import Path


@dataclasses.dataclass(frozen=True)
class MinimizeResult:
    exit_code: int
    out_dir: str

    @property
    def minimized_prompt_path(self) -> str:
        return str(Path(self.out_dir) / "minimized.prompt")

    @property
    def report_path(self) -> str:
        return str(Path(self.out_dir) / "report.md")


def minimize(*, prompt_path: str, config_path: str, out_dir: str = ".promptmin/out", target: str = "suite:any") -> MinimizeResult:
    promptmin_bin = os.environ.get("PROMPTMIN_BIN") or shutil.which("promptmin")
    if promptmin_bin:
        cmd = [
            promptmin_bin,
            "minimize",
            "--prompt",
            prompt_path,
            "--config",
            config_path,
            "--out",
            out_dir,
            "--target",
            target,
        ]
    else:
        node_entry_env = os.environ.get("PROMPTMIN_NODE_ENTRY")
        node_entry = node_entry_env or find_repo_node_entry()
        if not node_entry:
            raise RuntimeError("promptmin binary not found; install via `npm install -g promptmin` or set PROMPTMIN_BIN")
        cmd = ["node", node_entry, "minimize", "--prompt", prompt_path, "--config", config_path, "--out", out_dir, "--target", target]
    completed = subprocess.run(cmd, check=False)
    return MinimizeResult(exit_code=int(completed.returncode), out_dir=out_dir)


def find_repo_node_entry() -> str | None:
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        candidate = parent / "packages" / "promptmin-cli" / "dist" / "cli.js"
        if candidate.exists():
            return str(candidate)
    return None
