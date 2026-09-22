# `client-api` — 1.0.0

The contract the client system reads. Derived once, here, so that neither side derives its
own shape from the spec and disagrees with the other.

**One contract, because one server has a consumer elsewhere.** The `worker` server's only
consumer is the API server in the same repository, so it is cut no contract: a job payload
and the database schema are closed inside the repository.

Every route sits under the `/v1` prefix the engine already declares.

## Shared by every route

| | |
|---|---|
| `x-ort-client-id` | the caller's client key |
| `x-ort-timestamp` | epoch seconds, accepted within 300 seconds of the server's clock in either direction |
| `x-ort-signature` | hex HMAC-SHA256 over `timestamp + "." + rawBody`, under the client's secret. Either of a client's two secrets is accepted while a rotation is under way |
| `Idempotency-Key` | required on every POST that creates a run |

**Nothing is reachable without those headers.** There is no public route, no health check
and no guest allow-list.

## Routes

| method | path | renderer | request | response | caller |
|---|---|---|---|---|---|
| `POST` | `/v1/asset-media-extractions` | `AssetMediaExtractionPostRenderer` | `AssetMediaExtractionRequest` | `AiRunAcceptedResponse` | any client whose record is active, with a valid signature |
| `GET` | `/v1/ai-runs/:runKey` | `AiRunGetRenderer` | path `runKey`, optional `?expand=steps` | `AiRunResponse` | the client that created the run. Another client's run key answers as though it did not exist |
| `GET` | `/v1/ai-runs` | `AiRunsGetRenderer` | `?statusName=&runCategoryName=&correlationId=&stalledForSeconds=&limit=&cursor=` | `AiRunsResponse` | the client system, its own runs only. The scope is bound from the signature; no request parameter widens it |
| `POST` | `/v1/ai-runs/:runKey/cancellations` | `AiRunCancellationPostRenderer` | path `runKey`, empty body | `AiRunCancellationResponse` | the client that created the run. Another client's run answers as though it did not exist |

## Callback

The one request that runs the other way. It is not a route of this server.

| method | target | body | signature |
|---|---|---|---|
| `POST` | the client's registered callback URL | the same body `GET /v1/ai-runs/:runKey` returns | signed as a request is, plus the run key in a header |

**A callback URL that does not match the client's registered prefix is not called at all.**

## Shapes

### `AssetMediaExtractionRequest`

| Field | Holds |
|---|---|
| `externalRef` | the caller's own object key. Never interpreted |
| `subjectLabel` | one human-readable line, echoed back untouched |
| `correlationId` | groups the runs belonging to one business object |
| `callbackUrl` | must start with the client's registered prefix |
| `asset` | the category slugs and the province the asset sits in |
| `fieldSchema[]` | `path`, `label`, `valueKind`, `isRequired`, and per kind `unit` / `maxLength` / `options[]` |
| `media[]` | `mediaKey`, `mediaCategoryName`, `url`, `mimeType`, `byteSize` |
| `mediaSignature` | derived from the media, and echoed back |

`valueKind` describes the shape of a value the caller's own schema defines and has no table
behind it. `mediaCategoryName` names a row in a master table this service keeps.

### `AiRunAcceptedResponse`

`runKey`, `runCategoryName`, `statusName` (always `queued`), `acceptedAt`. Nothing else.

### `AiRunResponse`

| Field | Holds |
|---|---|
| `runKey`, `runCategoryName`, `externalRef`, `subjectLabel`, `correlationId` | echoed from the request |
| `statusName` | one of `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `engine` | which loop and model produced the result, and the version of the confidence formula that scored it |
| `usage` | `modelCallCount`, `inputTokenCount`, `outputTokenCount` |
| `result` | per service. `null` unless the run succeeded |
| `failure` | `{ reasonCode, parameters }`. `null` unless the run failed |
| `steps` | only when `?expand=steps` was asked for |

### The asset-media-extraction `result`

| Field | Holds |
|---|---|
| `fields[]` | `path`, `value`, `fieldStateName`, `suggestionConfidence`, `reason`, `sourceMediaKeys[]`, `agreement` |
| `missingFieldPaths[]` | required fields no majority settled |
| `unreadableMediaKeys[]` | what was fetched but could not be read |
| `mediaSignature` | echoed back |

**`suggestionConfidence`, not `confidence`.** The client's own interface already carries a
`confidenceScore` meaning an organisation match percentage, and the two will sit on one
screen.

### `AiRunsResponse`

`runs[]` — per run: `runKey`, `runCategoryName`, `subjectLabel`, `correlationId`,
`externalRef`, `statusName`, the decomposed running state (`stepName`, `stepIndex`,
`readingIndex`, `readingCount`, `progressRatio`), `elapsedSeconds`, `modelCallCount`,
`inputTokenCount`, `acceptedAt` — plus `nextCursor`.

### `AiRunCancellationResponse`

The run's `statusName` after the request, which is its terminal state where it had already
reached one.

## How a request is refused

Every refusal below happens **before a run is created**. A run that was accepted and later
failed is a `200` carrying a `failure` — the reason codes at the end of this file — not one
of these.

| Status | When |
|---|---|
| `401` | no signature, a signature that does not verify, or a timestamp more than 300 seconds from the server's clock |
| `403` | the signature verified, but that client's record is switched off |
| `404` | the run named by the path belongs to another client. Deliberately not `403`: a refusal that admitted the run existed would confirm another client's data |
| `409` | the same idempotency key with a different body. The first run is unchanged |
| `422` | a required field is missing, or a field's value is not one the schema accepts |

`401` and `403` are told apart on purpose: the first says the caller is not who it claims,
the second says it is and may not. A caller that cannot tell them apart retries a rotation
failure forever against a client somebody switched off.

## Failure reason codes

A failure is a code and its parameters. **This service returns no display wording**; the
client system builds the sentence people read.

| Code | When |
|---|---|
| `MEDIA_FETCH_FAILED` | the URL could not be fetched, or its host is not on the allow-list |
| `MEDIA_LIMIT_EXCEEDED` | over the byte cap, or more media than the limit. `parameters` carries the limit |
| `MEDIA_UNSUPPORTED` | a medium of a kind this version does not handle, named rather than ignored |
| `MEDIA_UNREADABLE` | nothing could be read from what was fetched |
| `PROVIDER_CALL_FAILED` | the provider errored or declined. Not retried |
| `OUTPUT_INVALID` | every reading failed validation |
| `TIME_LIMIT_EXCEEDED` | the run was still going past the time limit |
