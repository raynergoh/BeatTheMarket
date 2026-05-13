# Deployment Checklist

This document outlines the standard checklist and procedures to ensure safe, consistent, and reliable deployments for the BeatTheMarket application. All engineers must follow these steps before merging into the `main` branch and deploying to production.

## 1. Pre-Commit / Local Verification

Before creating a pull request or pushing to `main`, ensure the following checks pass locally:

- [ ] **Linting & Code Quality**: Run `npm run lint` to ensure no ESLint errors exist.
- [ ] **Type Checking**: Ensure all TypeScript errors are resolved (Next.js build will fail if there are TS errors).
- [ ] **Unit & Integration Tests**: Run `npm run test` (Vitest) to ensure all tests pass.
- [ ] **Local Build**: Run `npm run build` locally to catch any build-time errors (e.g., missing environment variables, Next.js static generation errors).
- [ ] **Clean Working Directory**: Ensure no unintended files (e.g., debug scripts, local `.env` files) are staged for commit. Review `git status` and `git diff`.

## 2. CI/CD Pipeline Checks

Once pushed to a branch or opened as a PR, the automated CI pipeline should verify:

- [ ] **Continuous Integration (CI) Pass**: The CI pipeline has successfully built the project, linted the code, and run all tests.
- [ ] **Code Review (PRs)**: For team environments, at least one other engineer has reviewed and approved the pull request.
- [ ] **Preview Deployment**: If deploying via platforms like Vercel or Netlify, verify the preview URL to ensure UI/UX changes look correct and no runtime errors occur on the deployed environment.

## 3. Pre-Deployment Configuration

- [ ] **Environment Variables**: Ensure all required environment variables are set in the production environment (e.g., API keys, database URLs, etc.).
- [ ] **Database Migrations**: If applicable, ensure any database schema changes or migrations have been tested and are ready to run before or alongside the deployment.
- [ ] **Third-Party Integrations**: Verify API limits, quotas, or any breaking changes to external APIs (e.g., Yahoo Finance API, IBKR) are accounted for.

## 4. Deployment

- [ ] **Merge to Main**: Merge the verified branch into `main`.
- [ ] **Monitor Deployment**: Monitor the production deployment pipeline (e.g., Vercel Dashboard, GitHub Actions). Ensure it completes successfully.

## 5. Post-Deployment Verification

After the deployment finishes, verify the live production environment:

- [ ] **Smoke Testing**: Open the production app in an incognito window and perform core user flows (e.g., checking holdings, validating API connections).
- [ ] **Console Logs**: Open browser developer tools and verify there are no unexpected frontend console errors.
- [ ] **Error Monitoring**: Check error tracking tools (e.g., Sentry, Datadog, or server logs) for any new spikes in errors or warnings.
- [ ] **Performance**: Verify the app feels responsive and no significant performance regressions were introduced.

## 6. Rollback Plan

- [ ] **Revert Procedure**: If critical issues are found, be prepared to immediately revert the commit or use the hosting provider's instant rollback feature to point to the previous stable release.
