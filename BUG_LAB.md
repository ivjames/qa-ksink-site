# Bug Lab

This branch intentionally contains defects for the external QA bot to catch.

Seeded regressions in this first pass:

- Build info reports an intentional regression profile.
- Complex form currency normalization returns the wrong rounded value.
- Slow request reports the wrong completion delay.
- Product delete returns a body and HTTP 200 instead of the clean branch behavior.

Expected behavior:

- Running the bot against `main` should pass.
- Running the same bot against `bug-lab` should fail selected regression tests.
