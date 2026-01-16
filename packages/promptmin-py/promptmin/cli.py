import argparse
from .minimize import minimize


def main() -> int:
    p = argparse.ArgumentParser(prog="promptmin-py")
    p.add_argument("--prompt", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--out", default=".promptmin/out")
    p.add_argument("--target", default="suite:any")
    args = p.parse_args()

    result = minimize(prompt_path=args.prompt, config_path=args.config, out_dir=args.out, target=args.target)
    return result.exit_code


if __name__ == "__main__":
    raise SystemExit(main())

