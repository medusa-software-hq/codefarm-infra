# Codefarm infrastructure

Codefarm's infrastructure, declared as code with Pulumi.

The `base` stack manages what Codefarm's environments share. The `app` stack is applied once per environment with the same code: to staging first, then to production.

Changes are proposed as pull requests, previewed there, and applied after merging.
