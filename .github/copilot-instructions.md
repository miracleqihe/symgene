# Sym Gen repository review guidance

- Treat `dev` as the integration branch and `main` as the production branch.
- Ordinary pull requests must target `dev`. A pull request targeting `main` must
  promote the same repository's `dev` branch without adding release-only fixes.
- For a `dev -> main` promotion, require the title
  `release: promote dev to main (YYYY-MM-DD)` and a completed promotion body
  covering the summary, included changes, verification, risks and rollback, and
  merge requirements.
- Flag unfilled HTML placeholders, unchecked checkboxes, unrelated changes, and
  promotion pull requests that request squash or rebase merging.
- Leave concise, actionable review comments. State the observed problem, why it
  matters, and the smallest correction the pull request author should make.
- Do not treat a passing CI run as human approval. `@miracleqihe` must approve a
  production promotion, and the promotion must use a merge commit.
- Before recommending a merge, expect `npm ci`, `npm run verify`, and
  `git diff --check` to pass.
- Do not propose unrelated changes to medical conclusions, risk levels, crisis
  copy, search ordering, local-data migrations, privacy boundaries, or UI.
