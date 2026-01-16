import unittest


class SmokeTest(unittest.TestCase):
    def test_import(self) -> None:
        import promptmin  # noqa: F401


if __name__ == "__main__":
    unittest.main()

