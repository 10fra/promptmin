import os
import re
import sys


def main() -> int:
    prompt_text = os.environ.get("PROMPT_TEXT", "")
    markers = re.findall(r"\bODD_TOKEN_[A-Z]\b", prompt_text)
    if len(markers) % 2 == 0:
        sys.stdout.write("OK\n")
    else:
        sys.stdout.write("FAIL\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
