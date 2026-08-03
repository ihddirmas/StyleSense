"""CORS origin allowlist tests (no server required)."""
import re
import unittest

_CORS_ORIGIN_REGEX = (
    r"https://([a-z0-9-]+\.)*vercel\.app"
    r"|https://([a-z0-9-]+\.)*stylesense\.ai"
)


def _origin_allowed(origin: str, extra: set[str] | None = None) -> bool:
    if extra and origin in extra:
        return True
    return bool(re.fullmatch(_CORS_ORIGIN_REGEX, origin))


class TestCorsOrigins(unittest.TestCase):
    def test_vercel_production(self):
        self.assertTrue(_origin_allowed("https://my-app.vercel.app"))

    def test_vercel_preview(self):
        self.assertTrue(_origin_allowed("https://style-sense-git-master-foo.vercel.app"))

    def test_stylesense_custom_domain(self):
        self.assertTrue(_origin_allowed("https://app.stylesense.ai"))
        self.assertTrue(_origin_allowed("https://stylesense.ai"))

    def test_localhost_not_regex(self):
        self.assertFalse(_origin_allowed("http://localhost:3000"))
        self.assertTrue(_origin_allowed("http://localhost:3000", extra={"http://localhost:3000"}))

    def test_random_origin_blocked(self):
        self.assertFalse(_origin_allowed("https://evil.example.com"))


if __name__ == "__main__":
    unittest.main()
