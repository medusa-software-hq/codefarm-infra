# Codefarm infrastructure

Codefarm's infrastructure, declared as code with Pulumi.

The `base` stack manages what Codefarm's environments share. The `app` stack is applied once per environment with the same code: to staging first, then to production.

Changes are proposed as pull requests, previewed there, and applied after merging. Each stack has its own workflows, so a change that one stack depends on in the other needs a pull request of its own.

From scratch, each step needs the previous one:

1. The foundation creates Codefarm's projects and the containers for the Cloudflare minter tokens.
2. An admin adds the minter tokens.
3. `base` is applied.
4. "Rotate app secrets" runs.
5. `app` is applied.
