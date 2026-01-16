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
        packages_dir = Path(__file__).resolve().parents[2]
        node_entry = os.environ.get("PROMPTMIN_NODE_ENTRY") or str(packages_dir / "promptmin-cli" / "dist" / "cli.js")
        cmd = [
            "node",
            node_entry,
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
    completed = subprocess.run(cmd, check=False)
    return MinimizeResult(exit_code=int(completed.returncode), out_dir=out_dir)
