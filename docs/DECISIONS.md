# Architecture Decision Records (ADRs)

## ADR-001: Monorepo Tooling via pnpm Workspaces

- **Status**: Accepted
- **Context**: The platform contains multiple applications (NestJS API, React
  Admin, Flutter Mobile) and shared libraries (types, validation).
- **Decision**: Adopt `pnpm` workspaces for the monorepo.
- **Consequences**: Fast disk-efficient package deduplication via symlinks,
  native workspace dependency protocol (`workspace:*`), strict node_modules
  structure preventing phantom dependencies.

## ADR-002: Modular Monolith vs Microservices

- **Status**: Accepted
- **Context**: The requirements specify multi-tenant management, router
  synchronization, card printing, and billing. Microservices introduce premature
  operational complexity and latency overhead.
- **Decision**: Build a NestJS Modular Monolith with clean hexagonal/clean
  architecture boundaries within distinct domain modules.
- **Consequences**: Simple deployment, transactional consistency across database
  tables, streamlined local development without Docker orchestration
  requirement.

## ADR-003: Multi-Tenancy Strategy (Row-Level Multi-Tenancy)

- **Status**: Accepted
- **Context**: Target scale is thousands of HotSpot network owners with varying
  card volumes.
- **Decision**: Shared Database, Shared Schema with indexed `tenantId` on all
  tenant-owned entities.
- **Consequences**: Minimal infrastructure cost per tenant, centralized schema
  migrations via Prisma, strict requirement for tenant-scoped querying and
  repository enforcement.

## ADR-004: Encryption at Rest for MikroTik Credentials

- **Status**: Accepted
- **Context**: The platform connects to customer MikroTik routers using admin
  credentials. Storing credentials in plaintext is unacceptable.
- **Decision**: Encrypt all device credentials and sensitive tokens at rest
  using AES-256-GCM with an initialization vector (IV) and authentication tag.
- **Consequences**: Secure credential persistence; compromised database dumps do
  not reveal plaintext router passwords.

## ADR-005: Card Lifecycle State Machine

- **Status**: Accepted
- **Context**: HotSpot cards transition across multiple business and operational
  states.
- **Decision**: Formalize states into: `GENERATED` -> `AVAILABLE` -> `SOLD` ->
  `ACTIVE` -> `EXPIRED` / `DISABLED` Enforce transitions via a state machine
  table and validation checks to prevent invalid transitions (e.g. selling an
  expired card).
- **Consequences**: Deterministic behavior, auditability, prevention of double
  sales and ghost usage.
