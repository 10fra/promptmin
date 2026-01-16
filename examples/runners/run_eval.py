import json
import os
import sys


def main() -> int:
    prompt_text = os.environ.get("PROMPT_TEXT", "")
    test_json = os.environ.get("TEST_JSON", "{}")
    test = json.loads(test_json)
    user = (test.get("input") or {}).get("user", "")

    if "refund" in user.lower() and "ALWAYS_APPROVE_REFUNDS" in prompt_text:
        sys.stdout.write("Yes, you can get a refund.\n")
        return 0

    sys.stdout.write("No, we cannot offer a refund.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

